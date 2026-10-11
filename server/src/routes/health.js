const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// GET /api/health
router.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    status: 'ok',
    message: 'Nagar Setu API is operational',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    demoMode: process.env.DEMO_MODE === 'true'
  });
});

module.exports = router;
