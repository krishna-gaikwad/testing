const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { verifyAuditChain } = require('../db/sqlite');

/**
 * GET /api/audit/verify
 * Supervisor or Admin: Recomputes the SHA-256 hash chain across all AuditEvents
 * and reports whether the ledger is tamper-free or pinpoints the broken row.
 */
router.get('/verify', requireAuth, requireRole('supervisor', 'admin'), async (req, res) => {
  try {
    const result = verifyAuditChain();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error verifying audit chain:', error);
    res.status(500).json({
      ok: false,
      valid: false,
      errorCode: 'VERIFY_ERROR',
      error: 'Failed to verify audit hash chain',
      message: error.message
    });
  }
});

module.exports = router;
