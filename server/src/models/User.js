const mongoose = require('express'); // Mongoose import below
const { Schema } = require('mongoose');

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    role: {
      type: String,
      enum: ['citizen', 'reviewer', 'officer', 'supervisor'],
      default: 'citizen',
      required: true
    },
    department: {
      type: String,
      enum: ['waste', 'roads', 'water', 'others', null],
      default: null,
      validate: {
        validator: function (val) {
          // department is required for officers and supervisors
          if (['officer', 'supervisor'].includes(this.role)) {
            return ['waste', 'roads', 'water', 'others'].includes(val);
          }
          return true;
        },
        message: 'Department is required for officers and supervisors'
      }
    },
    isActive: {
      type: Boolean,
      default: true
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

// Method to return safe user object without passwordHash
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

const mongooseLib = require('mongoose');
module.exports = mongooseLib.models.User || mongooseLib.model('User', UserSchema);
