const { STATES, TRANSITIONS } = require('../config/workflow.config');
const { WorkflowEventStore, ComplaintStore } = require('./memoryStore');
const mongoose = require('mongoose');

/**
 * Attempts a status transition on a complaint.
 * EVERY status change in Nagar Setu must pass through this single function.
 * 
 * Rules:
 * 1. Rejected is final.
 * 2. Refuses invalid / skipped transitions with informative error message.
 * 3. Refuses unauthorized actor role or mismatched department scope.
 * 4. Refuses missing mandatory reasons or required payload fields.
 * 5. ON SUCCESS: updates complaint, logs WorkflowEvent(outcome: 'accepted').
 * 6. ON REFUSAL: logs WorkflowEvent(outcome: 'refused', refusalReason), returns status 400/403.
 * 
 * @param {object} params
 * @param {object} params.complaint - Complaint document or object
 * @param {string} params.toStatus - Target status
 * @param {object} params.actor - Authenticated user { _id, role, department, name }
 * @param {object} params.payload - { reason, resolutionNote, newDepartment, newCategory, ... }
 * @returns {Promise<{ success: boolean, statusCode: number, message: string, complaint: object, event: object }>}
 */
async function attemptTransition({ complaint, toStatus, actor, payload = {} }) {
  if (!complaint) {
    throw new Error('A valid complaint object is required for transition.');
  }

  const fromStatus = complaint.status;
  const complaintId = complaint._id ? complaint._id.toString() : complaint.id;
  const actorId = actor ? (actor._id ? actor._id.toString() : actor.id) : null;
  const actorRole = actor ? actor.role : 'anonymous';

  // Rule 0: Rejected is final
  if (fromStatus === STATES.REJECTED) {
    const refusalReason = 'Complaint has been Rejected. Rejected is a final state and cannot be transitioned.';
    const event = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: actorId,
      actorRole,
      action: 'Transition Attempt',
      outcome: 'refused',
      fromStatus,
      toStatus,
      reason: payload.reason || null,
      refusalReason
    });
    return {
      success: false,
      statusCode: 400,
      message: refusalReason,
      errorCode: 'FINAL_STATE_REJECTED',
      params: {},
      complaint,
      event
    };
  }

  // Find all possible transitions from current state
  const possibleTransitions = TRANSITIONS.filter(t => t.from === fromStatus);
  const targetTransition = possibleTransitions.find(t => t.to === toStatus);

  // Rule 1: Check skipped or invalid transition
  if (!targetTransition) {
    const allowedNext = possibleTransitions.map(t => t.to).join(', ') || 'None (terminal state)';
    const refusalReason = `Cannot move from ${fromStatus} to ${toStatus}. Allowed next states: ${allowedNext}.`;
    const event = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: actorId,
      actorRole,
      action: 'Invalid Transition',
      outcome: 'refused',
      fromStatus,
      toStatus,
      reason: payload.reason || null,
      refusalReason
    });
    return {
      success: false,
      statusCode: 400,
      message: refusalReason,
      errorCode: 'INVALID_TRANSITION',
      params: { from: fromStatus, to: toStatus, allowed: allowedNext },
      complaint,
      event
    };
  }

  const actionName = targetTransition.action;

  // Rule 2: Check actor role permission
  if (!targetTransition.allowedRoles.includes(actorRole)) {
    const refusalReason = `Role ${actorRole} is not permitted to perform ${actionName}. Required roles: [${targetTransition.allowedRoles.join(', ')}].`;
    const event = await WorkflowEventStore.create({
      complaint: complaintId,
      actor: actorId,
      actorRole,
      action: actionName,
      outcome: 'refused',
      fromStatus,
      toStatus,
      reason: payload.reason || null,
      refusalReason
    });
    return {
      success: false,
      statusCode: 403,
      message: refusalReason,
      errorCode: 'UNAUTHORIZED_ROLE',
      params: { role: actorRole, action: actionName },
      complaint,
      event
    };
  }

  // Rule 3: Check department-scoped role enforcement (e.g. Officer of that department)
  if (targetTransition.departmentScoped) {
    if (!actor.department || actor.department !== complaint.department) {
      const refusalReason = `Officer department (${actor.department || 'none'}) does not match complaint department (${complaint.department}). Only officers of department '${complaint.department}' can perform ${actionName}.`;
      const event = await WorkflowEventStore.create({
        complaint: complaintId,
        actor: actorId,
        actorRole,
        action: actionName,
        outcome: 'refused',
        fromStatus,
        toStatus,
        reason: payload.reason || null,
        refusalReason
      });
      return {
        success: false,
        statusCode: 403,
        message: refusalReason,
        errorCode: 'DEPARTMENT_MISMATCH',
        params: { complaintDepartment: complaint.department, actorDepartment: actor.department || 'none' },
        complaint,
        event
      };
    }
  }

  // Rule 4: Check mandatory reason
  if (targetTransition.requiresReason) {
    const reasonText = (payload.reason || '').trim();
    if (!reasonText) {
      const refusalReason = `A mandatory reason must be provided for action '${actionName}' when moving to ${toStatus}.`;
      const event = await WorkflowEventStore.create({
        complaint: complaintId,
        actor: actorId,
        actorRole,
        action: actionName,
        outcome: 'refused',
        fromStatus,
        toStatus,
        reason: null,
        refusalReason
      });
      return {
        success: false,
        statusCode: 400,
        message: refusalReason,
        errorCode: 'REASON_REQUIRED',
        params: { action: actionName },
        complaint,
        event
      };
    }
  }

  // Rule 5: Check mandatory requiredFields (e.g., resolutionNote)
  if (targetTransition.requiresFields && targetTransition.requiresFields.length > 0) {
    for (const field of targetTransition.requiresFields) {
      const val = (payload[field] || '').toString().trim();
      if (!val) {
        const refusalReason = `Field '${field}' is mandatory for action '${actionName}' to state ${toStatus}.`;
        const event = await WorkflowEventStore.create({
          complaint: complaintId,
          actor: actorId,
          actorRole,
          action: actionName,
          outcome: 'refused',
          fromStatus,
          toStatus,
          reason: payload.reason || null,
          refusalReason
        });
        return {
          success: false,
          statusCode: 400,
          message: refusalReason,
          errorCode: 'FIELD_REQUIRED',
          params: { field },
          complaint,
          event
        };
      }
    }
  }

  // SUCCESS PATH: All constraints passed!
  // Apply state change & payload updates to complaint
  complaint.status = toStatus;

  // Specific state mutations:
  if (toStatus === STATES.IN_PROGRESS && actorRole === 'officer') {
    complaint.assignedTo = actorId;
  }

  if (toStatus === STATES.RESOLVED) {
    complaint.resolutionNote = (payload.resolutionNote || '').trim();
    complaint.resolvedAt = new Date();
  }

  if (toStatus === STATES.ACCEPTED) {
    // Reviewer may correct department or category with reason
    if (payload.newDepartment && ['waste', 'roads', 'water', 'others'].includes(payload.newDepartment)) {
      complaint.department = payload.newDepartment;
    }
    if (payload.newCategory) {
      complaint.category = payload.newCategory;
    }
  }

  if (toStatus === STATES.UNDER_REVIEW && fromStatus === STATES.RESOLVED) {
    complaint.reopenCount = (complaint.reopenCount || 0) + 1;
    complaint.resolvedAt = null;
  }

  // Save changes
  if (complaint.save && typeof complaint.save === 'function') {
    await complaint.save();
  } else {
    await ComplaintStore.update(complaintId, {
      status: complaint.status,
      assignedTo: complaint.assignedTo,
      resolutionNote: complaint.resolutionNote,
      resolvedAt: complaint.resolvedAt,
      department: complaint.department,
      category: complaint.category,
      reopenCount: complaint.reopenCount
    });
  }

  // Append accepted WorkflowEvent
  const acceptedEvent = await WorkflowEventStore.create({
    complaint: complaintId,
    actor: actorId,
    actorRole,
    action: actionName,
    outcome: 'accepted',
    fromStatus,
    toStatus,
    reason: payload.reason || null,
    refusalReason: null
  });

  // Notify the citizen on every accepted status change
  try {
    const { NotificationStore } = require('./memoryStore');
    const citizenUserId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : null;
    if (citizenUserId) {
      const trackingId = complaint.trackingId || complaintId;
      await NotificationStore.create({
        user: citizenUserId,
        complaint: complaintId,
        message: `Your grievance [${trackingId}] status has been updated to "${toStatus}" (${actionName}).`,
        isRead: false
      });
    }
  } catch (notifErr) {
    console.error('Failed to notify citizen on status transition:', notifErr.message);
  }

  return {
    success: true,
    statusCode: 200,
    message: `Transition to ${toStatus} succeeded.`,
    complaint,
    event: acceptedEvent
  };
}

module.exports = {
  attemptTransition
};
