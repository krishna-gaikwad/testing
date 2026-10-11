const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const EmergencyFlagSchema = new Schema(
  {
    complaint: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true
    },
    flaggedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    concern: {
      type: String,
      required: true,
      trim: true
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'dismissed'],
      default: 'pending',
      required: true
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    reason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.EmergencyFlag || mongoose.model('EmergencyFlag', EmergencyFlagSchema);
