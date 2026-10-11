const mongoose = require('mongoose');
const { Schema } = require('mongoose');

const LocationSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: '' },
    source: {
      type: String,
      enum: ['gps', 'exif', 'map_pin', 'manual'],
      default: 'manual'
    }
  },
  { _id: false }
);

const ComplaintSchema = new Schema(
  {
    trackingId: {
      type: String,
      unique: true,
      required: true,
      index: true
      // Format: NS-YYYY-XXXXXX
    },
    citizen: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    department: {
      type: String,
      enum: ['waste', 'roads', 'water', 'others'],
      required: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    // Pune locality option from city.config.js, editable by citizen
    area: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      enum: [
        'Submitted',
        'Under Review',
        'Accepted',
        'In Progress',
        'Resolved',
        'Rejected'
      ],
      default: 'Submitted',
      required: true
    },
    priority: {
      type: String,
      enum: ['Normal', 'High', 'Critical'],
      default: 'Normal'
    },
    reopenRequest: {
      requested: { type: Boolean, default: false },
      reason: { type: String, default: null },
      requestedAt: { type: Date, default: null },
      decision: { type: String, enum: ['pending', 'approved', 'rejected', null], default: null },
      decisionReason: { type: String, default: null },
      decidedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
    },
    isPossibleEmergency: {
      type: Boolean,
      default: false
    },
    isCriticalVerified: {
      type: Boolean,
      default: false
    },
    location: {
      type: LocationSchema,
      required: true
    },
    supportCount: {
      type: Number,
      default: 1,
      min: 1
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    resolutionNote: {
      type: String,
      default: null
    },
    resolvedAt: {
      type: Date,
      default: null
    },
    reopenCount: {
      type: Number,
      default: 0
    },
    initialResponseDue: {
      type: Date,
      default: null
    },
    resolutionDue: {
      type: Date,
      default: null
    },
    isOverdue: {
      type: Boolean,
      default: false
    },
    escalationLevel: {
      type: Number,
      enum: [0, 1, 2],
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Fast geospatial index & department search
ComplaintSchema.index({ 'location.lat': 1, 'location.lng': 1 });
ComplaintSchema.index({ department: 1, status: 1 });

module.exports = mongoose.models.Complaint || mongoose.model('Complaint', ComplaintSchema);
