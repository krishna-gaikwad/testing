const express = require('express');
const router = express.Router();
const { getPublicCityConfig } = require('../config/city.config');

// GET /api/config/city - Public city configuration
router.get('/city', (req, res) => {
  try {
    const config = getPublicCityConfig();
    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve city configuration' });
  }
});

module.exports = router;
