const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const EvidenceSchema = new Schema(
  {
    complaint: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true
    },
    filePath: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    kind: {
      type: String,
      enum: ['initial', 'after_repair'],
      required: true
    },
    uploader: {
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

module.exports = mongoose.models.Evidence || mongoose.model('Evidence', EvidenceSchema);
