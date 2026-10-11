const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const AiSuggestionSchema = new Schema(
  {
    complaint: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true
    },
    generatedFor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true
      // AI suggestion payload (e.g. suggestedCategory, suggestedPriority, reasoning)
      // Note: Rules prohibit AI from altering statuses, assignments, or deadlines directly.
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false
  }
);

module.exports = mongoose.models.AiSuggestion || mongoose.model('AiSuggestion', AiSuggestionSchema);
