const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FileType = require('file-type');
const mongoose = require('mongoose');

const { requireAuth, requireRole } = require('../middleware/auth');
const { STATES, TRANSITIONS, getDeadlineDurations } = require('../config/workflow.config');
const { attemptTransition } = require('../services/workflowEngine');
const { updatePriorityWithDeadlines } = require('../services/deadlineService');
const {
  ComplaintStore,
  EvidenceStore,
  WorkflowEventStore,
  EmergencyFlagStore,
  NotificationStore,
  UserStore,
  IssueNoteStore,
  memoryStore
} = require('../services/memoryStore');
const { db, prisma } = require('../db/sqlite');

async function verifyOptimisticLock(complaint, expectedVersion, actor, actionName, res) {
  if (expectedVersion !== undefined && expectedVersion !== null) {
    const currentVer = Number(complaint.version || 1);
    if (Number(expectedVersion) !== currentVer) {
      const refusalMsg = `Ticket changed: expected version ${expectedVersion}, but current version is ${currentVer}. Someone else updated this ticket. Reload.`;
      const complaintId = (complaint._id || complaint.id).toString();
      await WorkflowEventStore.create({
        complaint: complaintId,
        actor: (actor._id || actor.id).toString(),
        actorRole: actor.role || 'official',
        action: actionName || 'Update Attempt',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason: refusalMsg
      });
      res.status(409).json({
        ok: false,
        errorCode: 'TICKET_CHANGED',
        error: 'Someone else updated this ticket. Reload.',
        message: 'Someone else updated this ticket. Reload.',
        currentVersion: currentVer
      });
      return false;
    }
  }
  return true;
}

async function bumpComplaintVersion(complaint) {
  const newVer = (Number(complaint.version) || 1) + 1;
  complaint.version = newVer;
  await ComplaintStore.update(complaint._id || complaint.id, { version: newVer });
  return newVer;
}

// Upload directory for optional after-repair evidence
const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `repair-${Date.now()}-${randomHex}${ext}`);
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

/**
 * Helper to fetch a complaint by ID with fallback
 */
async function getComplaintById(id) {
  if (mongoose.connection.readyState === 1) {
    const Complaint = require('../models/Complaint');
    return Complaint.findById(id);
  }
  return ComplaintStore.findById(id);
}

/**
 * GET /api/official/complaints
 * Lists complaints according to official role permissions:
 * - reviewer: all new/active complaints
 * - officer: only complaints of THEIR department
 * - supervisor: authorized departments (or all in demo)
 * 
 * Filters: status, department, priority, emergency, overdue
 * Sorting: possible emergencies and overdue cases come FIRST!
 */
router.get('/complaints', requireAuth, requireRole('reviewer', 'officer', 'supervisor'), async (req, res) => {
  try {
    const user = req.user;
    const { status, department, priority, emergency, overdue } = req.query;

    let complaints = [];
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      const query = {};

      if (user.role === 'officer') {
        query.department = user.department;
      } else if (department) {
        query.department = department;
      }

      if (status) query.status = status;
      if (priority) query.priority = priority;
      if (emergency === 'true') query.isPossibleEmergency = true;
      if (overdue === 'true') query.isOverdue = true;

      complaints = await Complaint.find(query).sort({ createdAt: -1 });
    } else {
      let all = await ComplaintStore.find({});
      if (user.role === 'officer') {
        all = all.filter(c => c.department === user.department);
      } else if (department) {
        all = all.filter(c => c.department === department);
      }

      if (status) all = all.filter(c => c.status === status);
      if (priority) all = all.filter(c => c.priority === priority);
      if (emergency === 'true') all = all.filter(c => c.isPossibleEmergency === true);
      if (overdue === 'true') all = all.filter(c => c.isOverdue === true);

      complaints = all;
    }

    // MANDATORY SORTING RULE:
    // Possible emergencies and overdue cases MUST come first!
    // Never vanish into normal queue.
    complaints.sort((a, b) => {
      // 1. Critical verified emergency top
      if (a.isCriticalVerified !== b.isCriticalVerified) {
        return a.isCriticalVerified ? -1 : 1;
      }
      // 2. Possible emergency
      if (a.isPossibleEmergency !== b.isPossibleEmergency) {
        return a.isPossibleEmergency ? -1 : 1;
      }
      // 3. Overdue cases
      if (a.isOverdue !== b.isOverdue) {
        return a.isOverdue ? -1 : 1;
      }
      // 4. Priority Critical > High > Normal
      const priorityOrder = { Critical: 3, High: 2, Normal: 1 };
      const pDiff = (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
      if (pDiff !== 0) return pDiff;

      // 5. Creation date descending
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json({ complaints });
  } catch (error) {
    console.error('Error fetching official complaints:', error);
    res.status(500).json({ error: 'Failed to retrieve complaints.' });
  }
});

function calculateAllowedActions(issue, user) {
  const currentStatus = issue.status;
  const isSupervisorOrAdmin = ['supervisor', 'admin'].includes(user.role);
  const isReviewer = ['reviewer', 'admin'].includes(user.role);
  const isOfficer = user.role === 'officer';
  const isDepartmentMatch = !user.department || user.department === issue.department;

  const reviewingBy = (issue.reviewingUntil && new Date(issue.reviewingUntil) > new Date()) ? issue.reviewingBy : null;
  const isAssignedOfficer = isOfficer && ((issue.assignedToId && issue.assignedToId === (user.id || user._id)) || (issue.assignedTo && issue.assignedTo === (user.id || user._id)));
  const isUnassigned = !issue.assignedTo && !issue.assignedToId;

  const canSelfAssign = Boolean(
    process.env.SELF_ASSIGN_ENABLED !== 'false' &&
    isOfficer &&
    isDepartmentMatch &&
    currentStatus === 'Accepted' &&
    isUnassigned
  );

  const supervisorTools = {
    allowed: isSupervisorOrAdmin,
    canChangePriority: isSupervisorOrAdmin,
    canReroute: isSupervisorOrAdmin,
    canUnlink: isSupervisorOrAdmin,
    canChangeDeadline: isSupervisorOrAdmin,
    canReassign: isSupervisorOrAdmin
  };

  let primaryAction = null;
  const secondaryActions = [];
  let noActionReason = null;

  if (user.role === 'citizen') {
    noActionReason = 'Citizens cannot perform staff ticket actions';
  } else if (currentStatus === 'Submitted' || currentStatus === 'Under Review') {
    if (isReviewer) {
      primaryAction = {
        id: 'accept',
        label: 'Accept',
        action: 'Accept',
        toStatus: 'Accepted',
        summary: `This moves the ticket from ${currentStatus} to Accepted and notifies the citizen.`,
        requiresReason: false
      };
      secondaryActions.push({
        id: 'reject',
        label: 'Reject',
        action: 'Reject',
        toStatus: 'Rejected',
        summary: `This moves the ticket from ${currentStatus} to Rejected and notifies the citizen.`,
        requiresReason: true
      });
    } else {
      noActionReason = 'Awaiting reviewer evaluation and acceptance';
    }
  } else if (currentStatus === 'Accepted') {
    if (isUnassigned) {
      if (canSelfAssign) {
        primaryAction = {
          id: 'take_ticket',
          label: 'Take this ticket',
          action: 'Self Assign',
          toStatus: 'Accepted',
          summary: 'This assigns you to the ticket and alerts the department.',
          requiresReason: false
        };
      }
      if (isSupervisorOrAdmin) {
        if (!primaryAction) {
          primaryAction = {
            id: 'assign_officer',
            label: 'Assign officer',
            action: 'Assign Staff',
            toStatus: 'Accepted',
            summary: `Assign a designated field officer from ${issue.department} department.`,
            requiresReason: false
          };
        } else {
          secondaryActions.push({
            id: 'assign_officer',
            label: 'Assign officer',
            action: 'Assign Staff',
            toStatus: 'Accepted',
            summary: `Assign a designated field officer from ${issue.department} department.`,
            requiresReason: false
          });
        }
      }
      if (!primaryAction) {
        noActionReason = isOfficer && !isDepartmentMatch 
          ? `Ticket belongs to ${issue.department} department (you are in ${user.department || 'other'})` 
          : 'Awaiting field officer assignment by supervisor';
      }
    } else {
      if (isAssignedOfficer || user.role === 'admin') {
        primaryAction = {
          id: 'start_work',
          label: 'Start work',
          action: 'Start Work',
          toStatus: 'In Progress',
          summary: 'This moves the ticket from Accepted to In Progress and notifies the citizen.',
          requiresReason: false
        };
      } else if (isSupervisorOrAdmin) {
        secondaryActions.push({
          id: 'reassign',
          label: 'Reassign officer',
          action: 'Reassign Staff',
          toStatus: 'Accepted',
          summary: 'Reassign to a different field officer.',
          requiresReason: true
        });
        noActionReason = `Assigned to ${issue.assignedToName || 'field officer'}. Awaiting work commencement.`;
      } else {
        noActionReason = `Assigned to ${issue.assignedToName || 'another field officer'}.`;
      }
    }
  } else if (currentStatus === 'In Progress') {
    if ((isOfficer && isDepartmentMatch) || user.role === 'admin' || isSupervisorOrAdmin) {
      primaryAction = {
        id: 'resolve',
        label: 'Mark resolved',
        action: 'Resolve',
        toStatus: 'Resolved',
        summary: 'This moves the ticket from In Progress to Resolved and notifies the citizen.',
        requiresReason: true,
        requiresResolutionNote: true,
        allowPhoto: true
      };
      secondaryActions.push({
        id: 'add_note',
        label: 'Add progress note',
        action: 'Add Note',
        summary: 'Adds an internal note or citizen update to the timeline.',
        requiresReason: false
      });
    } else {
      noActionReason = `Work in progress by ${issue.assignedToName || 'assigned officer'}.`;
    }
  } else if (currentStatus === 'Resolved') {
    if (isSupervisorOrAdmin) {
      primaryAction = {
        id: 'close',
        label: 'Close',
        action: 'Close',
        toStatus: 'Closed',
        summary: 'This moves the ticket from Resolved to Closed.',
        requiresReason: false
      };
      if (issue.reopenRequest && (issue.reopenRequest.status === 'PENDING' || issue.reopenRequest.decision === 'pending')) {
        secondaryActions.push({
          id: 'approve_reopen',
          label: 'Approve Reopening',
          action: 'Approve Reopening',
          toStatus: 'Under Review',
          summary: 'Approves citizen reopening request and returns ticket to Under Review.',
          requiresReason: true
        });
        secondaryActions.push({
          id: 'reject_reopen',
          label: 'Reject Reopening',
          action: 'Reject Reopening',
          toStatus: 'Resolved',
          summary: 'Declines citizen reopening request.',
          requiresReason: true
        });
      }
    } else if (isReviewer && issue.reopenRequest && (issue.reopenRequest.status === 'PENDING' || issue.reopenRequest.decision === 'pending')) {
      primaryAction = {
        id: 'approve_reopen',
        label: 'Approve Reopening',
        action: 'Approve Reopening',
        toStatus: 'Under Review',
        summary: 'Approves citizen reopening request and returns ticket to Under Review.',
        requiresReason: true
      };
      secondaryActions.push({
        id: 'reject_reopen',
        label: 'Reject Reopening',
        action: 'Reject Reopening',
        toStatus: 'Resolved',
        summary: 'Declines citizen reopening request.',
        requiresReason: true
      });
    } else {
      noActionReason = 'Ticket is resolved. Awaiting citizen confirmation or supervisor closure.';
    }
  } else if (currentStatus === 'Rejected') {
    noActionReason = `Ticket was rejected (${issue.rejectionReason || 'Non-actionable'}). No further action required.`;
  } else if (currentStatus === 'Closed') {
    noActionReason = 'Ticket is closed. Terminal state.';
  }

  const deptOfficers = memoryStore.users
    .filter(u => u.role === 'officer' && (!issue.department || u.department === issue.department))
    .map(o => {
      const oId = (o._id || o.id).toString();
      const officerTickets = memoryStore.complaints.filter(c => 
        (c.assignedTo === oId || c.assignedToId === oId) &&
        !['Resolved', 'Closed', 'Rejected'].includes(c.status)
      );
      return {
        id: oId,
        name: o.name,
        email: o.email,
        department: o.department,
        openCount: officerTickets.length,
        overdueCount: officerTickets.filter(c => c.isOverdue).length
      };
    });

  const allowedTransitions = TRANSITIONS.filter(t => {
    if (t.from !== currentStatus) return false;
    if (!t.allowedRoles.includes(user.role)) return false;
    if (t.departmentScoped && user.department && user.department !== issue.department) return false;
    return true;
  });

  return {
    ok: true,
    currentStatus,
    version: issue.version || 1,
    reviewingBy,
    reviewingUntil: issue.reviewingUntil || null,
    primaryAction,
    secondaryActions,
    allowedTransitions,
    canSelfAssign,
    supervisorTools,
    noActionReason,
    reopenRequests: issue.reopenRequest ? [issue.reopenRequest] : [],
    rejectReasonsConfig: [
      'Duplicate of an existing ticket',
      'Outside the Pune service area',
      'Not a municipal issue',
      'Insufficient evidence',
      'Other'
    ],
    officers: deptOfficers
  };
}

/**
 * GET /api/official/complaints/:id/allowed-actions
 */
router.get('/complaints/:id/allowed-actions', requireAuth, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Complaint not found.' });
    const actions = calculateAllowedActions(complaint, req.user);
    res.status(200).json(actions);
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to compute allowed actions' });
  }
});

/**
 * POST /api/official/complaints/:id/review-lock
 */
router.post('/complaints/:id/review-lock', requireAuth, requireRole('reviewer', 'officer', 'supervisor', 'admin'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ ok: false, error: 'Complaint not found.' });
    const userName = req.user.name || req.user.email;
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    complaint.reviewingBy = userName;
    complaint.reviewingUntil = until;
    await ComplaintStore.update(complaint._id || complaint.id, { reviewingBy: userName, reviewingUntil: until });
    res.status(200).json({ ok: true, reviewingBy: userName, reviewingUntil: until });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to set advisory review lock' });
  }
});

/**
 * POST /api/official/complaints/:id/start-review
 * Reviewer only: Submitted -> Under Review
 */
router.post('/complaints/:id/start-review', requireAuth, requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, req.user, 'Start Review', res))) {
      return;
    }

    const result = await attemptTransition({
      complaint,
      toStatus: STATES.UNDER_REVIEW,
      actor: req.user,
      payload: req.body
    });

    if (result.success) {
      await bumpComplaintVersion(complaint);
    }

    return res.status(result.statusCode).json({
      message: result.message,
      error: !result.success ? result.message : undefined,
      errorCode: result.errorCode,
      params: result.params,
      complaint: result.complaint,
      event: result.event
    });
  } catch (error) {
    console.error('Error in start-review:', error);
    res.status(500).json({ error: 'Failed to transition to Under Review.' });
  }
});

/**
 * POST /api/official/complaints/:id/accept
 * Reviewer only: Under Review -> Accepted (or direct from Submitted)
 * May correct department or category with a reason
 */
router.post('/complaints/:id/accept', requireAuth, requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, req.user, 'Accept', res))) {
      return;
    }

    const { reason, newDepartment, newCategory } = req.body;

    const result = await attemptTransition({
      complaint,
      toStatus: STATES.ACCEPTED,
      actor: req.user,
      payload: { reason, newDepartment, newCategory }
    });

    if (result.success) {
      await bumpComplaintVersion(complaint);
    }

    return res.status(result.statusCode).json({
      message: result.message,
      error: !result.success ? result.message : undefined,
      errorCode: result.errorCode,
      params: result.params,
      complaint: result.complaint,
      event: result.event
    });
  } catch (error) {
    console.error('Error in accept:', error);
    res.status(500).json({ error: 'Failed to accept complaint.' });
  }
});

/**
 * POST /api/official/complaints/:id/reject
 * Reviewer only: Under Review -> Rejected (reason mandatory)
 */
router.post('/complaints/:id/reject', requireAuth, requireRole('reviewer', 'admin'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, req.user, 'Reject', res))) {
      return;
    }

    const { reason } = req.body;

    const result = await attemptTransition({
      complaint,
      toStatus: STATES.REJECTED,
      actor: req.user,
      payload: { reason }
    });

    if (result.success) {
      await bumpComplaintVersion(complaint);
    }

    return res.status(result.statusCode).json({
      message: result.message,
      error: !result.success ? result.message : undefined,
      errorCode: result.errorCode,
      params: result.params,
      complaint: result.complaint,
      event: result.event
    });
  } catch (error) {
    console.error('Error in reject:', error);
    res.status(500).json({ error: 'Failed to reject complaint.' });
  }
});

/**
 * POST /api/official/complaints/:id/assign
 * Supervisor only: Reassign / assign staff
 */
router.post('/complaints/:id/assign', requireAuth, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor reassignment tools. Use self-assign if permitted.';
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Assign Staff',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({
        error: refusalReason,
        errorCode: 'SUPERVISOR_ONLY',
        message: refusalReason
      });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, user, 'Assign Staff', res))) {
      return;
    }

    const { staffName, assignedToUserId, assignedToOfficerId, reason } = req.body;
    const targetUserId = assignedToOfficerId || assignedToUserId;
    let targetName = staffName;

    if (targetUserId) {
      const targetUser = memoryStore.users.find(u => (u._id === targetUserId || u.id === targetUserId));
      if (targetUser) {
        targetName = targetUser.name;
      }
    }

    if (!targetName && !targetUserId) {
      return res.status(400).json({
        error: 'Please specify assigned staff name or officer user ID.',
        errorCode: 'STAFF_REQUIRED'
      });
    }

    complaint.assignedTo = targetUserId || targetName;
    complaint.assignedToId = targetUserId || null;
    complaint.assignedToName = targetName;
    await bumpComplaintVersion(complaint);

    const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
    await ComplaintStore.update(complaintId, {
      assignedTo: complaint.assignedTo,
      assignedToId: complaint.assignedToId,
      assignedToName: complaint.assignedToName,
      version: complaint.version
    });

    const assignEvent = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Assign Staff',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: `Assigned field staff: ${targetName || targetUserId}. ${reason || ''}`.trim()
    });

    const citizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
    if (citizenId) {
      await NotificationStore.create({
        user: citizenId,
        complaint: complaintId,
        message: `Field staff ${targetName || targetUserId} assigned to grievance [${complaint.trackingId}].`,
        messageKey: 'STAFF_ASSIGNED',
        params: { staffName: targetName || targetUserId, trackingId: complaint.trackingId }
      });
    }

    res.status(200).json({
      message: 'Staff assignment recorded.',
      complaint,
      event: assignEvent
    });
  } catch (error) {
    console.error('Error in assign staff:', error);
    res.status(500).json({ error: 'Failed to assign staff.' });
  }
});

/**
 * POST /api/official/complaints/:id/self-assign
 * Field officer self-assigns an unassigned ticket of their department
 */
router.post('/complaints/:id/self-assign', requireAuth, requireRole('officer'), async (req, res) => {
  try {
    if (process.env.SELF_ASSIGN_ENABLED === 'false') {
      return res.status(400).json({ error: 'Self-assignment is disabled.' });
    }
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });
    const user = req.user;

    if (user.department && complaint.department !== user.department) {
      const refusalReason = `Officer department (${user.department}) does not match complaint department (${complaint.department}).`;
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Self Assign',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({ error: refusalReason, errorCode: 'DEPARTMENT_MISMATCH' });
    }

    if (complaint.status !== STATES.ACCEPTED) {
      const refusalReason = `Cannot self-assign: complaint must be in Accepted status (current: ${complaint.status}).`;
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Self Assign',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(400).json({ error: refusalReason });
    }

    if (complaint.assignedTo || complaint.assignedToId) {
      return res.status(400).json({ error: 'Ticket is already assigned.' });
    }

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, user, 'Self Assign', res))) {
      return;
    }

    const officerId = (user._id || user.id).toString();
    complaint.assignedTo = officerId;
    complaint.assignedToId = officerId;
    complaint.assignedToName = user.name;
    await bumpComplaintVersion(complaint);

    const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
    await ComplaintStore.update(complaintId, {
      assignedTo: officerId,
      assignedToId: officerId,
      assignedToName: user.name,
      version: complaint.version
    });

    const event = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: officerId,
      actorRole: user.role,
      action: 'Self Assign',
      outcome: 'accepted',
      fromStatus: STATES.ACCEPTED,
      toStatus: STATES.ACCEPTED,
      reason: 'Officer self-assigned ticket'
    });

    res.status(200).json({ message: 'Ticket assigned to you.', complaint, event });
  } catch (error) {
    console.error('Error in self-assign:', error);
    res.status(500).json({ error: 'Failed to self-assign ticket.' });
  }
});

/**
 * POST /api/official/complaints/:id/start-work
 * Field officer commences work: Accepted -> In Progress
 */
router.post('/complaints/:id/start-work', requireAuth, requireRole('officer', 'admin'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, req.user, 'Start Work', res))) {
      return;
    }

    const result = await attemptTransition({
      complaint,
      toStatus: STATES.IN_PROGRESS,
      actor: req.user,
      payload: req.body
    });

    if (result.success) {
      await bumpComplaintVersion(complaint);
    }

    return res.status(result.statusCode).json({
      message: result.message,
      error: !result.success ? result.message : undefined,
      errorCode: result.errorCode,
      params: result.params,
      complaint: result.complaint,
      event: result.event
    });
  } catch (error) {
    console.error('Error in start-work:', error);
    res.status(500).json({ error: 'Failed to start work.' });
  }
});

/**
 * POST /api/official/complaints/:id/progress
 * Officer (of that department): Add progress note (In Progress)
 */
router.post('/complaints/:id/progress', requireAuth, requireRole('officer'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user;
    if (user.department !== complaint.department) {
      const refusalReason = `Officer department (${user.department}) does not match complaint department (${complaint.department}).`;
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Add Progress Note',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({
        error: refusalReason,
        errorCode: 'DEPARTMENT_MISMATCH',
        params: { complaintDepartment: complaint.department, actorDepartment: user.department }
      });
    }

    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({
        error: 'Progress note text is required.',
        errorCode: 'NOTE_REQUIRED'
      });
    }

    const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
    const event = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Progress Update',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: note.trim()
    });

    res.status(200).json({ message: 'Progress update recorded.', event });
  } catch (error) {
    console.error('Error adding progress note:', error);
    res.status(500).json({ error: 'Failed to add progress note.' });
  }
});

/**
 * POST /api/official/complaints/:id/resolve
 * Officer of that department only: In Progress -> Resolved
 * Mandatory resolutionNote, optional after-repair photo
 */
router.post('/complaints/:id/resolve', requireAuth, requireRole('officer'), upload.single('afterRepairPhoto'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, req.user, 'Resolve', res))) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      return;
    }

    const { resolutionNote } = req.body;
    const user = req.user;

    const result = await attemptTransition({
      complaint,
      toStatus: STATES.RESOLVED,
      actor: user,
      payload: { resolutionNote }
    });

    if (!result.success) {
      // Clean up uploaded file if transition refused
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
      }
      return res.status(result.statusCode).json({
        error: result.message,
        errorCode: result.errorCode,
        params: result.params,
        event: result.event
      });
    }

    await bumpComplaintVersion(complaint);

    // Save optional after-repair evidence
    if (req.file) {
      const buffer = fs.readFileSync(req.file.path);
      const fileTypeResult = await FileType.fromBuffer(buffer);
      const mime = (fileTypeResult && fileTypeResult.mime) || req.file.mimetype;
      const relativePath = path.relative(path.join(__dirname, '../../'), req.file.path);

      const evData = {
        complaint: complaint._id || complaint.id,
        filePath: relativePath,
        mimeType: mime,
        kind: 'RESOLUTION',
        uploader: user._id || user.id
      };

      if (mongoose.connection.readyState === 1) {
        const Evidence = require('../models/Evidence');
        await Evidence.create(evData);
      } else {
        await EvidenceStore.create(evData);
      }
    }

    return res.status(200).json({
      message: 'Complaint marked as Resolved.',
      complaint: result.complaint,
      event: result.event
    });
  } catch (error) {
    console.error('Error in resolve endpoint:', error);
    res.status(500).json({ error: 'Failed to resolve complaint.' });
  }
});

/**
 * POST /api/official/complaints/:id/reopen-decision
 * Reviewer only: Decide on citizen reopening request
 * - Approved: Resolved -> Under Review via attemptTransition
 * - Rejected: stays Resolved. Original resolution note, evidence, and history preserved.
 */
router.post('/complaints/:id/reopen-decision', requireAuth, requireRole('reviewer'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const { decision, reason } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be either "approved" or "rejected".' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Decision reason is mandatory.' });
    }

    const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
    const user = req.user;

    if (decision === 'approved') {
      // Must use workflowEngine attemptTransition!
      const result = await attemptTransition({
        complaint,
        toStatus: STATES.UNDER_REVIEW,
        actor: user,
        payload: { reason: `Reopening request approved by reviewer: ${reason.trim()}` }
      });

      if (!result.success) {
        return res.status(result.statusCode).json({
          error: result.message,
          errorCode: result.errorCode,
          params: result.params,
          event: result.event
        });
      }

      // Update reopenRequest record
      complaint.reopenRequest = {
        ...(complaint.reopenRequest || {}),
        decision: 'approved',
        decisionReason: reason.trim(),
        decidedBy: user._id || user.id
      };

      if (complaint.save && typeof complaint.save === 'function') {
        await complaint.save();
      } else {
        await ComplaintStore.update(complaintId, { reopenRequest: complaint.reopenRequest });
      }

      // Notify citizen of approval
      const citizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
      if (citizenId) {
        await NotificationStore.create({
          user: citizenId,
          complaint: complaintId,
          message: `Your reopening request for grievance [${complaint.trackingId}] was approved by the reviewer.`,
          messageKey: 'REOPEN_DECIDED',
          params: { trackingId: complaint.trackingId, decision: 'approved' }
        });
      }

      return res.status(200).json({
        message: 'Reopening approved. Complaint returned to Under Review.',
        complaint,
        event: result.event
      });
    } else {
      // Rejected: stays in Resolved status. Preserve resolutionNote & evidence.
      complaint.reopenRequest = {
        ...(complaint.reopenRequest || {}),
        decision: 'rejected',
        decisionReason: reason.trim(),
        decidedBy: user._id || user.id
      };

      if (complaint.save && typeof complaint.save === 'function') {
        await complaint.save();
      } else {
        await ComplaintStore.update(complaintId, { reopenRequest: complaint.reopenRequest });
      }

      const ev = await WorkflowEventStore.create({
        complaint: complaintId,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Reopen Decision',
        outcome: 'accepted',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        reason: `Reopening rejected by reviewer: ${reason.trim()}`
      });

      // Notify citizen of rejection
      const citizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
      if (citizenId) {
        await NotificationStore.create({
          user: citizenId,
          complaint: complaintId,
          message: `Your reopening request for grievance [${complaint.trackingId}] was declined by the reviewer: "${reason.trim()}".`,
          messageKey: 'REOPEN_DECIDED',
          params: { trackingId: complaint.trackingId, decision: 'rejected' }
        });
      }

      return res.status(200).json({
        message: 'Reopening request declined. Complaint remains Resolved.',
        complaint,
        event: ev
      });
    }
  } catch (error) {
    console.error('Error processing reopen decision:', error);
    res.status(500).json({ error: 'Failed to process reopen decision.' });
  }
});

/**
 * POST /api/official/complaints/:id/emergency-verify
 * Reviewer or Supervisor only:
 * Verify or dismiss emergency flag with mandatory reason.
 * If verified: isCriticalVerified = true, priority labelled "Critical", audit event recorded.
 */
router.post('/complaints/:id/emergency-verify', requireAuth, requireRole('reviewer', 'supervisor'), async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const { action, reason } = req.body; // action: 'verify' or 'dismiss'
    if (!['verify', 'dismiss'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "verify" or "dismiss".' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'A mandatory reason is required for emergency verification.',
        errorCode: 'REASON_REQUIRED'
      });
    }

    const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
    const user = req.user;
    const isVerify = action === 'verify';

    complaint.isCriticalVerified = isVerify;
    if (isVerify) {
      // Label priority as Critical and recompute deadlines
      await updatePriorityWithDeadlines(complaint, 'Critical', user, `Emergency verified by ${user.name}: ${reason.trim()}`);
    }

    if (complaint.save && typeof complaint.save === 'function') {
      await complaint.save();
    } else {
      await ComplaintStore.update(complaintId, {
        isCriticalVerified: complaint.isCriticalVerified,
        priority: complaint.priority,
        initialResponseDue: complaint.initialResponseDue,
        resolutionDue: complaint.resolutionDue
      });
    }

    // Write audit event
    const event = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: isVerify ? 'Verify Emergency' : 'Dismiss Emergency',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: reason.trim()
    });

    // Notify citizen if emergency verified
    const citizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
    if (citizenId && isVerify) {
      await NotificationStore.create({
        user: citizenId,
        complaint: complaintId,
        message: `Emergency flag verified for grievance [${complaint.trackingId}]. Priority escalated to Critical.`,
        messageKey: 'EMERGENCY_VERIFIED',
        params: { trackingId: complaint.trackingId }
      });
    }

    return res.status(200).json({
      message: `Emergency status ${isVerify ? 'verified as Critical' : 'dismissed'}.`,
      complaint,
      event
    });
  } catch (error) {
    console.error('Error verifying emergency:', error);
    res.status(500).json({ error: 'Failed to verify emergency.' });
  }
});

/**
 * POST /api/official/complaints/:id/priority
 * Supervisor only: Override priority (Normal | High | Critical) with mandatory reason.
 * Recomputes deadlines and logs an audit event.
 * Officers calling this get 403 + REFUSED audit event.
 */
router.post('/complaints/:id/priority', requireAuth, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor priority override tool.';
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Override Priority',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({
        error: refusalReason,
        errorCode: 'SUPERVISOR_ONLY',
        message: refusalReason
      });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, user, 'Override Priority', res))) {
      return;
    }

    const { priority, reason } = req.body;
    if (!['Normal', 'High', 'Critical'].includes(priority)) {
      return res.status(400).json({ error: 'Valid priority is required (Normal, High, Critical).' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'A mandatory reason is required for priority override.',
        errorCode: 'REASON_REQUIRED'
      });
    }

    await updatePriorityWithDeadlines(complaint, priority, user, reason.trim());
    await bumpComplaintVersion(complaint);

    // Notify citizen of priority update
    const citizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
    const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
    if (citizenId) {
      await NotificationStore.create({
        user: citizenId,
        complaint: complaintId,
        message: `Priority for grievance [${complaint.trackingId}] updated to ${priority}.`,
        messageKey: 'PRIORITY_CHANGED',
        params: { trackingId: complaint.trackingId, priority }
      });
    }

    res.status(200).json({
      message: `Priority updated to ${priority}. Deadlines recomputed.`,
      complaint
    });
  } catch (error) {
    console.error('Error overriding priority:', error);
    res.status(500).json({ error: 'Failed to override priority.' });
  }
});

/**
 * POST /api/official/complaints/:id/reroute
 * Supervisor only: reroutes department and category, recalculates deadlines from submittedAt, unassigns officer.
 * Officers calling this get 403 + REFUSED audit event.
 */
router.post('/complaints/:id/reroute', requireAuth, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor reroute tool.';
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Reroute Issue',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({
        error: refusalReason,
        errorCode: 'SUPERVISOR_ONLY',
        message: refusalReason
      });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, user, 'Reroute Issue', res))) {
      return;
    }

    const { department, category, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'A mandatory reason is required to reroute an issue.',
        errorCode: 'REASON_REQUIRED'
      });
    }

    const targetDept = department || complaint.department;
    const targetCat = category || complaint.category;
    const submittedTime = new Date(complaint.submittedAt || complaint.createdAt).getTime();
    const durations = getDeadlineDurations(targetDept, complaint.priority || 'Normal');
    const oldResponseDue = complaint.initialResponseDue || complaint.responseDeadline;
    const oldResolutionDue = complaint.resolutionDue;
    const newResponseDue = new Date(submittedTime + durations.initialResponseMs);
    const newResolutionDue = new Date(submittedTime + durations.resolutionMs);

    complaint.department = targetDept;
    complaint.category = targetCat;
    complaint.assignedTo = null;
    complaint.assignedToId = null;
    complaint.assignedToName = null;
    complaint.initialResponseDue = newResponseDue;
    complaint.responseDeadline = newResponseDue;
    complaint.resolutionDue = newResolutionDue;

    const complaintId = (complaint._id || complaint.id).toString();
    await bumpComplaintVersion(complaint);
    await ComplaintStore.update(complaintId, {
      department: targetDept,
      category: targetCat,
      assignedTo: null,
      assignedToId: null,
      assignedToName: null,
      initialResponseDue: newResponseDue,
      responseDeadline: newResponseDue,
      resolutionDue: newResolutionDue,
      version: complaint.version
    });

    try {
      db.prepare(`
        INSERT INTO DeadlineChange (id, issueId, oldResponseDue, newResponseDue, oldResolutionDue, newResolutionDue, reason, actorId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `dc-${Date.now()}`,
        complaintId,
        oldResponseDue ? new Date(oldResponseDue).toISOString() : null,
        newResponseDue.toISOString(),
        oldResolutionDue ? new Date(oldResolutionDue).toISOString() : null,
        newResolutionDue.toISOString(),
        reason.trim(),
        (user._id || user.id).toString(),
        new Date().toISOString()
      );
    } catch (e) { /* ignore */ }

    await WorkflowEventStore.create({
      complaint: complaintId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Reroute Issue',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: reason.trim()
    });

    res.status(200).json({
      message: 'Issue rerouted and deadlines recomputed.',
      complaint
    });
  } catch (error) {
    console.error('Error in reroute:', error);
    res.status(500).json({ error: 'Failed to reroute complaint.' });
  }
});

/**
 * POST /api/official/complaints/:id/deadline
 * Supervisor only: adjust deadline SLA with mandatory reason.
 * Officers calling this get 403 + REFUSED audit event.
 */
router.post('/complaints/:id/deadline', requireAuth, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor deadline tool.';
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Change Deadline',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({
        error: refusalReason,
        errorCode: 'SUPERVISOR_ONLY',
        message: refusalReason
      });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, user, 'Change Deadline', res))) {
      return;
    }

    const { days, newResolutionDue, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        error: 'A mandatory reason is required to change deadline.',
        errorCode: 'REASON_REQUIRED'
      });
    }

    const oldResolutionDue = complaint.resolutionDue;
    let targetResolutionDue;
    if (days) {
      targetResolutionDue = new Date(Date.now() + Number(days) * 86400000);
    } else if (newResolutionDue) {
      targetResolutionDue = new Date(newResolutionDue);
    } else {
      return res.status(400).json({ error: 'Please specify days or newResolutionDue date.' });
    }

    complaint.resolutionDue = targetResolutionDue;
    const complaintId = (complaint._id || complaint.id).toString();
    await bumpComplaintVersion(complaint);
    await ComplaintStore.update(complaintId, {
      resolutionDue: targetResolutionDue,
      version: complaint.version
    });

    try {
      db.prepare(`
        INSERT INTO DeadlineChange (id, issueId, oldResponseDue, newResponseDue, oldResolutionDue, newResolutionDue, reason, actorId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `dc-${Date.now()}`,
        complaintId,
        null,
        null,
        oldResolutionDue ? new Date(oldResolutionDue).toISOString() : null,
        targetResolutionDue.toISOString(),
        reason.trim(),
        (user._id || user.id).toString(),
        new Date().toISOString()
      );
    } catch (e) { /* ignore */ }

    await WorkflowEventStore.create({
      complaint: complaintId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Change Deadline',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: reason.trim()
    });

    res.status(200).json({
      message: 'Deadline updated successfully.',
      complaint
    });
  } catch (error) {
    console.error('Error changing deadline:', error);
    res.status(500).json({ error: 'Failed to change deadline.' });
  }
});

/**
 * POST /api/official/complaints/:id/close
 * Supervisor only: closes resolved ticket.
 */
router.post('/complaints/:id/close', requireAuth, async (req, res) => {
  try {
    const complaint = await getComplaintById(req.params.id);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found.' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to close tickets directly.';
      await WorkflowEventStore.create({
        complaint: complaint._id || complaint.id,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Close Ticket',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });
      return res.status(403).json({ error: refusalReason, errorCode: 'SUPERVISOR_ONLY', message: refusalReason });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!['Resolved', 'RESOLVED'].includes(complaint.status)) {
      return res.status(400).json({ error: `Only Resolved tickets can be closed (current: ${complaint.status}).` });
    }

    if (!(await verifyOptimisticLock(complaint, req.body.expectedVersion, user, 'Close', res))) {
      return;
    }

    complaint.status = 'Closed';
    complaint.closedAt = new Date().toISOString();
    await bumpComplaintVersion(complaint);
    const complaintId = (complaint._id || complaint.id).toString();
    await ComplaintStore.update(complaintId, { status: 'Closed', closedAt: complaint.closedAt, version: complaint.version });

    const ev = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Close Ticket',
      outcome: 'accepted',
      fromStatus: 'Resolved',
      toStatus: 'Closed',
      reason: req.body.reason || 'Supervisor verified and closed ticket'
    });

    res.status(200).json({ message: 'Ticket closed.', complaint, event: ev });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close ticket' });
  }
});

/**
 * GET /api/official/complaints/:id/notes
 */
router.get('/complaints/:id/notes', requireAuth, async (req, res) => {
  try {
    const issueId = req.params.id;
    let notes = await IssueNoteStore.find({ issueId });
    if (req.user.role === 'citizen') {
      notes = notes.filter(n => n.visibility === 'CITIZEN_UPDATE');
    }
    res.status(200).json({ ok: true, notes });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch notes' });
  }
});

/**
 * POST /api/official/complaints/:id/notes
 */
router.post('/complaints/:id/notes', requireAuth, requireRole('reviewer', 'officer', 'supervisor', 'admin'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const complaint = await getComplaintById(issueId);
    if (!complaint) return res.status(404).json({ ok: false, error: 'Complaint not found' });

    const { body, visibility = 'INTERNAL' } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ ok: false, errorCode: 'BODY_REQUIRED', error: 'Note text is required.' });
    }

    const noteVisibility = ['CITIZEN_UPDATE', 'INTERNAL'].includes(visibility) ? visibility : 'INTERNAL';
    const note = await IssueNoteStore.create({
      issueId,
      authorId: (req.user._id || req.user.id).toString(),
      authorName: req.user.name,
      authorRole: req.user.role,
      body: body.trim(),
      visibility: noteVisibility
    });

    await WorkflowEventStore.create({
      complaint: issueId,
      actor: (req.user._id || req.user.id).toString(),
      actorRole: req.user.role,
      action: 'Add Note',
      outcome: 'accepted',
      fromStatus: complaint.status,
      toStatus: complaint.status,
      reason: `${noteVisibility === 'CITIZEN_UPDATE' ? 'Citizen update note' : 'Internal note'}: ${body.trim().slice(0, 100)}`
    });

    if (noteVisibility === 'CITIZEN_UPDATE') {
      const citizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
      if (citizenId) {
        await NotificationStore.create({
          user: citizenId,
          complaint: issueId,
          message: `Update on grievance [${complaint.trackingId}]: ${body.trim().slice(0, 80)}`,
          messageKey: 'NOTE_CITIZEN_UPDATE',
          params: { trackingId: complaint.trackingId }
        });
      }
    }

    res.status(201).json({ ok: true, message: 'Note added successfully.', note });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to add note' });
  }
});

/**
 * GET /api/official/complaints/:id/history
 * Full audit history of a specific complaint (including refused attempts)
 */
router.get('/complaints/:id/history', requireAuth, requireRole('reviewer', 'officer', 'supervisor'), async (req, res) => {
  try {
    const complaintId = req.params.id;
    let events = [];

    if (mongoose.connection.readyState === 1) {
      const WorkflowEvent = require('../models/WorkflowEvent');
      events = await WorkflowEvent.find({ complaint: complaintId }).sort({ createdAt: 1 });
    } else {
      events = await WorkflowEventStore.find({ complaint: complaintId });
    }

    res.status(200).json({ history: events });
  } catch (error) {
    console.error('Error fetching complaint history:', error);
    res.status(500).json({ error: 'Failed to retrieve complaint history.' });
  }
});

/**
 * GET /api/official/audit?outcome=all|accepted|refused|system
 * Supervisor only: Full system audit viewer
 */
router.get('/audit', requireAuth, requireRole('supervisor'), async (req, res) => {
  try {
    const { outcome = 'all' } = req.query;
    let events = [];

    if (mongoose.connection.readyState === 1) {
      const WorkflowEvent = require('../models/WorkflowEvent');
      const query = outcome !== 'all' ? { outcome } : {};
      events = await WorkflowEvent.find(query).sort({ createdAt: -1 }).limit(100);
    } else {
      let all = await WorkflowEventStore.find({});
      if (outcome !== 'all') {
        all = all.filter(e => e.outcome === outcome);
      }
      events = all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    res.status(200).json({ audit: events, events });
  } catch (error) {
    console.error('Error fetching supervisor audit log:', error);
    res.status(500).json({ error: 'Failed to retrieve audit log.' });
  }
});

module.exports = router;
