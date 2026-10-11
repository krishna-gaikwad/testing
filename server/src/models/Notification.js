const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const NotificationSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    complaint: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      default: null
    },
    isRead: {
      type: Boolean,
      default: false
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

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
