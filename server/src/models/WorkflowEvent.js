const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const WorkflowEventSchema = new Schema(
  {
    complaint: {
      type: Schema.Types.ObjectId,
      ref: 'Complaint',
      required: true,
      index: true
    },
    actor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null // null if system-triggered
    },
    actorRole: {
      type: String,
      enum: ['citizen', 'reviewer', 'officer', 'supervisor', 'system'],
      required: true
    },
    action: {
      type: String,
      required: true,
      trim: true
    },
    outcome: {
      type: String,
      enum: ['accepted', 'refused', 'system'],
      required: true
    },
    fromStatus: {
      type: String,
      required: true
    },
    toStatus: {
      type: String,
      default: null
    },
    reason: {
      type: String,
      default: null
    },
    refusalReason: {
      type: String,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true // Append-only, never mutate
    }
  },
  {
    timestamps: false
  }
);

// Explicitly disallow updates or deletes at Mongoose schema level
WorkflowEventSchema.pre('updateOne', function () {
  throw new Error('WorkflowEvent is strictly append-only. Updates are forbidden.');
});
WorkflowEventSchema.pre('updateMany', function () {
  throw new Error('WorkflowEvent is strictly append-only. Updates are forbidden.');
});
WorkflowEventSchema.pre('findOneAndUpdate', function () {
  throw new Error('WorkflowEvent is strictly append-only. Updates are forbidden.');
});
WorkflowEventSchema.pre('deleteOne', function () {
  throw new Error('WorkflowEvent is strictly append-only. Deletions are forbidden.');
});
WorkflowEventSchema.pre('deleteMany', function () {
  throw new Error('WorkflowEvent is strictly append-only. Deletions are forbidden.');
});

module.exports = mongoose.models.WorkflowEvent || mongoose.model('WorkflowEvent', WorkflowEventSchema);
