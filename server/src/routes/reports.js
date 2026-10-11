const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FileType = require('file-type');

const { requireAuth, requireRole } = require('../middleware/auth');
const { isInsideServiceArea, nearestArea, haversineDistanceKm, cityConfig } = require('../config/city.config');
const { isValidCategory } = require('../config/categories');
const { calculateDeadlines } = require('../services/deadlineService');
const {
  ComplaintStore,
  EvidenceStore,
  WorkflowEventStore,
  NotificationStore,
  EmergencyFlagStore,
  PossibleDuplicateStore
} = require('../services/memoryStore');
const { prisma } = require('../db/sqlite');
const { sseHub } = require('../services/sseHub');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomHex}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }
});

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 5 * 1024 * 1024,
  'image/png': 5 * 1024 * 1024,
  'image/webp': 5 * 1024 * 1024,
  'video/mp4': 15 * 1024 * 1024
};

function generateTrackingId() {
  const year = new Date().getFullYear();
  const randomSix = Math.floor(100000 + Math.random() * 900000);
  return `NS-${year}-${randomSix}`;
}

/**
 * POST /api/reports
 * Primary submission endpoint for quick form, guided help, and help assistant.
 */
router.post('/', requireAuth, requireRole('citizen'), upload.array('evidence', 5), async (req, res) => {
  const uploadedFiles = req.files || [];
  const filesToDelete = [...uploadedFiles];

  const cleanupFiles = () => {
    for (const f of filesToDelete) {
      if (fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
      }
    }
  };

  try {
    const {
      department,
      category,
      title,
      description,
      lat,
      lng,
      address = '',
      locationSource = 'MANUAL',
      locationConfirmedAt,
      isPossibleEmergency,
      emergencyConcern,
      area: requestedArea
    } = req.body;

    const citizenId = (req.user._id || req.user.id).toString();

    // 1. Mandatory Evidence File Check
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'At least one evidence file (photo or video) is mandatory for submitting a report.',
        errorCode: 'EVIDENCE_REQUIRED',
        message: 'At least one evidence file (photo or video) is mandatory for submitting a report.'
      });
    }

    // 2. Magic bytes validation
    const verifiedFiles = [];
    for (const file of uploadedFiles) {
      const buffer = fs.readFileSync(file.path);
      const fileTypeResult = await FileType.fromBuffer(buffer);

      if (!fileTypeResult || !ALLOWED_MIME_TYPES[fileTypeResult.mime]) {
        cleanupFiles();
        return res.status(400).json({
          ok: false,
          error: `Invalid file content for "${file.originalname}". Only genuine JPG, PNG, WEBP or MP4 files are permitted.`,
          errorCode: 'INVALID_FILE_TYPE',
          params: { filename: file.originalname }
        });
      }

      const maxSize = ALLOWED_MIME_TYPES[fileTypeResult.mime];
      if (file.size > maxSize) {
        cleanupFiles();
        const limitMb = maxSize / (1024 * 1024);
        return res.status(400).json({
          ok: false,
          error: `File "${file.originalname}" exceeds the maximum allowed size of ${limitMb} MB.`,
          errorCode: 'FILE_TOO_LARGE',
          params: { filename: file.originalname, limitMb }
        });
      }

      verifiedFiles.push({
        path: file.path,
        mimeType: fileTypeResult.mime
      });
    }

    // 3. Department & Category validation
    if (!department || !['waste', 'roads', 'water', 'others'].includes(department)) {
      cleanupFiles();
      return res.status(400).json({
        ok: false,
        error: 'A valid department is required (waste, roads, water, others).',
        errorCode: 'INVALID_DEPARTMENT'
      });
    }

    if (!category || !isValidCategory(department, category)) {
      cleanupFiles();
      return res.status(400).json({
        ok: false,
        error: `Category "${category}" is not valid for department "${department}".`,
        errorCode: 'INVALID_CATEGORY',
        params: { category, department }
      });
    }

    // 4. "Others" constraints
    const isOthers = category.toLowerCase() === 'others';
    if (isOthers) {
      if (!title || title.trim().length < 3) {
        cleanupFiles();
        return res.status(400).json({
          ok: false,
          error: 'Complaints under category "Others" require a specific descriptive title (minimum 3 characters).',
          errorCode: 'OTHERS_TITLE_REQUIRED'
        });
      }
      if (!description || description.trim().length < 10) {
        cleanupFiles();
        return res.status(400).json({
          ok: false,
          error: 'Complaints under category "Others" require a detailed description (minimum 10 characters).',
          errorCode: 'OTHERS_DESCRIPTION_REQUIRED'
        });
      }
    } else {
      if (!title || title.trim().length < 3) {
        cleanupFiles();
        return res.status(400).json({
          ok: false,
          error: 'Title is required (minimum 3 characters).',
          errorCode: 'FIELD_REQUIRED',
          params: { field: 'Title' }
        });
      }
      if (!description || description.trim().length < 5) {
        cleanupFiles();
        return res.status(400).json({
          ok: false,
          error: 'Description is required (minimum 5 characters).',
          errorCode: 'FIELD_REQUIRED',
          params: { field: 'Description' }
        });
      }
    }

    // 5. Pune Service Area Validation
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      cleanupFiles();
      return res.status(400).json({
        ok: false,
        error: 'Valid numeric latitude and longitude coordinates are required.',
        errorCode: 'FIELD_REQUIRED',
        params: { field: 'Coordinates' }
      });
    }

    if (!isInsideServiceArea(parsedLat, parsedLng)) {
      cleanupFiles();
      const refusalMsg = 'This location is outside the Pune service area. Please correct the pin.';
      await WorkflowEventStore.create({
        complaint: 'OUT_OF_BOUNDS_ATTEMPT',
        actor: citizenId,
        actorRole: req.user.role,
        action: 'Submit Report',
        outcome: 'refused',
        fromStatus: 'None',
        toStatus: 'Submitted',
        reason: `Coordinates [${parsedLat}, ${parsedLng}] outside Pune boundary`,
        refusalReason: refusalMsg
      });
      return res.status(400).json({
        ok: false,
        error: refusalMsg,
        errorCode: 'OUTSIDE_SERVICE_AREA',
        message: refusalMsg,
        bounds: cityConfig.bounds
      });
    }

    // 6. Locality Resolution
    let finalArea = null;
    const configuredNames = (cityConfig.areas || []).map(a => a.name.toLowerCase());
    if (requestedArea && configuredNames.includes(requestedArea.trim().toLowerCase())) {
      const match = cityConfig.areas.find(a => a.name.toLowerCase() === requestedArea.trim().toLowerCase());
      finalArea = match ? match.name : requestedArea.trim();
    } else {
      const nearest = nearestArea(parsedLat, parsedLng);
      finalArea = nearest ? nearest.name : 'Pune';
    }

    const emergencyBool = isPossibleEmergency === 'true' || isPossibleEmergency === true;
    if (emergencyBool && (!emergencyConcern || !emergencyConcern.trim())) {
      cleanupFiles();
      return res.status(400).json({
        ok: false,
        error: 'When flagging as a possible emergency, you must describe the specific immediate concern.',
        errorCode: 'EMERGENCY_CONCERN_REQUIRED'
      });
    }

    // 7. Duplicate Detection & Auto-Linking Logic
    const existingIssues = await ComplaintStore.find({});
    let strongMatch = null;
    let mediumMatch = null;
    let minDistanceMeters = Infinity;

    for (const ex of existingIssues) {
      if (ex.status === 'Rejected' || ex.status === 'REJECTED') continue;
      if (ex.department !== department || ex.category !== category) continue;

      const exLat = ex.location?.lat ?? ex.lat ?? ex.latitude;
      const exLng = ex.location?.lng ?? ex.lng ?? ex.longitude;
      if (!exLat || !exLng) continue;

      const distMeters = haversineDistanceKm(parsedLat, parsedLng, exLat, exLng) * 1000;
      if (distMeters <= 100) {
        // Strong Match: auto-link
        strongMatch = ex;
        minDistanceMeters = distMeters;
        break;
      } else if (distMeters <= 300) {
        if (distMeters < minDistanceMeters) {
          minDistanceMeters = distMeters;
          mediumMatch = ex;
        }
      }
    }

    const referenceId = `REP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    let issueToReturn = null;
    let linkedToExisting = false;

    if (strongMatch) {
      // Auto-link to existing issue
      linkedToExisting = true;
      const targetIssueId = (strongMatch._id || strongMatch.id).toString();

      // Check same-citizen unique constraint: citizen cannot hold 2 reports on same issue
      const reporterId = (strongMatch.citizen?._id || strongMatch.citizen)?.toString();
      if (reporterId === citizenId) {
        cleanupFiles();
        return res.status(409).json({
          ok: false,
          errorCode: 'ALREADY_REPORTED',
          error: 'You have already submitted a report for this exact grievance.',
          message: 'You have already submitted a report for this exact grievance.'
        });
      }

      // Check reports in SQLite
      const existingRep = prisma.report.findUnique({
        where: { issueId_citizenId: { issueId: targetIssueId, citizenId } }
      });
      if (existingRep) {
        cleanupFiles();
        return res.status(409).json({
          ok: false,
          errorCode: 'ALREADY_REPORTED',
          error: 'You have already submitted a report for this issue.',
          message: 'You have already submitted a report for this issue.'
        });
      }

      // Create Report linked to existing issue
      prisma.report.create({
        data: {
          referenceId,
          issueId: targetIssueId,
          citizenId,
          title: title.trim(),
          description: description.trim(),
          latitude: parsedLat,
          longitude: parsedLng,
          address: address.trim(),
          locationSource: locationSource || 'MANUAL',
          locationConfirmedAt: locationConfirmedAt ? new Date(locationConfirmedAt) : new Date(),
          isPossibleEmergency: emergencyBool,
          emergencyConcern: emergencyConcern ? emergencyConcern.trim() : null
        }
      });

      // Increment distinct citizen count and reportCount
      strongMatch.distinctCitizenCount = (strongMatch.distinctCitizenCount || 1) + 1;
      strongMatch.reportCount = (strongMatch.reportCount || 1) + 1;
      strongMatch.supportCount = strongMatch.distinctCitizenCount;

      // Check auto-escalation at 5+
      if (strongMatch.distinctCitizenCount >= 5 && strongMatch.priority === 'Normal') {
        strongMatch.priority = 'High';
        const deadlines = calculateDeadlines(strongMatch.department, 'High');
        strongMatch.initialResponseDue = deadlines.initialResponseDue;
        strongMatch.resolutionDue = deadlines.resolutionDue;
      }

      await ComplaintStore.update(targetIssueId, {
        distinctCitizenCount: strongMatch.distinctCitizenCount,
        reportCount: strongMatch.reportCount,
        supportCount: strongMatch.supportCount,
        priority: strongMatch.priority,
        initialResponseDue: strongMatch.initialResponseDue,
        resolutionDue: strongMatch.resolutionDue
      });

      issueToReturn = strongMatch;
    } else {
      // Create new Issue
      const deadlines = calculateDeadlines(department, 'Normal');
      const trackingId = generateTrackingId();
      const complaintData = {
        trackingId,
        publicRef: trackingId,
        citizen: citizenId,
        department,
        category,
        title: title.trim(),
        description: description.trim(),
        area: finalArea,
        areaName: finalArea,
        status: 'Submitted',
        priority: 'Normal',
        isPossibleEmergency: emergencyBool,
        emergencyStatus: emergencyBool ? 'POSSIBLE_UNVERIFIED' : 'NONE',
        isCriticalVerified: false,
        supportCount: 1,
        distinctCitizenCount: 1,
        reportCount: 1,
        assignedTo: null,
        reopenCount: 0,
        initialResponseDue: deadlines.initialResponseDue,
        responseDeadline: deadlines.initialResponseDue,
        resolutionDue: deadlines.resolutionDue,
        isOverdue: false,
        escalationLevel: 0,
        location: {
          lat: parsedLat,
          lng: parsedLng,
          address: address.trim(),
          source: locationSource || 'MANUAL'
        }
      };

      const newComplaint = await ComplaintStore.create(complaintData);
      const newIssueId = (newComplaint._id || newComplaint.id).toString();

      // Create Report linked to this new issue
      prisma.report.create({
        data: {
          referenceId,
          issueId: newIssueId,
          citizenId,
          title: title.trim(),
          description: description.trim(),
          latitude: parsedLat,
          longitude: parsedLng,
          address: address.trim(),
          locationSource: locationSource || 'MANUAL',
          locationConfirmedAt: locationConfirmedAt ? new Date(locationConfirmedAt) : new Date(),
          isPossibleEmergency: emergencyBool,
          emergencyConcern: emergencyConcern ? emergencyConcern.trim() : null
        }
      });

      issueToReturn = newComplaint;

      // If medium match found, create a PossibleDuplicate record
      if (mediumMatch) {
        const mediumId = (mediumMatch._id || mediumMatch.id).toString();
        await PossibleDuplicateStore.create({
          issueAId: newIssueId,
          issueBId: mediumId,
          similarity: Math.round((1 - minDistanceMeters / 500) * 100) / 100,
          distanceMeters: Math.round(minDistanceMeters)
        });
      }
    }

    const issueId = (issueToReturn._id || issueToReturn.id).toString();

    // 8. Save Evidence records
    for (const vFile of verifiedFiles) {
      const relativePath = path.relative(path.join(__dirname, '../../'), vFile.path);
      await EvidenceStore.create({
        complaint: issueId,
        issueId,
        filePath: relativePath,
        mimeType: vFile.mimeType,
        kind: 'INITIAL',
        uploader: citizenId,
        uploadedById: citizenId
      });
    }

    // 9. Append WorkflowEvent
    await WorkflowEventStore.create({
      complaint: issueId,
      actor: citizenId,
      actorRole: 'citizen',
      action: linkedToExisting ? 'Linked Report to Issue' : 'Submit Report',
      outcome: 'accepted',
      fromStatus: 'None',
      toStatus: issueToReturn.status,
      reason: linkedToExisting ? `Linked report ${referenceId} to existing issue` : 'Citizen submitted report'
    });

    // 10. Emergency flag handling
    if (emergencyBool) {
      await EmergencyFlagStore.create({
        issueId,
        flaggedById: citizenId,
        concern: emergencyConcern.trim(),
        status: 'PENDING'
      });

      await NotificationStore.create({
        user: null,
        message: `[Emergency Alert - Unverified] Grievance ${issueToReturn.trackingId || issueToReturn.publicRef} in '${finalArea}' was flagged for potential emergency review.`,
        complaint: issueId,
        targetRoles: ['reviewer', 'supervisor']
      });
    }

    sseHub.broadcast({
      type: 'REPORT_SUBMITTED',
      issueId,
      trackingId: issueToReturn.trackingId,
      linkedToExisting
    });

    return res.status(201).json({
      ok: true,
      message: linkedToExisting
        ? 'Your report was linked to an existing active civic issue at this location.'
        : 'Report submitted successfully.',
      referenceId,
      trackingId: issueToReturn.trackingId || referenceId,
      linkedToExisting,
      complaint: issueToReturn,
      issue: issueToReturn
    });
  } catch (error) {
    cleanupFiles();
    console.error('Error submitting report:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Server failed to process report submission.', message: 'Server failed to process report submission.' });
  }
});

/**
 * POST /api/reports/:id/unlink
 * Supervisor unlinks a Report from its current Issue and creates a new independent Issue.
 */
router.post('/:id/unlink', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor unlink report tool.';
      await WorkflowEventStore.create({
        complaint: req.params.id,
        actor: (req.user._id || req.user.id).toString(),
        actorRole: req.user.role,
        action: 'Unlink Report',
        outcome: 'refused',
        fromStatus: 'None',
        toStatus: 'None',
        refusalReason
      });
      return res.status(403).json({ ok: false, errorCode: 'SUPERVISOR_ONLY', error: refusalReason, message: refusalReason });
    }
    if (!['supervisor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ ok: false, errorCode: 'FORBIDDEN', error: 'Forbidden' });
    }

    const reportRefOrId = req.params.id;
    const report = prisma.report.findMany().find(r => r.id === reportRefOrId || r.referenceId === reportRefOrId);
    if (!report) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Report not found', message: 'Report not found' });
    }

    const originalIssue = await ComplaintStore.findById(report.issueId);
    if (!originalIssue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Original issue not found', message: 'Original issue not found' });
    }

    const user = req.user;
    const deadlines = calculateDeadlines(originalIssue.department, 'Normal');
    const newTrackingId = generateTrackingId();

    // Create new independent Issue for this report
    const newComplaint = await ComplaintStore.create({
      trackingId: newTrackingId,
      publicRef: newTrackingId,
      citizen: report.citizenId,
      department: originalIssue.department,
      category: originalIssue.category,
      title: report.title,
      description: report.description,
      area: originalIssue.area,
      status: 'Submitted',
      priority: 'Normal',
      isPossibleEmergency: Boolean(report.isPossibleEmergency),
      emergencyStatus: report.isPossibleEmergency ? 'POSSIBLE_UNVERIFIED' : 'NONE',
      supportCount: 1,
      distinctCitizenCount: 1,
      reportCount: 1,
      initialResponseDue: deadlines.initialResponseDue,
      resolutionDue: deadlines.resolutionDue,
      location: {
        lat: report.latitude,
        lng: report.longitude,
        address: report.address || '',
        source: report.locationSource || 'MANUAL'
      }
    });

    const newIssueId = (newComplaint._id || newComplaint.id).toString();

    // Update Report to point to new Issue
    prisma.report.delete({ where: { id: report.id } });
    prisma.report.create({
      data: {
        ...report,
        issueId: newIssueId
      }
    });

    // Recalculate original issue count
    originalIssue.distinctCitizenCount = Math.max(1, (originalIssue.distinctCitizenCount || 1) - 1);
    originalIssue.reportCount = Math.max(1, (originalIssue.reportCount || 1) - 1);
    originalIssue.supportCount = originalIssue.distinctCitizenCount;
    await ComplaintStore.update(originalIssue._id || originalIssue.id, {
      distinctCitizenCount: originalIssue.distinctCitizenCount,
      reportCount: originalIssue.reportCount,
      supportCount: originalIssue.supportCount
    });

    // Audit Event
    await WorkflowEventStore.create({
      complaint: originalIssue._id || originalIssue.id,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Unlink Report',
      outcome: 'accepted',
      fromStatus: originalIssue.status,
      toStatus: originalIssue.status,
      reason: `Supervisor unlinked report ${report.referenceId} into new issue ${newTrackingId}`
    });

    await WorkflowEventStore.create({
      complaint: newIssueId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Report Unlinked to New Issue',
      outcome: 'accepted',
      fromStatus: 'None',
      toStatus: 'Submitted',
      reason: `Separated from issue ${originalIssue.trackingId}`
    });

    // Notify citizen
    await NotificationStore.create({
      user: report.citizenId,
      complaint: newIssueId,
      message: `Your report ${report.referenceId} has been moved to its own dedicated grievance [${newTrackingId}].`,
      messageKey: 'STATUS_UPDATED',
      params: { trackingId: newTrackingId, status: 'Submitted', action: 'Unlink' }
    });

    res.status(200).json({
      ok: true,
      message: `Report ${report.referenceId} successfully unlinked into new issue ${newTrackingId}.`,
      originalIssue,
      newIssue: newComplaint
    });
  } catch (error) {
    console.error('Error unlinking report:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to unlink report', message: 'Failed to unlink report' });
  }
});

module.exports = router;
