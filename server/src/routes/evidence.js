const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const { EvidenceStore, ComplaintStore, WorkflowEventStore } = require('../services/memoryStore');

/**
 * GET /api/evidence/:id
 * Strictly protected: Allows ONLY the owning citizen or an official whose role and department allow it.
 * Refuses everyone else with 403 and records a REFUSED WorkflowEvent audit log.
 * Never serves uploads statically.
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const evidenceId = req.params.id;
    let evidence;

    if (mongoose.connection.readyState === 1) {
      const Evidence = require('../models/Evidence');
      evidence = await Evidence.findById(evidenceId);
    } else {
      evidence = await EvidenceStore.findById(evidenceId);
    }

    if (!evidence) {
      return res.status(404).json({ error: 'Evidence record not found.' });
    }

    // Lookup associated complaint
    const complaintId = evidence.complaint ? (evidence.complaint._id || evidence.complaint).toString() : null;
    let complaint;

    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      complaint = await Complaint.findById(complaintId);
    } else {
      complaint = await ComplaintStore.findById(complaintId);
    }

    if (!complaint) {
      return res.status(404).json({ error: 'Associated complaint not found.' });
    }

    const user = req.user;
    const userId = (user._id || user.id).toString();
    const userRole = user.role;
    const userDept = user.department;

    const complaintCitizenId = complaint.citizen ? (complaint.citizen._id || complaint.citizen).toString() : '';

    // Check Access Authorization:
    // 1. Owning Citizen
    const isOwner = userRole === 'citizen' && userId === complaintCitizenId;
    // 2. Reviewer or Supervisor or Admin (across all departments)
    const isReviewerOrSupervisor = ['reviewer', 'supervisor', 'admin'].includes(userRole);
    // 3. Officer of the specific complaint department
    const isAuthorizedOfficer = userRole === 'officer' && userDept === complaint.department;

    if (!isOwner && !isReviewerOrSupervisor && !isAuthorizedOfficer) {
      const refusalReason = `Unauthorized evidence access attempt: Role '${userRole}' with department '${userDept || 'none'}' cannot view evidence for complaint in department '${complaint.department}'.`;

      // Log REFUSED WorkflowEvent in audit trail
      await WorkflowEventStore.create({
        complaint: complaintId,
        actor: userId,
        actorRole: userRole,
        action: 'View Evidence',
        outcome: 'refused',
        fromStatus: complaint.status,
        toStatus: complaint.status,
        refusalReason
      });

      return res.status(403).json({
        error: 'Forbidden: You do not have permission to access this evidence.',
        refusalReason
      });
    }

    // Verify file exists on local storage
    const absolutePath = path.isAbsolute(evidence.filePath)
      ? evidence.filePath
      : path.join(__dirname, '../../', evidence.filePath);

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Evidence file not found on server disk.' });
    }

    // Set real MIME type & stream file safely
    res.setHeader('Content-Type', evidence.mimeType || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(path.resolve(absolutePath));
  } catch (error) {
    console.error('Evidence access error:', error);
    return res.status(500).json({ error: 'Internal server error while accessing evidence.' });
  }
});

module.exports = router;
