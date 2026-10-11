const express = require('express');
const router = express.Router();
const { CATEGORIES } = require('../config/categories');

// GET /api/categories - Returns official department categories
router.get('/', (req, res) => {
  res.status(200).json(CATEGORIES);
});

module.exports = router;
