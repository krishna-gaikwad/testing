const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FileType = require('file-type');
const mongoose = require('mongoose');

const { requireAuth, requireRole } = require('../middleware/auth');
const { isInsideBounds, nearestArea, haversineDistanceKm, cityConfig } = require('../config/city.config');
const { isValidCategory, CATEGORIES } = require('../config/categories');
const { calculateDeadlines } = require('../services/deadlineService');
const {
  ComplaintStore,
  EvidenceStore,
  EmergencyFlagStore,
  WorkflowEventStore,
  NotificationStore,
  SupportStore
} = require('../services/memoryStore');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage with random filename to avoid collisions / directory traversal
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomHex}${ext}`);
  }
});

// Multer initial filter (allow up to 15 MB to accommodate MP4)
const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15 MB max limit
  }
});

/**
 * Generate tracking ID: NS-YYYY-XXXXXX
 */
function generateTrackingId() {
  const year = new Date().getFullYear();
  const randomSix = Math.floor(100000 + Math.random() * 900000);
  return `NS-${year}-${randomSix}`;
}

/**
 * Allowed MIME types and max sizes
 */
const ALLOWED_MIME_TYPES = {
  'image/jpeg': 5 * 1024 * 1024, // 5MB
  'image/png': 5 * 1024 * 1024,
  'image/webp': 5 * 1024 * 1024,
  'video/mp4': 15 * 1024 * 1024 // 15MB
};

/**
 * POST /api/complaints
 * Citizen only. Multipart/form-data.
 * Requires at least ONE valid evidence file with magic byte verification.
 */
router.post('/', requireAuth, requireRole('citizen'), upload.array('evidence', 5), async (req, res) => {
  const uploadedFiles = req.files || [];
  const filesToDelete = [...uploadedFiles];

  // Helper to safely clean up uploaded files if validation fails
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
      locationSource = 'manual',
      isPossibleEmergency,
      emergencyConcern,
      area: requestedArea
    } = req.body;

    const citizenId = (req.user._id || req.user.id).toString();

    // 1. Mandatory Evidence File Check
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({
        error: 'At least one evidence file (photo or video) is mandatory for submitting a complaint.',
        errorCode: 'EVIDENCE_REQUIRED'
      });
    }

    // 2. Real File Content (Magic Bytes) & Size Validation
    const verifiedFiles = [];
    for (const file of uploadedFiles) {
      const buffer = fs.readFileSync(file.path);
      const fileTypeResult = await FileType.fromBuffer(buffer);

      if (!fileTypeResult || !ALLOWED_MIME_TYPES[fileTypeResult.mime]) {
        cleanupFiles();
        return res.status(400).json({
          error: `Invalid file content for "${file.originalname}". Only genuine JPG, PNG, WEBP (up to 5MB) or MP4 (up to 15MB) files are permitted.`,
          errorCode: 'INVALID_FILE_TYPE',
          params: { filename: file.originalname }
        });
      }

      const maxSize = ALLOWED_MIME_TYPES[fileTypeResult.mime];
      if (file.size > maxSize) {
        cleanupFiles();
        const limitMb = maxSize / (1024 * 1024);
        return res.status(400).json({
          error: `File "${file.originalname}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the maximum allowed size of ${limitMb} MB for ${fileTypeResult.mime}.`,
          errorCode: 'FILE_TOO_LARGE',
          params: { filename: file.originalname, limitMb }
        });
      }

      verifiedFiles.push({
        path: file.path,
        mimeType: fileTypeResult.mime
      });
    }

    // 3. Department & Category Validation
    if (!department || !['waste', 'roads', 'water', 'others'].includes(department)) {
      cleanupFiles();
      return res.status(400).json({
        error: 'A valid department is required (waste, roads, water, others).',
        errorCode: 'INVALID_DEPARTMENT'
      });
    }

    if (!category || !isValidCategory(department, category)) {
      cleanupFiles();
      return res.status(400).json({
        error: `Category "${category}" is not valid for department "${department}".`,
        errorCode: 'INVALID_CATEGORY',
        params: { category, department }
      });
    }

    // 4. "Others" Category Constraint: REQUIRES custom title and description
    const isOthersCategory = category.toLowerCase() === 'others';
    if (isOthersCategory) {
      if (!title || title.trim().length < 3) {
        cleanupFiles();
        return res.status(400).json({
          error: 'Complaints under category "Others" require a specific, descriptive title (minimum 3 characters).',
          errorCode: 'OTHERS_TITLE_REQUIRED'
        });
      }
      if (!description || description.trim().length < 10) {
        cleanupFiles();
        return res.status(400).json({
          error: 'Complaints under category "Others" require a detailed description (minimum 10 characters).',
          errorCode: 'OTHERS_DESCRIPTION_REQUIRED'
        });
      }
    } else {
      if (!title || title.trim().length < 3) {
        cleanupFiles();
        return res.status(400).json({
          error: 'Title is required (minimum 3 characters).',
          errorCode: 'FIELD_REQUIRED',
          params: { field: 'Title' }
        });
      }
      if (!description || description.trim().length < 5) {
        cleanupFiles();
        return res.status(400).json({
          error: 'Description is required (minimum 5 characters).',
          errorCode: 'FIELD_REQUIRED',
          params: { field: 'Description' }
        });
      }
    }

    // 5. Geolocation & Pune Bounds Validation
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      cleanupFiles();
      return res.status(400).json({
        error: 'Valid numeric latitude and longitude coordinates are required.',
        errorCode: 'FIELD_REQUIRED',
        params: { field: 'Coordinates' }
      });
    }

    // PUNE BOUNDS CHECK
    if (!isInsideBounds(parsedLat, parsedLng)) {
      cleanupFiles();
      const refusalMsg = 'This location is outside the Pune service area. Please correct the pin.';

      // Record refusal in the append-only audit trail
      await WorkflowEventStore.create({
        complaint: 'OUT_OF_BOUNDS_ATTEMPT',
        actor: citizenId,
        actorRole: req.user.role,
        action: 'Submit Complaint',
        outcome: 'refused',
        fromStatus: 'None',
        toStatus: 'Submitted',
        reason: `Coordinates [${parsedLat}, ${parsedLng}] outside Pune boundary`,
        refusalReason: refusalMsg
      });

      return res.status(400).json({
        error: refusalMsg,
        errorCode: 'OUTSIDE_PUNE_BOUNDS',
        bounds: cityConfig.bounds
      });
    }

    // 6. Pune Locality Area Resolution
    let finalArea = null;
    const configuredAreaNames = (cityConfig.areas || []).map(a => a.name.toLowerCase());

    if (requestedArea && configuredAreaNames.includes(requestedArea.trim().toLowerCase())) {
      // Citizen provided a recognized locality
      const matched = cityConfig.areas.find(a => a.name.toLowerCase() === requestedArea.trim().toLowerCase());
      finalArea = matched ? matched.name : requestedArea.trim();
    } else {
      // Auto-assign nearest Pune locality centroid
      const nearest = nearestArea(parsedLat, parsedLng);
      finalArea = nearest ? nearest.name : null;
    }

    // 7. Emergency Flag Validation
    const emergencyBool = isPossibleEmergency === 'true' || isPossibleEmergency === true;
    if (emergencyBool && (!emergencyConcern || !emergencyConcern.trim())) {
      cleanupFiles();
      return res.status(400).json({
        error: 'When flagging as a possible emergency, you must describe the specific immediate concern.',
        errorCode: 'EMERGENCY_CONCERN_REQUIRED'
      });
    }

    // 8. Compute Deadlines using Workflow Engine helper
    const deadlines = calculateDeadlines(department, 'Normal');
    const trackingId = generateTrackingId();

    // 9. Save Complaint
    const complaintData = {
      trackingId,
      citizen: citizenId,
      department,
      category,
      title: title.trim(),
      description: description.trim(),
      area: finalArea,
      status: 'Submitted',
      priority: 'Normal',
      isPossibleEmergency: emergencyBool,
      isCriticalVerified: false,
      supportCount: 1,
      assignedTo: null,
      reopenCount: 0,
      initialResponseDue: deadlines.initialResponseDue,
      resolutionDue: deadlines.resolutionDue,
      isOverdue: false,
      escalationLevel: 0,
      location: {
        lat: parsedLat,
        lng: parsedLng,
        address: (address || '').trim(),
        source: ['gps', 'exif', 'map_pin', 'manual'].includes(locationSource) ? locationSource : 'manual'
      }
    };

    let newComplaint;
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      newComplaint = await Complaint.create(complaintData);
    } else {
      newComplaint = await ComplaintStore.create(complaintData);
    }

    const complaintId = (newComplaint._id || newComplaint.id).toString();

    // 10. Save Evidence records
    for (const vFile of verifiedFiles) {
      const relativePath = path.relative(path.join(__dirname, '../../'), vFile.path);
      const evData = {
        complaint: complaintId,
        filePath: relativePath,
        mimeType: vFile.mimeType,
        kind: 'initial',
        uploader: citizenId
      };

      if (mongoose.connection.readyState === 1) {
        const Evidence = require('../models/Evidence');
        await Evidence.create(evData);
      } else {
        await EvidenceStore.create(evData);
      }
    }

    // 11. Append "Complaint submitted" WorkflowEvent
    await WorkflowEventStore.create({
      complaint: complaintId,
      actor: citizenId,
      actorRole: 'citizen',
      action: 'Submit Complaint',
      outcome: 'accepted',
      fromStatus: 'None',
      toStatus: 'Submitted',
      reason: 'Citizen submitted grievance'
    });

    // 12. If Emergency is flagged, create EmergencyFlag (pending) & notify reviewers
    // MUST NOT become Critical automatically!
    if (emergencyBool) {
      const flagData = {
        complaint: complaintId,
        flaggedBy: citizenId,
        concern: emergencyConcern.trim(),
        verificationStatus: 'pending',
        verifiedBy: null,
        reason: null
      };

      if (mongoose.connection.readyState === 1) {
        const EmergencyFlag = require('../models/EmergencyFlag');
        await EmergencyFlag.create(flagData);
      } else {
        await EmergencyFlagStore.create(flagData);
      }

      // Notify Reviewers of pending unverified emergency
      await NotificationStore.create({
        user: null,
        message: `[Emergency Alert - Unverified] New grievance ${trackingId} in area '${finalArea}' was flagged by citizen for potential emergency review.`,
        complaint: complaintId,
        targetRoles: ['reviewer']
      });
    }

    return res.status(201).json({
      message: 'Complaint submitted successfully',
      complaint: {
        id: complaintId,
        trackingId: newComplaint.trackingId,
        title: newComplaint.title,
        department: newComplaint.department,
        category: newComplaint.category,
        status: newComplaint.status,
        priority: newComplaint.priority,
        area: newComplaint.area,
        isPossibleEmergency: newComplaint.isPossibleEmergency,
        isCriticalVerified: newComplaint.isCriticalVerified,
        supportCount: newComplaint.supportCount,
        initialResponseDue: newComplaint.initialResponseDue,
        resolutionDue: newComplaint.resolutionDue,
        createdAt: newComplaint.createdAt
      }
    });
  } catch (error) {
    cleanupFiles();
    console.error('Error submitting complaint:', error);
    return res.status(500).json({ error: 'Server failed to process complaint submission.' });
  }
});

/**
 * GET /api/complaints/mine
 * Citizen lists their submitted complaints
 */
router.get('/mine', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const citizenId = (req.user._id || req.user.id).toString();
    let complaints = [];

    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      complaints = await Complaint.find({ citizen: citizenId }).sort({ createdAt: -1 });
    } else {
      complaints = await ComplaintStore.find({ citizen: citizenId });
    }

    res.status(200).json({ complaints });
  } catch (error) {
    console.error('Error fetching citizen complaints:', error);
    res.status(500).json({ error: 'Failed to fetch complaints.' });
  }
});

/**
 * GET /api/complaints/nearby?lat=&lng=&category=&description=
 * Citizen nearby duplicate suggestions within NEARBY_RADIUS_METERS (default 100m)
 * Same category, haversine distance, description bonus, excludes Rejected, public-safe fields only.
 */
router.get('/nearby', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const category = (req.query.category || '').trim();
    const queryDesc = (req.query.description || '').toLowerCase();
    const userId = (req.user._id || req.user.id).toString();

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
    }

    const radiusMeters = parseInt(process.env.NEARBY_RADIUS_METERS || '100', 10);

    let complaints = [];
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      const query = { status: { $ne: 'Rejected' } };
      if (category) query.category = category;
      complaints = await Complaint.find(query);
    } else {
      const all = await ComplaintStore.find({});
      complaints = all.filter((c) => c.status !== 'Rejected' && (!category || c.category === category));
    }

    // Tokenize words for description bonus
    const queryWords = queryDesc.split(/\W+/).filter((w) => w.length >= 3);

    const matches = [];

    for (const c of complaints) {
      const cLat = c.location?.lat !== undefined ? c.location.lat : c.lat;
      const cLng = c.location?.lng !== undefined ? c.location.lng : c.lng;
      if (!cLat || !cLng) continue;

      const distKm = haversineDistanceKm(lat, lng, cLat, cLng);
      const distMeters = distKm * 1000;

      if (distMeters <= radiusMeters) {
        // Calculate description similarity bonus
        const cText = `${c.title || ''} ${c.description || ''}`.toLowerCase();
        let wordMatches = 0;
        for (const qw of queryWords) {
          if (cText.includes(qw)) wordMatches++;
        }

        const cid = (c._id || c.id).toString();
        // Check if current user has supported this
        const hasSupported = await SupportStore.findOne({ complaint: cid, citizen: userId });
        const isReporter = (c.citizen?._id || c.citizen)?.toString() === userId;

        const fullDesc = c.description || c.title || '';
        const shortDesc = fullDesc.length > 120 ? `${fullDesc.slice(0, 117)}...` : fullDesc;

        matches.push({
          id: cid,
          trackingId: c.trackingId,
          title: c.title,
          category: c.category,
          department: c.department,
          description: shortDesc,
          area: c.area || 'Pune',
          lat: Number(cLat.toFixed(3)),
          lng: Number(cLng.toFixed(3)),
          distanceMeters: Math.round(distMeters),
          status: c.status,
          priority: c.priority || 'Normal',
          supportCount: c.supportCount || 1,
          isPossibleEmergency: Boolean(c.isPossibleEmergency),
          isCriticalVerified: Boolean(c.isCriticalVerified),
          hasSupported: Boolean(hasSupported || isReporter),
          isOwnComplaint: isReporter,
          wordMatches,
          createdAt: c.createdAt
        });
      }
    }

    // Sort: closer distance and higher word match bonus
    matches.sort((a, b) => {
      const scoreA = a.distanceMeters - a.wordMatches * 8;
      const scoreB = b.distanceMeters - b.wordMatches * 8;
      return scoreA - scoreB;
    });

    res.status(200).json({
      radiusMeters,
      count: matches.length,
      suggestions: matches
    });
  } catch (error) {
    console.error('Error fetching nearby complaints:', error);
    res.status(500).json({ error: 'Failed to find nearby suggestions.' });
  }
});

/**
 * GET /api/complaints/:id
 * Owner or authorized official. Includes history without exposing refused-attempt details to citizens.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const complaintId = req.params.id;
    let complaint;

    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      complaint = await Complaint.findById(complaintId);
    } else {
      complaint = await ComplaintStore.findById(complaintId);
    }

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }

    const user = req.user;
    const userId = (user._id || user.id).toString();
    const userRole = user.role;
    const userDept = user.department;

    const complaintCitizenId = (complaint.citizen._id || complaint.citizen).toString();

    // Access authorization check
    const isOwner = userRole === 'citizen' && userId === complaintCitizenId;
    const isReviewerOrSupervisor = ['reviewer', 'supervisor'].includes(userRole);
    const isAuthorizedOfficer = userRole === 'officer' && (!userDept || userDept === complaint.department);

    if (!isOwner && !isReviewerOrSupervisor && !isAuthorizedOfficer) {
      return res.status(403).json({ error: 'Forbidden: You do not have permission to view this complaint.' });
    }

    // Fetch evidence files
    let evidence = [];
    if (mongoose.connection.readyState === 1) {
      const Evidence = require('../models/Evidence');
      evidence = await Evidence.find({ complaint: complaintId });
    } else {
      evidence = await EvidenceStore.find({ complaint: complaintId });
    }

    // Fetch audit history
    let allEvents = [];
    if (mongoose.connection.readyState === 1) {
      const WorkflowEvent = require('../models/WorkflowEvent');
      allEvents = await WorkflowEvent.find({ complaint: complaintId }).sort({ createdAt: 1 });
    } else {
      allEvents = await WorkflowEventStore.find({ complaint: complaintId });
    }

    // PRIVACY / ACCESS RULE:
    // Citizens see ONLY accepted & system events; refused attempt details are NOT exposed to citizens.
    const history = userRole === 'citizen'
      ? allEvents.filter(e => e.outcome !== 'refused')
      : allEvents;

    res.status(200).json({
      complaint,
      evidence: evidence.map(e => ({
        id: e._id || e.id,
        kind: e.kind,
        mimeType: e.mimeType,
        createdAt: e.createdAt,
        downloadUrl: `/api/evidence/${e._id || e.id}`
      })),
      history
    });
  } catch (error) {
    console.error('Error fetching complaint details:', error);
    res.status(500).json({ error: 'Failed to fetch complaint details.' });
  }
});

/**
 * POST /api/complaints/:id/reopen-request
 * Citizen requests reopening within 7 days of resolvedAt with mandatory reason.
 * After 7 days, backend strictly refuses (and records refusal in audit trail).
 */
router.post('/:id/reopen-request', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const complaintId = req.params.id;
    const { reason } = req.body;
    const citizenId = (req.user._id || req.user.id).toString();

    let complaint;
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      complaint = await Complaint.findById(complaintId);
    } else {
      complaint = await ComplaintStore.findById(complaintId);
    }

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }

    // Ownership check
    const complaintCitizenId = (complaint.citizen._id || complaint.citizen).toString();
    if (complaintCitizenId !== citizenId) {
      return res.status(403).json({ error: 'Forbidden: You can only request reopening for your own complaints.' });
    }

    // Must be in Resolved status
    if (complaint.status !== 'Resolved') {
      return res.status(400).json({
        error: `Cannot request reopening: Complaint is in status "${complaint.status}", not "Resolved".`,
        errorCode: 'NOT_RESOLVED',
        params: { status: complaint.status }
      });
    }

    // Mandatory reason check
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'A mandatory reason is required to request reopening a resolved complaint.',
        errorCode: 'REOPEN_REASON_REQUIRED'
      });
    }

    // 7-day window rule check
    const resolvedAtTime = complaint.resolvedAt ? new Date(complaint.resolvedAt).getTime() : 0;
    const nowTime = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (!resolvedAtTime || nowTime - resolvedAtTime > sevenDaysMs) {
      const refusalReason = 'Reopening request window expired. Reopening requests must be submitted within 7 days of resolution.';
      
      // Log refusal in audit history
      await WorkflowEventStore.create({
        complaint: complaintId,
        actor: citizenId,
        actorRole: 'citizen',
        action: 'Request Reopening',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        reason: reason.trim(),
        refusalReason
      });

      return res.status(400).json({
        error: refusalReason,
        errorCode: 'REOPEN_WINDOW_EXPIRED',
        resolvedAt: complaint.resolvedAt
      });
    }

    // Save reopen request on complaint
    complaint.reopenRequest = {
      requested: true,
      reason: reason.trim(),
      requestedAt: new Date(),
      decision: 'pending',
      decisionReason: null,
      decidedBy: null
    };

    if (complaint.save && typeof complaint.save === 'function') {
      await complaint.save();
    } else {
      await ComplaintStore.update(complaintId, { reopenRequest: complaint.reopenRequest });
    }

    // Log accepted request in WorkflowEvent
    await WorkflowEventStore.create({
      complaint: complaintId,
      actor: citizenId,
      actorRole: 'citizen',
      action: 'Request Reopening',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: reason.trim()
    });

    // Notify Reviewers of pending reopening request
    await NotificationStore.create({
      user: null,
      message: `[Reopen Request] Citizen submitted a reopening request for complaint ${complaint.trackingId}. Reason: "${reason.trim()}".`,
      messageKey: 'REOPEN_REQUESTED',
      params: { trackingId: complaint.trackingId, reason: reason.trim() },
      complaint: complaintId,
      targetRoles: ['reviewer']
    });

    return res.status(200).json({
      message: 'Reopening request submitted for reviewer evaluation.',
      complaint
    });
  } catch (error) {
    console.error('Error submitting reopen request:', error);
    res.status(500).json({ error: 'Failed to submit reopen request.' });
  }
});

/**
 * POST /api/complaints/:id/support
 * Citizen supports an existing grievance.
 * 1 support per citizen per issue (unique index, friendly 409 on repeat).
 * Reporter counts as 1. supportCount = distinct citizens.
 * Priority rule: Normal below 5 distinct citizens; High at 5 or more.
 * Recomputes deadlines and logs a system event upon auto-escalation.
 */
router.post('/:id/support', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const complaintId = req.params.id;
    const userId = (req.user._id || req.user.id).toString();

    let complaint;
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      complaint = await Complaint.findById(complaintId);
    } else {
      complaint = await ComplaintStore.findById(complaintId);
    }

    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found.' });
    }

    if (complaint.status === 'Rejected') {
      return res.status(400).json({ error: 'Cannot support a rejected complaint.' });
    }

    const reporterId = (complaint.citizen?._id || complaint.citizen)?.toString();
    if (reporterId === userId) {
      return res.status(409).json({
        error: 'You are the original reporter of this grievance (your support is already counted).',
        errorCode: 'CANNOT_SUPPORT_OWN'
      });
    }

    // Check if citizen already supported
    const existing = await SupportStore.findOne({ complaint: complaintId, citizen: userId });
    if (existing) {
      return res.status(409).json({
        error: 'You have already supported this grievance.',
        errorCode: 'ALREADY_SUPPORTED'
      });
    }

    // Record support
    try {
      await SupportStore.create({
        complaint: complaintId,
        citizen: userId,
        createdAt: new Date()
      });
    } catch (err) {
      if (err.code === 11000 || err.message?.includes('Duplicate')) {
        return res.status(409).json({
          error: 'You have already supported this grievance.',
          errorCode: 'ALREADY_SUPPORTED'
        });
      }
      throw err;
    }

    // Calculate distinct supporters: increment current count and ensure at least distinct supporters + 1
    const distinctSupporters = await SupportStore.countDocuments({ complaint: complaintId });
    const newSupportCount = Math.max((complaint.supportCount || 1) + 1, distinctSupporters + 1);
    complaint.supportCount = newSupportCount;

    let priorityEscalated = false;
    // Priority Rule: Normal below 5; High at 5 or more
    if (newSupportCount >= 5 && complaint.priority === 'Normal') {
      complaint.priority = 'High';
      priorityEscalated = true;

      // Recompute deadlines via engine helper
      const updatedDeadlines = calculateDeadlines(complaint.department, 'High');
      complaint.initialResponseDue = updatedDeadlines.initialResponseDue;
      complaint.resolutionDue = updatedDeadlines.resolutionDue;

      // Log system event in append-only audit trail
      await WorkflowEventStore.create({
        complaint: complaintId,
        actor: userId,
        actorRole: 'system',
        action: 'Priority Auto-Escalation',
        outcome: 'system',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        reason: `Priority escalated to High: Grievance reached ${newSupportCount} distinct citizen supporters.`
      });
    }

    if (complaint.save && typeof complaint.save === 'function') {
      await complaint.save();
    } else {
      await ComplaintStore.update(complaintId, {
        supportCount: complaint.supportCount,
        priority: complaint.priority,
        initialResponseDue: complaint.initialResponseDue,
        resolutionDue: complaint.resolutionDue
      });
    }

    res.status(200).json({
      message: 'Thank you for supporting this community grievance!',
      supportCount: complaint.supportCount,
      priority: complaint.priority,
      priorityEscalated
    });
  } catch (error) {
    console.error('Error supporting complaint:', error);
    res.status(500).json({ error: 'Failed to record grievance support.' });
  }
});

module.exports = router;
