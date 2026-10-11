const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const SupportSchema = new Schema(
  {
    complaint: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true
    },
    citizen: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
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

// Enforce unique support per citizen per complaint
SupportSchema.index({ complaint: 1, citizen: 1 }, { unique: true });

module.exports = mongoose.models.Support || mongoose.model('Support', SupportSchema);
