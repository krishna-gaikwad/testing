const cron = require('node-cron');
const { STATES, ESCALATION_RULES } = require('../config/workflow.config');
const {
  ComplaintStore,
  WorkflowEventStore,
  NotificationStore,
  EscalationEventStore
} = require('./memoryStore');
const { prisma } = require('../db/sqlite');
const { sseHub } = require('./sseHub');

const AUTO_CLOSE_DAYS = parseInt(process.env.AUTO_CLOSE_DAYS || '7', 10);
let isJobRunning = false;

/**
 * Checks all active complaints/issues against deadlines:
 * - Response deadline: still SUBMITTED past responseDeadline -> MISSED_DEADLINE, EscalationEvent(RESPONSE, 1), supervisor notification
 * - Resolution deadline: not RESOLVED past resolutionDue -> MISSED_DEADLINE, EscalationEvent(RESOLUTION, 2), supervisor notification
 * - Auto-close: RESOLVED after AUTO_CLOSE_DAYS -> CLOSED by system
 * - Worker records heartbeat
 */
async function checkEscalations() {
  if (isJobRunning) return { skipped: true, reason: 'Already running' };
  isJobRunning = true;

  try {
    const now = new Date();
    const all = await ComplaintStore.find({});
    const activeComplaints = all.filter(c => c.status !== 'Closed' && c.status !== 'CLOSED' && c.status !== 'Rejected' && c.status !== 'REJECTED');

    let responseEscalations = 0;
    let resolutionEscalations = 0;
    let autoClosedCount = 0;

    for (const c of activeComplaints) {
      const complaintId = (c._id || c.id).toString();

      // ----------------------------------------------------
      // 1. RESPONSE DEADLINE ESCALATION (kind: RESPONSE)
      // ----------------------------------------------------
      const responseDueTime = c.responseDeadline ? new Date(c.responseDeadline) : (c.initialResponseDue ? new Date(c.initialResponseDue) : null);
      if (
        ['Submitted', 'SUBMITTED'].includes(c.status) &&
        responseDueTime &&
        now > responseDueTime
      ) {
        // Idempotency check via unique (issueId, kind, level)
        const existingEsc = await EscalationEventStore.findOne({
          issueId: complaintId,
          kind: 'RESPONSE',
          level: 1
        });

        if (!existingEsc) {
          try {
            await EscalationEventStore.create({
              issueId: complaintId,
              kind: 'RESPONSE',
              level: 1
            });

            c.isOverdue = true;
            c.escalationLevel = Math.max(c.escalationLevel || 0, 1);
            await ComplaintStore.update(complaintId, { isOverdue: true, escalationLevel: c.escalationLevel });

            await WorkflowEventStore.create({
              complaint: complaintId,
              actor: 'system:deadline-monitor',
              actorRole: 'system',
              action: 'MISSED_DEADLINE',
              outcome: 'system',
              fromStatus: c.status,
              toStatus: c.status,
              reason: 'Breached initial response deadline',
              metadata: { ruleApplied: 'RESPONSE_SLA_BREACH', kind: 'RESPONSE', level: 1 }
            });

            await NotificationStore.create({
              user: null,
              message: `[SLA Missed: Initial Response] Grievance ${c.trackingId || c.publicRef} in department '${c.department}' breached response deadline.`,
              complaint: complaintId,
              targetRoles: ['supervisor', 'reviewer'],
              department: c.department
            });

            responseEscalations++;
          } catch (dupErr) {
            // Treat unique constraint error as already done
          }
        }
      }

      // ----------------------------------------------------
      // 2. RESOLUTION DEADLINE ESCALATION (kind: RESOLUTION)
      // ----------------------------------------------------
      const resolutionDueTime = c.resolutionDue ? new Date(c.resolutionDue) : null;
      if (
        !['Resolved', 'RESOLVED', 'Closed', 'CLOSED'].includes(c.status) &&
        resolutionDueTime &&
        now > resolutionDueTime
      ) {
        // Idempotency check via unique (issueId, kind, level)
        const existingEsc = await EscalationEventStore.findOne({
          issueId: complaintId,
          kind: 'RESOLUTION',
          level: 2
        });

        if (!existingEsc) {
          try {
            await EscalationEventStore.create({
              issueId: complaintId,
              kind: 'RESOLUTION',
              level: 2
            });

            c.isOverdue = true;
            c.escalationLevel = Math.max(c.escalationLevel || 0, 2);
            await ComplaintStore.update(complaintId, { isOverdue: true, escalationLevel: c.escalationLevel });

            await WorkflowEventStore.create({
              complaint: complaintId,
              actor: 'system:deadline-monitor',
              actorRole: 'system',
              action: 'MISSED_DEADLINE',
              outcome: 'system',
              fromStatus: c.status,
              toStatus: c.status,
              reason: 'Breached resolution deadline',
              metadata: { ruleApplied: 'RESOLUTION_SLA_BREACH', kind: 'RESOLUTION', level: 2 }
            });

            await NotificationStore.create({
              user: null,
              message: `[SLA Level 2 Escalation] Grievance ${c.trackingId || c.publicRef} in department '${c.department}' is overdue for resolution. Escalated to Zonal Supervisor.`,
              complaint: complaintId,
              targetRoles: ['supervisor']
            });

            resolutionEscalations++;
          } catch (dupErr) {
            // Treat unique constraint error as already done
          }
        }
      }

      // ----------------------------------------------------
      // 3. AUTO-CLOSE RESOLVED ISSUES AFTER AUTO_CLOSE_DAYS
      // ----------------------------------------------------
      if (['Resolved', 'RESOLVED'].includes(c.status) && c.resolvedAt) {
        const resolvedTime = new Date(c.resolvedAt).getTime();
        const autoCloseMs = AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000;
        if (now.getTime() - resolvedTime > autoCloseMs) {
          c.status = 'Closed';
          c.closedAt = now;
          await ComplaintStore.update(complaintId, { status: 'Closed', closedAt: now });

          await WorkflowEventStore.create({
            complaint: complaintId,
            actor: 'system:deadline-monitor',
            actorRole: 'system',
            action: 'Auto-Close',
            outcome: 'accepted',
            fromStatus: 'Resolved',
            toStatus: 'Closed',
            reason: `Auto-closed by system after ${AUTO_CLOSE_DAYS} days without dispute`,
            metadata: { ruleApplied: 'AUTO_CLOSE_WINDOW' }
          });

          const citizenId = (c.citizen?._id || c.citizen)?.toString();
          if (citizenId) {
            await NotificationStore.create({
              user: citizenId,
              complaint: complaintId,
              message: `Your grievance [${c.trackingId || c.publicRef}] has been automatically closed after ${AUTO_CLOSE_DAYS} days.`,
              messageKey: 'STATUS_UPDATED',
              params: { trackingId: c.trackingId || c.publicRef, status: 'Closed', action: 'Auto-Close' }
            });
          }

          autoClosedCount++;
        }
      }
    }

    // 4. Record Worker Heartbeat
    const heartbeatDetails = `Processed ${activeComplaints.length} active issues. Responses escalated: ${responseEscalations}, Resolutions escalated: ${resolutionEscalations}, Auto-closed: ${autoClosedCount}`;
    prisma.systemWorkerHeartbeat.record('healthy', heartbeatDetails);

    // 5. Broadcast via SSE
    sseHub.broadcast({
      type: 'DEADLINE_MONITOR_RAN',
      timestamp: now.toISOString(),
      heartbeatDetails
    });

    return {
      success: true,
      ranAt: now.toISOString(),
      issuesChecked: activeComplaints.length,
      responseEscalations,
      resolutionEscalations,
      autoClosedCount
    };
  } catch (error) {
    console.error('Error in checkEscalations scheduler:', error.message);
    prisma.systemWorkerHeartbeat.record('error', error.message);
    return { success: false, error: error.message };
  } finally {
    isJobRunning = false;
  }
}

/**
 * Initializes node-cron schedule to run every minute
 */
function startEscalationCron() {
  const task = cron.schedule('* * * * *', () => {
    checkEscalations();
  });
  console.log('⏱️ SLA Escalation node-cron job scheduled: running every 1 minute');
  return task;
}

module.exports = {
  startEscalationCron,
  checkEscalations
};
