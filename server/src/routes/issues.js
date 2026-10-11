const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  ComplaintStore,
  EvidenceStore,
  WorkflowEventStore,
  NotificationStore,
  SupportStore,
  ReopenRequestStore,
  EmergencyFlagStore,
  SatisfactionRatingStore,
  IssueNoteStore,
  memoryStore
} = require('../services/memoryStore');
const { db, prisma, appendAuditEvent } = require('../db/sqlite');
const { attemptTransition } = require('../services/workflowEngine');
const { calculateDeadlines, updatePriorityWithDeadlines } = require('../services/deadlineService');
const { getDeadlineDurations, STATES, TRANSITIONS } = require('../config/workflow.config');
const { sseHub } = require('../services/sseHub');

const REOPEN_WINDOW_DAYS = parseInt(process.env.REOPEN_WINDOW_DAYS || '7', 10);

async function verifyOptimisticLock(issue, expectedVersion, actor, actionName, res) {
  if (expectedVersion !== undefined && expectedVersion !== null) {
    const currentVer = Number(issue.version || 1);
    if (Number(expectedVersion) !== currentVer) {
      const refusalMsg = `Ticket changed: expected version ${expectedVersion}, but current version is ${currentVer}. Someone else updated this ticket. Reload.`;
      const issueId = (issue._id || issue.id).toString();
      await WorkflowEventStore.create({
        complaint: issueId,
        actor: (actor._id || actor.id).toString(),
        actorRole: actor.role || 'official',
        action: actionName || 'Update Attempt',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
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

async function bumpIssueVersion(issue) {
  const newVer = (Number(issue.version) || 1) + 1;
  issue.version = newVer;
  await ComplaintStore.update(issue._id || issue.id, { version: newVer });
  return newVer;
}

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
 * GET /api/issues
 * List issues with role-based scoping and priority sorting
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const { status, department, priority, emergency, overdue } = req.query;

    let complaints = await ComplaintStore.find({});

    if (user.role === 'citizen') {
      const citizenId = (user._id || user.id).toString();
      complaints = complaints.filter(c => {
        const cCitizen = (c.citizen?._id || c.citizen)?.toString();
        return cCitizen === citizenId;
      });
    } else if (user.role === 'officer') {
      complaints = complaints.filter(c => !user.department || c.department === user.department);
    } else if (department) {
      complaints = complaints.filter(c => c.department === department);
    }

    if (status) complaints = complaints.filter(c => c.status === status);
    if (priority) complaints = complaints.filter(c => c.priority === priority);
    if (emergency === 'true') complaints = complaints.filter(c => c.isPossibleEmergency || c.emergencyStatus === 'POSSIBLE_UNVERIFIED' || c.emergencyStatus === 'VERIFIED');
    if (overdue === 'true') complaints = complaints.filter(c => c.isOverdue);

    // Sorting: emergencies & overdue cases first!
    complaints.sort((a, b) => {
      if (a.isCriticalVerified !== b.isCriticalVerified) return a.isCriticalVerified ? -1 : 1;
      if (a.isPossibleEmergency !== b.isPossibleEmergency) return a.isPossibleEmergency ? -1 : 1;
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const pOrder = { Critical: 3, High: 2, Normal: 1 };
      const pDiff = (pOrder[b.priority] || 1) - (pOrder[a.priority] || 1);
      if (pDiff !== 0) return pDiff;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json({ ok: true, issues: complaints, complaints });
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to retrieve issues', message: 'Failed to retrieve issues' });
  }
});

/**
 * GET /api/issues/:id
 * Retrieve single issue details with linked reports, evidence, and audit history
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const issue = await ComplaintStore.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    const user = req.user;
    const userId = (user._id || user.id).toString();
    const issueCitizenId = (issue.citizen?._id || issue.citizen)?.toString();

    // Access check
    const isOwner = user.role === 'citizen' && userId === issueCitizenId;
    const isAuthorizedStaff = ['reviewer', 'supervisor', 'admin'].includes(user.role) || (user.role === 'officer' && (!user.department || user.department === issue.department));
    if (!isOwner && !isAuthorizedStaff) {
      return res.status(403).json({ ok: false, errorCode: 'FORBIDDEN', error: 'Forbidden: Access denied to this issue', message: 'Forbidden: Access denied to this issue' });
    }

    const issueId = (issue._id || issue.id).toString();
    const evidence = await EvidenceStore.find({ complaint: issueId });
    const allEvents = await WorkflowEventStore.find({ complaint: issueId });
    const history = user.role === 'citizen' ? allEvents.filter(e => e.outcome !== 'refused') : allEvents;
    let notes = await IssueNoteStore.find({ issueId });
    if (user.role === 'citizen') {
      notes = notes.filter(n => n.visibility === 'CITIZEN_UPDATE');
    }
    let reports = [];
    try {
      reports = prisma.report.findMany({ where: { issueId } });
    } catch (e) {}

    let possibleDuplicates = [];
    try {
      possibleDuplicates = prisma.possibleDuplicate.findMany({ where: { issueAId: issueId } });
      if (!possibleDuplicates.length) {
        possibleDuplicates = prisma.possibleDuplicate.findMany({ where: { issueBId: issueId } });
      }
    } catch (e) {}

    // Attach latest live attributes
    issue.version = issue.version || 1;
    issue.reviewingBy = (issue.reviewingUntil && new Date(issue.reviewingUntil) > new Date()) ? issue.reviewingBy : null;

    res.status(200).json({
      ok: true,
      issue,
      complaint: issue,
      evidence: evidence.map(e => ({
        id: e._id || e.id,
        kind: e.kind || 'INITIAL',
        mimeType: e.mimeType,
        createdAt: e.createdAt,
        downloadUrl: `/api/evidence/${e._id || e.id}`
      })),
      reports,
      notes,
      possibleDuplicates,
      history
    });
  } catch (error) {
    console.error('Error fetching issue:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to retrieve issue details', message: 'Failed to retrieve issue details' });
  }
});

/**
 * GET /api/issues/:id/allowed-actions
 * Single backend source of truth for next step, supervisor tools, self-assign and actions
 */
router.get('/:id/allowed-actions', requireAuth, async (req, res) => {
  try {
    const issue = await ComplaintStore.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }
    const actions = calculateAllowedActions(issue, req.user);
    res.status(200).json(actions);
  } catch (error) {
    console.error('Error in allowed-actions:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to compute allowed actions' });
  }
});

/**
 * GET /api/issues/:id/allowed-transitions
 * Backwards compatibility for allowed transitions
 */
router.get('/:id/allowed-transitions', requireAuth, async (req, res) => {
  try {
    const issue = await ComplaintStore.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found' });
    }
    const actions = calculateAllowedActions(issue, req.user);
    res.status(200).json({ ok: true, transitions: actions.allowedTransitions });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to get allowed transitions' });
  }
});

/**
 * POST /api/issues/:id/review-lock
 * Advisory non-blocking lock indicating ticket is being reviewed (5 minutes TTL)
 */
router.post('/:id/review-lock', requireAuth, requireRole('reviewer', 'officer', 'supervisor', 'admin'), async (req, res) => {
  try {
    const issue = await ComplaintStore.findById(req.params.id);
    if (!issue) return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found' });
    
    const userName = req.user.name || req.user.email;
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    issue.reviewingBy = userName;
    issue.reviewingUntil = until;
    await ComplaintStore.update(issue._id || issue.id, { reviewingBy: userName, reviewingUntil: until });

    res.status(200).json({ ok: true, reviewingBy: userName, reviewingUntil: until });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to set advisory review lock' });
  }
});

/**
 * POST /api/issues/:id/self-assign
 * Field officer self-assigns an unassigned ticket of their department
 */
router.post('/:id/self-assign', requireAuth, requireRole('officer'), async (req, res) => {
  try {
    if (process.env.SELF_ASSIGN_ENABLED === 'false') {
      return res.status(400).json({ ok: false, error: 'Self-assignment is disabled.' });
    }
    const issue = await ComplaintStore.findById(req.params.id);
    if (!issue) return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found' });
    const user = req.user;

    if (user.department && issue.department !== user.department) {
      const refusalMsg = `Officer department (${user.department}) does not match complaint department (${issue.department}).`;
      await WorkflowEventStore.create({
        complaint: (issue._id || issue.id).toString(),
        actor: (user._id || user.id).toString(),
        actorRole: user.role,
        action: 'Self Assign',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
        refusalReason: refusalMsg
      });
      return res.status(403).json({ ok: false, errorCode: 'DEPARTMENT_MISMATCH', error: refusalMsg, message: refusalMsg });
    }

    if (issue.status !== 'Accepted') {
      const refusalMsg = `Cannot self-assign: issue must be in Accepted status (current: ${issue.status}).`;
      await WorkflowEventStore.create({
        complaint: (issue._id || issue.id).toString(),
        actor: (user._id || user.id).toString(),
        actorRole: user.role,
        action: 'Self Assign',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
        refusalReason: refusalMsg
      });
      return res.status(400).json({ ok: false, error: refusalMsg, message: refusalMsg });
    }

    if (issue.assignedTo || issue.assignedToId) {
      return res.status(400).json({ ok: false, error: 'Ticket is already assigned.' });
    }

    if (!(await verifyOptimisticLock(issue, req.body.expectedVersion, user, 'Self Assign', res))) {
      return;
    }

    const officerId = (user._id || user.id).toString();
    issue.assignedTo = officerId;
    issue.assignedToId = officerId;
    issue.assignedToName = user.name;
    await bumpIssueVersion(issue);

    await ComplaintStore.update(issue._id || issue.id, {
      assignedTo: issue.assignedTo,
      assignedToName: issue.assignedToName,
      version: issue.version
    });

    await WorkflowEventStore.create({
      complaint: (issue._id || issue.id).toString(),
      actor: officerId,
      actorRole: user.role,
      action: 'Self Assign',
      outcome: 'accepted',
      fromStatus: 'Accepted',
      toStatus: 'Accepted',
      reason: 'Officer self-assigned ticket'
    });

    res.status(200).json({ ok: true, message: 'Ticket assigned to you.', issue, complaint: issue });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to self-assign ticket' });
  }
});

/**
 * GET /api/issues/:id/notes
 * Fetches notes for an issue (citizens only see CITIZEN_UPDATE notes)
 */
router.get('/:id/notes', requireAuth, async (req, res) => {
  try {
    const issueId = req.params.id;
    const user = req.user;
    let notes = await IssueNoteStore.find({ issueId });
    if (user.role === 'citizen') {
      notes = notes.filter(n => n.visibility === 'CITIZEN_UPDATE');
    }
    res.status(200).json({ ok: true, notes });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to fetch issue notes' });
  }
});

/**
 * POST /api/issues/:id/notes
 * Staff creates append-only note with INTERNAL or CITIZEN_UPDATE visibility
 */
router.post('/:id/notes', requireAuth, requireRole('reviewer', 'officer', 'supervisor', 'admin'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found' });
    const { body, visibility = 'INTERNAL', expectedVersion } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ ok: false, errorCode: 'BODY_REQUIRED', error: 'Note text is required.' });
    }

    if (!['INTERNAL', 'CITIZEN_UPDATE'].includes(visibility)) {
      return res.status(400).json({ ok: false, errorCode: 'INVALID_VISIBILITY', error: 'Visibility must be INTERNAL or CITIZEN_UPDATE' });
    }

    if (!(await verifyOptimisticLock(issue, expectedVersion, req.user, 'Add Note', res))) {
      return;
    }

    const note = await IssueNoteStore.create({
      issueId,
      authorId: (req.user._id || req.user.id).toString(),
      authorName: req.user.name,
      authorRole: req.user.role,
      body: body.trim(),
      visibility
    });

    await bumpIssueVersion(issue);

    await WorkflowEventStore.create({
      complaint: issueId,
      actor: (req.user._id || req.user.id).toString(),
      actorRole: req.user.role,
      action: 'Add Note',
      outcome: 'accepted',
      fromStatus: issue.status,
      toStatus: issue.status,
      reason: body.trim().slice(0, 100),
      metadata: { noteId: note.id, visibility }
    });

    if (visibility === 'CITIZEN_UPDATE') {
      const citizenId = (issue.citizen?._id || issue.citizen)?.toString();
      if (citizenId) {
        await NotificationStore.create({
          user: citizenId,
          complaint: issueId,
          message: `Update on ticket [${issue.trackingId || issue.publicRef}]: ${body.trim().slice(0, 80)}`,
          messageKey: 'CITIZEN_NOTE_UPDATE',
          params: { trackingId: issue.trackingId || issue.publicRef, text: body.trim().slice(0, 80) }
        });
      }
    }

    res.status(201).json({ ok: true, note, version: issue.version });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to add note' });
  }
});

/**
 * POST /api/issues/:id/close
 * Supervisor closes a resolved ticket
 */
router.post('/:id/close', requireAuth, requireRole('supervisor', 'admin'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found' });

    if (issue.status !== 'Resolved') {
      return res.status(400).json({ ok: false, error: `Only Resolved tickets can be closed (current: ${issue.status})` });
    }

    if (!(await verifyOptimisticLock(issue, req.body.expectedVersion, req.user, 'Close', res))) {
      return;
    }

    issue.status = 'Closed';
    issue.closedAt = new Date().toISOString();
    await bumpIssueVersion(issue);

    await ComplaintStore.update(issueId, { status: 'Closed', closedAt: issue.closedAt, version: issue.version });

    await WorkflowEventStore.create({
      complaint: issueId,
      actor: (req.user._id || req.user.id).toString(),
      actorRole: req.user.role,
      action: 'Close Ticket',
      outcome: 'accepted',
      fromStatus: 'Resolved',
      toStatus: 'Closed',
      reason: req.body.reason || 'Supervisor verified and closed ticket'
    });

    res.status(200).json({ ok: true, message: 'Ticket closed.', issue, complaint: issue });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Failed to close ticket' });
  }
});

/**
 * POST /api/issues/:id/reopen-request
 * Citizen requests reopening within REOPEN_WINDOW_DAYS (default 7 days) of resolution.
 */
router.post('/:id/reopen-request', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const { reason } = req.body;
    const citizenId = (req.user._id || req.user.id).toString();

    const issue = await ComplaintStore.findById(issueId);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    const reporterId = (issue.citizen?._id || issue.citizen)?.toString();
    if (reporterId !== citizenId) {
      return res.status(403).json({
        ok: false,
        errorCode: 'REPORTER_REQUIRED',
        error: 'Forbidden: Only the reporting citizen can request reopening.',
        message: 'Forbidden: Only the reporting citizen can request reopening.'
      });
    }

    if (!['Resolved', 'Closed', 'RESOLVED', 'CLOSED'].includes(issue.status)) {
      return res.status(400).json({
        ok: false,
        errorCode: 'NOT_RESOLVED',
        error: `Cannot request reopening: Issue is currently in status "${issue.status}".`,
        message: `Cannot request reopening: Issue is currently in status "${issue.status}".`
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        ok: false,
        errorCode: 'REOPEN_REASON_REQUIRED',
        error: 'A mandatory reason is required to request reopening.',
        message: 'A mandatory reason is required to request reopening.'
      });
    }

    // 7-day window rule
    const resolvedTime = issue.resolvedAt ? new Date(issue.resolvedAt).getTime() : new Date(issue.updatedAt || issue.createdAt).getTime();
    const windowMs = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - resolvedTime > windowMs) {
      const refusalMsg = `Reopening window expired. Reopen requests must be submitted within ${REOPEN_WINDOW_DAYS} days of resolution.`;
      await WorkflowEventStore.create({
        complaint: issueId,
        actor: citizenId,
        actorRole: 'citizen',
        action: 'Request Reopening',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
        reason: reason.trim(),
        refusalReason: refusalMsg
      });
      return res.status(400).json({
        ok: false,
        errorCode: 'REOPEN_WINDOW_EXPIRED',
        error: refusalMsg,
        message: refusalMsg,
        resolvedAt: issue.resolvedAt
      });
    }

    // Record ReopenRequest in memory and SQLite
    const reopenReq = await ReopenRequestStore.create({
      issueId,
      citizenId,
      reason: reason.trim()
    });

    issue.reopenRequest = {
      requested: true,
      reason: reason.trim(),
      requestedAt: new Date(),
      status: 'PENDING'
    };
    await ComplaintStore.update(issueId, { reopenRequest: issue.reopenRequest });

    // Audit event
    await WorkflowEventStore.create({
      complaint: issueId,
      actor: citizenId,
      actorRole: 'citizen',
      action: 'Request Reopening',
      outcome: 'accepted',
      fromStatus: issue.status,
      toStatus: issue.status,
      reason: reason.trim()
    });

    // Notify Supervisor
    await NotificationStore.create({
      user: null,
      message: `[Reopen Request] Citizen requested reopening for grievance ${issue.trackingId || issue.publicRef || issueId}: "${reason.trim()}"`,
      messageKey: 'REOPEN_REQUESTED',
      params: { trackingId: issue.trackingId || issue.publicRef || issueId, reason: reason.trim() },
      complaint: issueId,
      targetRoles: ['supervisor', 'reviewer']
    });

    res.status(200).json({
      ok: true,
      message: 'Reopening request submitted for supervisor/reviewer evaluation.',
      reopenRequest: reopenReq,
      issue
    });
  } catch (error) {
    console.error('Error submitting reopen request:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to submit reopen request', message: 'Failed to submit reopen request' });
  }
});

/**
 * POST /api/issues/:id/reopen-decision
 * Supervisor/Reviewer decides on citizen reopening request
 */
router.post('/:id/reopen-decision', requireAuth, requireRole('reviewer', 'supervisor'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    const { decision, reason } = req.body; // 'approved' or 'rejected'
    if (!['approved', 'rejected', 'APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ ok: false, errorCode: 'INVALID_DECISION', error: 'Decision must be approved or rejected', message: 'Decision must be approved or rejected' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, errorCode: 'REASON_REQUIRED', error: 'A mandatory reason is required for reopening decision', message: 'A mandatory reason is required for reopening decision' });
    }

    const user = req.user;
    const isApproved = decision.toLowerCase() === 'approved';

    if (isApproved) {
      // Transition back to Under Review via workflow engine
      const result = await attemptTransition({
        complaint: issue,
        toStatus: 'Under Review',
        actor: user,
        payload: { reason: `Reopening approved: ${reason.trim()}` }
      });

      if (!result.success) {
        return res.status(result.statusCode).json({
          ok: false,
          errorCode: result.errorCode,
          error: result.message,
          message: result.message
        });
      }

      await ReopenRequestStore.update(issueId, { status: 'APPROVED', decidedById: user.id || user._id, decisionReason: reason.trim() });

      // Notify Citizen
      const citizenId = (issue.citizen?._id || issue.citizen)?.toString();
      if (citizenId) {
        await NotificationStore.create({
          user: citizenId,
          complaint: issueId,
          message: `Your reopening request for grievance [${issue.trackingId || issue.publicRef || issueId}] was approved.`,
          messageKey: 'REOPEN_DECIDED',
          params: { trackingId: issue.trackingId || issue.publicRef || issueId, decision: 'approved' }
        });
      }

      return res.status(200).json({
        ok: true,
        message: 'Reopening approved. Grievance returned to Under Review.',
        issue: result.complaint
      });
    } else {
      await ReopenRequestStore.update(issueId, { status: 'REJECTED', decidedById: user.id || user._id, decisionReason: reason.trim() });

      await WorkflowEventStore.create({
        complaint: issueId,
        actor: user.id || user._id,
        actorRole: user.role,
        action: 'Reopen Decision',
        outcome: 'accepted',
        fromStatus: issue.status,
        toStatus: issue.status,
        reason: `Reopening request rejected: ${reason.trim()}`
      });

      const citizenId = (issue.citizen?._id || issue.citizen)?.toString();
      if (citizenId) {
        await NotificationStore.create({
          user: citizenId,
          complaint: issueId,
          message: `Your reopening request for grievance [${issue.trackingId || issue.publicRef || issueId}] was declined: "${reason.trim()}".`,
          messageKey: 'REOPEN_DECIDED',
          params: { trackingId: issue.trackingId || issue.publicRef || issueId, decision: 'rejected' }
        });
      }

      return res.status(200).json({
        ok: true,
        message: 'Reopening request declined. Issue remains Resolved.',
        issue
      });
    }
  } catch (error) {
    console.error('Error processing reopen decision:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to process reopen decision', message: 'Failed to process reopen decision' });
  }
});

/**
 * POST /api/issues/:id/reroute
 * Supervisor or Admin re-categorises / re-routes an issue.
 * Recomputes deadlines from original submittedAt, clears assigned officer,
 * records DeadlineChange and AuditEvent.
 */
router.post('/:id/reroute', requireAuth, async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    if (req.user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor reroute tool.';
      await WorkflowEventStore.create({
        complaint: issueId,
        actor: (req.user._id || req.user.id).toString(),
        actorRole: req.user.role,
        action: 'Reroute Issue',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
        refusalReason
      });
      return res.status(403).json({ ok: false, errorCode: 'SUPERVISOR_ONLY', error: refusalReason, message: refusalReason });
    }
    if (!['supervisor', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ ok: false, errorCode: 'FORBIDDEN', error: 'Forbidden: Supervisor or Admin required.' });
    }

    const { categoryId, subcategoryId, department, category, reason, expectedVersion } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        ok: false,
        errorCode: 'REASON_REQUIRED',
        error: 'A mandatory reason is required to reroute an issue.',
        message: 'A mandatory reason is required to reroute an issue.'
      });
    }

    if (!(await verifyOptimisticLock(issue, expectedVersion, req.user, 'Reroute Issue', res))) {
      return;
    }

    const targetDept = department || issue.department;
    const targetCat = category || issue.category;
    const user = req.user;

    // Calculate new deadlines starting from original submittedAt
    const submittedTime = new Date(issue.submittedAt || issue.createdAt).getTime();
    const durations = getDeadlineDurations(targetDept, issue.priority || 'Normal');
    const oldResponseDue = issue.initialResponseDue || issue.responseDeadline;
    const oldResolutionDue = issue.resolutionDue;
    const newResponseDue = new Date(submittedTime + durations.initialResponseMs);
    const newResolutionDue = new Date(submittedTime + durations.resolutionMs);

    const oldValues = {
      department: issue.department,
      category: issue.category,
      assignedTo: issue.assignedTo
    };

    // Apply updates: clear assigned officer
    issue.department = targetDept;
    issue.category = targetCat;
    if (categoryId) issue.categoryId = categoryId;
    if (subcategoryId) issue.subcategoryId = subcategoryId;
    issue.assignedTo = null;
    issue.assignedToName = null;
    issue.initialResponseDue = newResponseDue;
    issue.responseDeadline = newResponseDue;
    issue.resolutionDue = newResolutionDue;

    await ComplaintStore.update(issueId, {
      department: issue.department,
      category: issue.category,
      categoryId: issue.categoryId,
      subcategoryId: issue.subcategoryId,
      assignedTo: null,
      assignedToName: null,
      initialResponseDue: newResponseDue,
      responseDeadline: newResponseDue,
      resolutionDue: newResolutionDue
    });

    // Record DeadlineChange in SQLite
    try {
      db.prepare(`
        INSERT INTO DeadlineChange (id, issueId, oldResponseDue, newResponseDue, oldResolutionDue, newResolutionDue, reason, actorId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `dc-${Date.now()}`,
        issueId,
        oldResponseDue ? new Date(oldResponseDue).toISOString() : null,
        newResponseDue.toISOString(),
        oldResolutionDue ? new Date(oldResolutionDue).toISOString() : null,
        newResolutionDue.toISOString(),
        reason.trim(),
        (user._id || user.id).toString(),
        new Date().toISOString()
      );
    } catch (e) { /* ignore */ }

    // Audit Event
    await WorkflowEventStore.create({
      complaint: issueId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Reroute Issue',
      outcome: 'accepted',
      fromStatus: issue.status,
      toStatus: issue.status,
      reason: reason.trim(),
      metadata: { oldValues, targetDept, targetCat }
    });

    await bumpIssueVersion(issue);

    res.status(200).json({
      ok: true,
      message: 'Issue rerouted and deadlines recomputed.',
      issue
    });
  } catch (error) {
    console.error('Error rerouting issue:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to reroute issue', message: 'Failed to reroute issue' });
  }
});

/**
 * POST /api/issues/:id/priority
 * Supervisor only: Override priority (Normal | High | Critical) with mandatory reason.
 * Recomputes deadlines and logs an audit event.
 * Officers calling this get 403 + REFUSED audit event.
 */
router.post('/:id/priority', requireAuth, async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) return res.status(404).json({ ok: false, error: 'Issue not found' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor priority override tool.';
      await WorkflowEventStore.create({
        complaint: issueId,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Override Priority',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
        refusalReason
      });
      return res.status(403).json({
        ok: false,
        error: refusalReason,
        errorCode: 'SUPERVISOR_ONLY',
        message: refusalReason
      });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!(await verifyOptimisticLock(issue, req.body.expectedVersion, user, 'Override Priority', res))) {
      return;
    }

    const { priority, reason } = req.body;
    if (!['Normal', 'High', 'Critical'].includes(priority)) {
      return res.status(400).json({ ok: false, error: 'Valid priority is required (Normal, High, Critical).' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'A mandatory reason is required for priority override.',
        errorCode: 'REASON_REQUIRED'
      });
    }

    await updatePriorityWithDeadlines(issue, priority, user, reason.trim());
    await bumpIssueVersion(issue);

    const citizenId = issue.citizen ? (issue.citizen._id || issue.citizen).toString() : null;
    if (citizenId) {
      await NotificationStore.create({
        user: citizenId,
        complaint: issueId,
        message: `Priority for grievance [${issue.trackingId}] updated to ${priority}.`,
        messageKey: 'PRIORITY_CHANGED',
        params: { trackingId: issue.trackingId, priority }
      });
    }

    res.status(200).json({
      ok: true,
      message: `Priority updated to ${priority}. Deadlines recomputed.`,
      issue
    });
  } catch (error) {
    console.error('Error overriding priority:', error);
    res.status(500).json({ ok: false, error: 'Failed to override priority.' });
  }
});

/**
 * POST /api/issues/:id/deadline
 * Supervisor only: adjust deadline SLA with mandatory reason.
 * Officers calling this get 403 + REFUSED audit event.
 */
router.post('/:id/deadline', requireAuth, async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) return res.status(404).json({ ok: false, error: 'Issue not found' });

    const user = req.user;
    if (user.role === 'officer') {
      const refusalReason = 'Officers are not permitted to use supervisor deadline tool.';
      await WorkflowEventStore.create({
        complaint: issueId,
        actor: user._id || user.id,
        actorRole: user.role,
        action: 'Change Deadline',
        outcome: 'refused',
        fromStatus: issue.status,
        toStatus: issue.status,
        refusalReason
      });
      return res.status(403).json({
        ok: false,
        error: refusalReason,
        errorCode: 'SUPERVISOR_ONLY',
        message: refusalReason
      });
    }

    if (!['supervisor', 'admin'].includes(user.role)) {
      return res.status(403).json({ ok: false, error: 'Forbidden: Supervisor or Admin required.' });
    }

    if (!(await verifyOptimisticLock(issue, req.body.expectedVersion, user, 'Change Deadline', res))) {
      return;
    }

    const { days, newResolutionDue, reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({
        ok: false,
        error: 'A mandatory reason is required to change deadline.',
        errorCode: 'REASON_REQUIRED'
      });
    }

    const oldResolutionDue = issue.resolutionDue;
    let targetResolutionDue;
    if (days) {
      targetResolutionDue = new Date(Date.now() + Number(days) * 86400000);
    } else if (newResolutionDue) {
      targetResolutionDue = new Date(newResolutionDue);
    } else {
      return res.status(400).json({ ok: false, error: 'Please specify days or newResolutionDue date.' });
    }

    issue.resolutionDue = targetResolutionDue;
    await bumpIssueVersion(issue);
    await ComplaintStore.update(issueId, {
      resolutionDue: targetResolutionDue,
      version: issue.version
    });

    try {
      db.prepare(`
        INSERT INTO DeadlineChange (id, issueId, oldResponseDue, newResponseDue, oldResolutionDue, newResolutionDue, reason, actorId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `dc-${Date.now()}`,
        issueId,
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
      complaint: issueId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: 'Change Deadline',
      outcome: 'accepted',
      fromStatus: issue.status,
      toStatus: issue.status,
      reason: reason.trim()
    });

    res.status(200).json({
      ok: true,
      message: 'Deadline updated successfully.',
      issue
    });
  } catch (error) {
    console.error('Error changing deadline:', error);
    res.status(500).json({ ok: false, error: 'Failed to change deadline.' });
  }
});

/**
 * POST /api/issues/:id/emergency/verify
 * Supervisor or Officer of the same department verifies or dismisses emergency flag
 */
router.post('/:id/emergency/verify', requireAuth, requireRole('supervisor', 'officer', 'reviewer', 'admin'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    const user = req.user;
    if (user.role === 'officer' && user.department && user.department !== issue.department) {
      return res.status(403).json({
        ok: false,
        errorCode: 'DEPARTMENT_MISMATCH',
        error: `Officer of department ${user.department} cannot verify emergency for department ${issue.department}`,
        message: `Officer of department ${user.department} cannot verify emergency for department ${issue.department}`
      });
    }

    const decision = req.body.decision || req.body.action;
    const reason = req.body.reason;
    if (!['VERIFIED', 'DISMISSED', 'verified', 'dismissed'].includes(decision)) {
      return res.status(400).json({ ok: false, errorCode: 'INVALID_DECISION', error: 'Decision must be VERIFIED or DISMISSED', message: 'Decision must be VERIFIED or DISMISSED' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ ok: false, errorCode: 'REASON_REQUIRED', error: 'A mandatory reason is required for emergency decision', message: 'A mandatory reason is required for emergency decision' });
    }

    const isVerified = decision.toUpperCase() === 'VERIFIED';
    issue.emergencyStatus = isVerified ? 'VERIFIED' : 'DISMISSED';
    issue.isCriticalVerified = isVerified;

    if (isVerified) {
      await updatePriorityWithDeadlines(issue, 'Critical', user, `Emergency verified: ${reason.trim()}`);
    } else {
      await ComplaintStore.update(issueId, { emergencyStatus: 'DISMISSED', isCriticalVerified: false });
    }

    await EmergencyFlagStore.create({
      issueId,
      flaggedById: (issue.citizen?._id || issue.citizen || 'system').toString(),
      concern: reason.trim(),
      status: isVerified ? 'VERIFIED' : 'DISMISSED',
      verifiedById: (user._id || user.id).toString(),
      reason: reason.trim()
    });

    await WorkflowEventStore.create({
      complaint: issueId,
      actor: user._id || user.id,
      actorRole: user.role,
      action: isVerified ? 'Verify Emergency' : 'Dismiss Emergency',
      outcome: 'accepted',
      fromStatus: issue.status,
      toStatus: issue.status,
      reason: reason.trim()
    });

    const citizenId = (issue.citizen?._id || issue.citizen)?.toString();
    if (citizenId && isVerified) {
      await NotificationStore.create({
        user: citizenId,
        complaint: issueId,
        message: `Emergency flag verified for grievance [${issue.trackingId || issue.publicRef || issueId}]. Escalated to Critical.`,
        messageKey: 'EMERGENCY_VERIFIED',
        params: { trackingId: issue.trackingId || issue.publicRef || issueId }
      });
    }

    sseHub.broadcast({ type: 'EMERGENCY_UPDATED', issueId, emergencyStatus: issue.emergencyStatus, priority: issue.priority });

    res.status(200).json({
      ok: true,
      message: `Emergency flag ${isVerified ? 'verified as Critical' : 'dismissed'}.`,
      issue
    });
  } catch (error) {
    console.error('Error verifying emergency:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to verify emergency', message: 'Failed to verify emergency' });
  }
});

/**
 * POST /api/issues/:id/rating
 * Reporter only, once, after issue is CLOSED or RESOLVED
 */
router.post('/:id/rating', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    const citizenId = (req.user._id || req.user.id).toString();
    const reporterId = (issue.citizen?._id || issue.citizen)?.toString();
    if (reporterId !== citizenId) {
      return res.status(403).json({
        ok: false,
        errorCode: 'REPORTER_REQUIRED',
        error: 'Forbidden: Only the reporting citizen can rate the resolution.',
        message: 'Forbidden: Only the reporting citizen can rate the resolution.'
      });
    }

    if (!['Resolved', 'Closed', 'RESOLVED', 'CLOSED'].includes(issue.status)) {
      return res.status(400).json({
        ok: false,
        errorCode: 'NOT_CLOSED',
        error: 'Ratings can only be submitted after the issue is resolved or closed.',
        message: 'Ratings can only be submitted after the issue is resolved or closed.'
      });
    }

    const { rating, comment } = req.body;
    const numRating = parseInt(rating, 10);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        ok: false,
        errorCode: 'INVALID_RATING',
        error: 'Rating must be an integer between 1 and 5.',
        message: 'Rating must be an integer between 1 and 5.'
      });
    }

    // Unique per pair check
    const existing = await SatisfactionRatingStore.findOne({ issueId, citizenId });
    if (existing) {
      return res.status(409).json({
        ok: false,
        errorCode: 'ALREADY_RATED',
        error: 'You have already submitted a rating for this grievance.',
        message: 'You have already submitted a rating for this grievance.'
      });
    }

    const ratingRecord = await SatisfactionRatingStore.create({
      issueId,
      citizenId,
      rating: numRating,
      comment: (comment || '').trim() || null
    });

    res.status(200).json({
      ok: true,
      message: 'Thank you for your feedback!',
      rating: ratingRecord
    });
  } catch (error) {
    if (error.code === 11000 || error.message?.includes('UNIQUE')) {
      return res.status(409).json({
        ok: false,
        errorCode: 'ALREADY_RATED',
        error: 'You have already submitted a rating for this grievance.',
        message: 'You have already submitted a rating for this grievance.'
      });
    }
    console.error('Error submitting rating:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to submit rating', message: 'Failed to submit rating' });
  }
});

/**
 * POST /api/issues/:id/support
 * Citizen supports an active issue (once per citizen)
 */
router.post('/:id/support', requireAuth, requireRole('citizen'), async (req, res) => {
  try {
    const issueId = req.params.id;
    const issue = await ComplaintStore.findById(issueId);
    if (!issue) {
      return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found', message: 'Issue not found' });
    }

    if (issue.status === 'Rejected' || issue.status === 'REJECTED') {
      return res.status(400).json({ ok: false, errorCode: 'REJECTED', error: 'Cannot support a rejected issue', message: 'Cannot support a rejected issue' });
    }

    const userId = (req.user._id || req.user.id).toString();
    const reporterId = (issue.citizen?._id || issue.citizen)?.toString();
    if (reporterId === userId) {
      return res.status(409).json({
        ok: false,
        errorCode: 'CANNOT_SUPPORT_OWN',
        error: 'You are the original reporter of this grievance.',
        message: 'You are the original reporter of this grievance.'
      });
    }

    const existing = await SupportStore.findOne({ complaint: issueId, citizen: userId });
    if (existing) {
      return res.status(409).json({
        ok: false,
        errorCode: 'ALREADY_SUPPORTED',
        error: 'You have already supported this grievance.',
        message: 'You have already supported this grievance.'
      });
    }

    try {
      await SupportStore.create({
        complaint: issueId,
        citizen: userId
      });
    } catch (e) {
      return res.status(409).json({
        ok: false,
        errorCode: 'ALREADY_SUPPORTED',
        error: 'You have already supported this grievance.',
        message: 'You have already supported this grievance.'
      });
    }

    const count = await SupportStore.countDocuments({ complaint: issueId });
    const distinctCitizenCount = count + 1; // Supporters + 1 reporter
    issue.supportCount = distinctCitizenCount;
    issue.distinctCitizenCount = distinctCitizenCount;

    let priorityEscalated = false;
    if (distinctCitizenCount >= 5 && issue.priority === 'Normal') {
      issue.priority = 'High';
      priorityEscalated = true;
      const deadlines = calculateDeadlines(issue.department, 'High');
      issue.initialResponseDue = deadlines.initialResponseDue;
      issue.resolutionDue = deadlines.resolutionDue;

      await WorkflowEventStore.create({
        complaint: issueId,
        actor: userId,
        actorRole: 'system',
        action: 'Priority Auto-Escalation',
        outcome: 'system',
        fromStatus: issue.status,
        toStatus: issue.status,
        reason: `Priority escalated to High: Reached ${distinctCitizenCount} distinct citizen supporters.`
      });
    }

    await ComplaintStore.update(issueId, {
      supportCount: distinctCitizenCount,
      distinctCitizenCount,
      priority: issue.priority,
      initialResponseDue: issue.initialResponseDue,
      resolutionDue: issue.resolutionDue
    });

    sseHub.broadcast({
      type: 'ISSUE_SUPPORTED',
      issueId,
      distinctCitizenCount,
      priority: issue.priority,
      priorityEscalated
    });

    res.status(200).json({
      ok: true,
      message: 'Thank you for supporting this community issue!',
      supportCount: distinctCitizenCount,
      distinctCitizenCount,
      priority: issue.priority,
      priorityEscalated
    });
  } catch (error) {
    console.error('Error supporting issue:', error);
    res.status(500).json({ ok: false, errorCode: 'SERVER_ERROR', error: 'Failed to record support', message: 'Failed to record support' });
  }
});

module.exports = router;
