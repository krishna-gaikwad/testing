const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { generateCitizenSuggestion } = require('../services/aiService');

/**
 * POST /api/ai/suggest
 * Citizen endpoint: Takes description and returns suggestions.
 * Preserves original text. No database changes to complaints.
 */
router.post('/suggest', async (req, res) => {
  try {
    const { description, language } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required for suggestion generation.' });
    }

    const lang = language || req.query.lang || 'en';
    const suggestion = await generateCitizenSuggestion(description.trim(), lang);

    res.status(200).json({
      message: 'Suggestion generated. You decide whether to accept or adjust.',
      suggestion
    });
  } catch (error) {
    console.error('Error in citizen AI suggestion:', error);
    res.status(500).json({ error: 'Failed to generate suggestion.' });
  }
});

module.exports = router;
