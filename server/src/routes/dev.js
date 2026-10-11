const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { checkEscalations } = require('../services/escalationScheduler');
const { ComplaintStore, WorkflowEventStore } = require('../services/memoryStore');
const { prisma } = require('../db/sqlite');
const { sseHub } = require('../services/sseHub');

const isDevAllowed = process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true';

/**
 * GET /api/dev/heartbeat
 * Public/Staff: Returns the worker's latest execution timestamp
 */
router.get('/heartbeat', async (req, res) => {
  const heartbeat = prisma.systemWorkerHeartbeat.get();
  res.status(200).json({
    ok: true,
    heartbeat: heartbeat || { lastRanAt: new Date().toISOString(), status: 'healthy', details: 'Initialized' }
  });
});

/**
 * GET /api/dev/sse
 * Server-Sent Events stream for live issue and escalation updates
 */
router.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);
  sseHub.addClient(res);
});

/**
 * POST /api/dev/run-monitor
 * Admin or Demo: Triggers deadline monitor immediately, audited
 */
router.post('/run-monitor', requireAuth, async (req, res) => {
  if (!isDevAllowed && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, errorCode: 'DEV_TOOLS_DISABLED', error: 'Dev tools are disabled in production' });
  }

  const user = req.user;
  const result = await checkEscalations();

  // Audit this dev tool trigger
  await WorkflowEventStore.create({
    complaint: 'DEV_MONITOR_RUN',
    actor: (user._id || user.id).toString(),
    actorRole: user.role,
    action: 'Dev Tool: Run Deadline Monitor',
    outcome: 'accepted',
    fromStatus: null,
    toStatus: null,
    reason: 'Manual deadline monitor run triggered via dev endpoint'
  });

  res.status(200).json({
    ok: true,
    message: 'Deadline monitor executed successfully',
    result
  });
});

/**
 * POST /api/dev/time-travel
 * Fast-forwards an issue's deadlines or resolution date for testing, audited
 */
router.post('/time-travel', requireAuth, async (req, res) => {
  if (!isDevAllowed && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, errorCode: 'DEV_TOOLS_DISABLED', error: 'Dev tools are disabled in production' });
  }

  const { issueId, subtractHours = 48, setStatus } = req.body;
  const issue = await ComplaintStore.findById(issueId);
  if (!issue) {
    return res.status(404).json({ ok: false, errorCode: 'NOT_FOUND', error: 'Issue not found' });
  }

  const msToSubtract = subtractHours * 60 * 60 * 1000;
  const updates = {};

  if (issue.initialResponseDue) {
    updates.initialResponseDue = new Date(new Date(issue.initialResponseDue).getTime() - msToSubtract);
    updates.responseDeadline = updates.initialResponseDue;
  }
  if (issue.resolutionDue) {
    updates.resolutionDue = new Date(new Date(issue.resolutionDue).getTime() - msToSubtract);
  }
  if (issue.resolvedAt) {
    updates.resolvedAt = new Date(new Date(issue.resolvedAt).getTime() - msToSubtract);
  }
  if (setStatus) {
    updates.status = setStatus;
  }

  await ComplaintStore.update(issue._id || issue.id, updates);

  const user = req.user;
  await WorkflowEventStore.create({
    complaint: (issue._id || issue.id).toString(),
    actor: (user._id || user.id).toString(),
    actorRole: user.role,
    action: 'Dev Tool: Time Travel',
    outcome: 'accepted',
    fromStatus: issue.status,
    toStatus: updates.status || issue.status,
    reason: `Time-traveled deadlines backwards by ${subtractHours} hours for SLA verification`
  });

  res.status(200).json({
    ok: true,
    message: `Time-traveled issue deadlines by -${subtractHours} hours`,
    issue
  });
});

module.exports = router;
