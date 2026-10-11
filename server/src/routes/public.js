const express = require('express');
const router = express.Router();
const { ComplaintStore, WorkflowEventStore } = require('../services/memoryStore');
const { STATES, isDemo } = require('../config/workflow.config');
const { nearestArea } = require('../config/city.config');

/**
 * Deterministic ~100m grid snap for public coordinates (3 decimals = ~110m)
 */
function snapCoordinate(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  return Math.round(num * 1000) / 1000;
}

/**
 * Maps raw database status and emergency flags to public-friendly status labels
 */
function getPublicStatusLabel(c) {
  if (c.isCriticalVerified || c.emergencyStatus === 'VERIFIED') {
    return 'Critical, verified emergency';
  }
  if ((c.isPossibleEmergency || c.emergencyStatus === 'POSSIBLE_UNVERIFIED') && !['Resolved', 'RESOLVED', 'Closed', 'CLOSED'].includes(c.status)) {
    return 'Possible emergency, unverified';
  }

  switch (c.status) {
    case STATES.SUBMITTED:
    case 'Submitted':
      return 'Reported, awaiting triage';
    case STATES.UNDER_REVIEW:
    case 'Under Review':
    case STATES.ACCEPTED:
    case 'Accepted':
      return 'Accepted & Scheduled';
    case STATES.IN_PROGRESS:
    case 'In Progress':
      return 'In Progress';
    case STATES.RESOLVED:
    case 'Resolved':
      return 'Resolved';
    case 'Closed':
    case 'CLOSED':
      return 'Closed';
    default:
      return c.status;
  }
}

/**
 * ONE allow-list function toPublicIssue() used by every public endpoint
 * Strictly strips: name, email, phone, passwordHash, exact coordinates, filePath, actorId, refused events
 */
function toPublicIssue(c) {
  const rawLat = c.location?.lat ?? c.lat ?? c.latitude ?? 18.520;
  const rawLng = c.location?.lng ?? c.lng ?? c.longitude ?? 73.856;
  const lat = snapCoordinate(rawLat);
  const lng = snapCoordinate(rawLng);
  const nearest = nearestArea(lat, lng);
  const areaName = nearest ? nearest.name : (c.area || c.areaName || 'Pune');

  const fullDesc = c.description || c.title || '';
  const shortDesc = fullDesc.length > 120 ? `${fullDesc.slice(0, 117)}...` : fullDesc;

  let emergencyLabel = 'None';
  if (c.isCriticalVerified || c.emergencyStatus === 'VERIFIED') {
    emergencyLabel = 'Verified emergency';
  } else if (c.isPossibleEmergency || c.emergencyStatus === 'POSSIBLE_UNVERIFIED') {
    emergencyLabel = 'Possible emergency, unverified';
  }

  const isResolvedOrClosed = ['Resolved', 'RESOLVED', 'Closed', 'CLOSED'].includes(c.status);

  return {
    id: (c._id || c.id).toString(),
    publicRef: c.publicRef || c.trackingId || (c._id || c.id).toString(),
    category: c.category,
    department: c.department,
    description: shortDesc,
    areaName,
    area: areaName,
    lat,
    lng,
    status: c.status,
    statusLabel: getPublicStatusLabel(c),
    priority: c.priority || 'Normal',
    supportCount: c.distinctCitizenCount || c.supportCount || 1,
    distinctCitizenCount: c.distinctCitizenCount || c.supportCount || 1,
    supporterCount: c.distinctCitizenCount || c.supportCount || 1,
    isPossibleEmergency: Boolean(c.isPossibleEmergency),
    isCriticalVerified: Boolean(c.isCriticalVerified),
    emergencyLabel,
    resolutionNote: isResolvedOrClosed ? (c.resolutionNote || null) : null,
    updatedAt: c.updatedAt || c.createdAt
  };
}

/**
 * GET /api/public/issues
 * Public list with pagination, search, and filters. Hides REJECTED.
 */
router.get('/issues', async (req, res) => {
  try {
    const { category, department, status, priority, area, search, limit = 200, page = 1 } = req.query;

    const all = await ComplaintStore.find({});
    // Strictly hide REJECTED
    let complaints = all.filter((c) => c.status !== STATES.REJECTED && c.status !== 'Rejected' && c.status !== 'REJECTED');

    if (department) complaints = complaints.filter(c => c.department === department);
    if (category) complaints = complaints.filter(c => c.category === category);
    if (status) complaints = complaints.filter(c => c.status === status);
    if (priority) complaints = complaints.filter(c => c.priority === priority);
    if (area) complaints = complaints.filter(c => (c.area || c.areaName)?.toLowerCase() === area.toLowerCase());
    if (search) {
      const q = search.toLowerCase();
      complaints = complaints.filter(c => (c.title || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
    }

    const total = complaints.length;
    const startIndex = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const paginated = complaints.slice(startIndex, startIndex + parseInt(limit, 10));

    const publicIssues = paginated.map(toPublicIssue);

    res.status(200).json({
      ok: true,
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      issues: publicIssues,
      isDemo: true,
      demoLabel: 'Demo data - demonstration civic issues only'
    });
  } catch (error) {
    console.error('Error fetching public issues:', error);
    res.status(500).json({ ok: false, error: 'Failed to retrieve public issues.' });
  }
});

/**
 * GET /api/public/issues/:publicRef
 * Detailed public issue view with public timeline (date, status, action ONLY; NO actors, NO reasons, NO refused events)
 */
router.get('/issues/:publicRef', async (req, res) => {
  try {
    const ref = req.params.publicRef;
    const all = await ComplaintStore.find({});
    const issue = all.find(c => c.publicRef === ref || c.trackingId === ref || (c._id || c.id).toString() === ref);

    if (!issue || issue.status === STATES.REJECTED || issue.status === 'Rejected' || issue.status === 'REJECTED') {
      return res.status(404).json({ ok: false, error: 'Issue not found or not publicly accessible.' });
    }

    const publicData = toPublicIssue(issue);

    // Fetch timeline: outcome = 'accepted' only, strictly strip actors, reasons, and refusal info
    const issueId = (issue._id || issue.id).toString();
    const events = await WorkflowEventStore.find({ complaint: issueId });
    const timeline = events
      .filter(e => e.outcome === 'accepted')
      .map(e => ({
        date: e.timestamp || e.createdAt,
        fromStatus: e.fromStatus,
        toStatus: e.toStatus,
        action: e.action
      }));

    res.status(200).json({
      ok: true,
      issue: {
        ...publicData,
        timeline
      }
    });
  } catch (error) {
    console.error('Error fetching public issue detail:', error);
    res.status(500).json({ ok: false, error: 'Failed to retrieve public issue detail.' });
  }
});

/**
 * GET /api/public/stats
 * Aggregated statistics counting Issues (not Reports)
 */
router.get('/stats', async (req, res) => {
  try {
    const all = await ComplaintStore.find({});
    const valid = all.filter(c => c.status !== 'Rejected' && c.status !== 'REJECTED');

    const totalIssues = valid.length;
    const resolvedIssues = valid.filter(c => ['Resolved', 'RESOLVED', 'Closed', 'CLOSED'].includes(c.status)).length;
    const inProgressIssues = valid.filter(c => c.status === 'In Progress' || c.status === 'IN_PROGRESS').length;
    const emergencyIssues = valid.filter(c => c.isCriticalVerified || c.isPossibleEmergency).length;

    res.status(200).json({
      ok: true,
      totalIssues,
      resolvedIssues,
      inProgressIssues,
      emergencyIssues,
      resolutionRate: totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0,
      isDemo: true,
      demoLabel: 'Demo data - demonstration civic issues only'
    });
  } catch (error) {
    console.error('Error fetching public stats:', error);
    res.status(500).json({ ok: false, error: 'Failed to retrieve public stats.' });
  }
});

router.toPublicIssue = toPublicIssue;
module.exports = router;
