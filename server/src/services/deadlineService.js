const { getDeadlineDurations } = require('../config/workflow.config');
const { WorkflowEventStore } = require('./memoryStore');
const mongoose = require('mongoose');

/**
 * Calculates and returns initialResponseDue and resolutionDue based on department & priority
 * @param {string} department 
 * @param {string} priority 
 * @param {Date} baseDate 
 * @returns {{ initialResponseDue: Date, resolutionDue: Date }}
 */
function calculateDeadlines(department = 'others', priority = 'Normal', baseDate = new Date()) {
  const { initialResponseMs, resolutionMs } = getDeadlineDurations(department, priority);
  const nowMs = baseDate.getTime();

  return {
    initialResponseDue: new Date(nowMs + initialResponseMs),
    resolutionDue: new Date(nowMs + resolutionMs)
  };
}

/**
 * Recomputes complaint deadlines if priority or department changes,
 * and logs a system WorkflowEvent if recomputed.
 * @param {object} complaint 
 * @param {string} newPriority 
 * @param {object} actor (optional, null for system)
 */
async function updatePriorityWithDeadlines(complaint, newPriority, actor = null, customReason = null) {
  if (complaint.priority === newPriority) return complaint;

  const oldPriority = complaint.priority;
  const baseTime = complaint.createdAt ? new Date(complaint.createdAt) : new Date();
  const { initialResponseDue, resolutionDue } = calculateDeadlines(complaint.department, newPriority, baseTime);

  complaint.priority = newPriority;
  complaint.initialResponseDue = initialResponseDue;
  complaint.resolutionDue = resolutionDue;

  const complaintId = complaint._id ? complaint._id.toString() : complaint.id;

  if (complaint.save && typeof complaint.save === 'function') {
    await complaint.save();
  } else {
    const { ComplaintStore } = require('./memoryStore');
    await ComplaintStore.update(complaintId, {
      priority: complaint.priority,
      initialResponseDue: complaint.initialResponseDue,
      resolutionDue: complaint.resolutionDue
    });
  }

  // Append immutable system / official WorkflowEvent
  const reasonText = customReason
    ? `${customReason} (Priority changed from ${oldPriority} to ${newPriority}. Deadlines recomputed).`
    : `Priority updated from ${oldPriority} to ${newPriority}. Deadlines recomputed.`;

  await WorkflowEventStore.create({
    complaint: complaintId,
    actor: actor ? (actor._id || actor.id) : null,
    actorRole: actor ? actor.role : 'system',
    action: 'Override Priority',
    outcome: 'system',
    fromStatus: complaint.status,
    toStatus: complaint.status,
    reason: reasonText
  });

  return complaint;
}

module.exports = {
  calculateDeadlines,
  updatePriorityWithDeadlines
};
