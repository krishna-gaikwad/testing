const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { UserStore } = require('../services/memoryStore');

// Strict Rate Limiting on Authentication endpoints (skipped for automated local test suite)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: (req) => process.env.NODE_ENV === 'test' || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: { error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Helper to generate JWT token (valid for 7 days)
 */
const generateToken = (user) => {
  const userId = user._id ? user._id.toString() : user.id;
  return jwt.sign(
    {
      id: userId,
      role: user.role,
      email: user.email
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

/**
 * POST /api/auth/register
 * CITIZENS ONLY: Ignore any role or department sent by the client.
 * Email and password validation (min 8 chars).
 */
router.post(
  '/register',
  authLimiter,
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email address')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, email, password } = req.body;
      const normalizedEmail = email.toLowerCase();

      // Check if user already exists
      let existingUser;
      if (mongoose.connection.readyState === 1) {
        const User = require('../models/User');
        existingUser = await User.findOne({ email: normalizedEmail });
      } else {
        existingUser = await UserStore.findOne({ email: normalizedEmail });
      }

      if (existingUser) {
        return res.status(409).json({ error: 'A user with this email address already exists.' });
      }

      // Hash password with bcryptjs
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // SECURITY ENFORCEMENT: Force role to 'citizen' and department to null
      // Any role or department submitted by client is strictly ignored!
      const userPayload = {
        name,
        email: normalizedEmail,
        passwordHash,
        role: 'citizen',
        department: null,
        isActive: true,
        createdAt: new Date()
      };

      let createdUser;
      if (mongoose.connection.readyState === 1) {
        const User = require('../models/User');
        createdUser = await User.create(userPayload);
      } else {
        createdUser = await UserStore.create(userPayload);
      }

      const token = generateToken(createdUser);
      const safeUser = {
        id: createdUser._id || createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        department: createdUser.department,
        createdAt: createdUser.createdAt
      };

      return res.status(201).json({
        message: 'Citizen account registered successfully',
        token,
        user: safeUser
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Failed to complete registration.' });
    }
  }
);

// In-memory tracking for failed login attempts (5 failures per 15 min -> 429)
const loginAttempts = new Map();

/**
 * POST /api/auth/login
 * Validates credentials, returns JWT (7 days) and safe user info
 */
router.post(
  '/login',
  authLimiter,
  [
    body('email').trim().isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase();
      const lockoutKey = `${normalizedEmail}:${req.ip || 'ip'}`;
      const now = Date.now();

      // Check lockout status
      const attemptInfo = loginAttempts.get(lockoutKey);
      if (attemptInfo) {
        if (now - attemptInfo.firstAttemptAt < 15 * 60 * 1000) {
          if (attemptInfo.count >= 5) {
            return res.status(429).json({
              ok: false,
              errorCode: 'LOGIN_LOCKOUT',
              error: 'Too many failed login attempts. Please try again after 15 minutes.',
              message: 'Too many failed login attempts. Please try again after 15 minutes.'
            });
          }
        } else {
          loginAttempts.delete(lockoutKey);
        }
      }

      const recordFailure = () => {
        const cur = loginAttempts.get(lockoutKey) || { count: 0, firstAttemptAt: now };
        if (now - cur.firstAttemptAt >= 15 * 60 * 1000) {
          cur.count = 1;
          cur.firstAttemptAt = now;
        } else {
          cur.count += 1;
        }
        loginAttempts.set(lockoutKey, cur);
      };

      let user;
      const altEmail = normalizedEmail.includes('@pmc.demo.gov.in')
        ? normalizedEmail.replace('@pmc.demo.gov.in', '@pmc.demo.local')
        : normalizedEmail.replace('@pmc.demo.local', '@pmc.demo.gov.in');

      if (mongoose.connection.readyState === 1) {
        const User = require('../models/User');
        user = await User.findOne({ email: normalizedEmail }) || await User.findOne({ email: altEmail });
      } else {
        user = await UserStore.findOne({ email: normalizedEmail }) || await UserStore.findOne({ email: altEmail });
      }

      if (!user) {
        recordFailure();
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        recordFailure();
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Your account has been deactivated.' });
      }

      // Successful login clears failure count
      loginAttempts.delete(lockoutKey);

      const token = generateToken(user);
      const safeUser = {
        id: user._id || user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        createdAt: user.createdAt
      };

      return res.status(200).json({
        message: 'Login successful',
        token,
        user: safeUser
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Failed to process login.' });
    }
  }
);

/**
 * GET /api/auth/me
 * Returns authenticated user details (never passwordHash)
 */
router.get('/me', requireAuth, (req, res) => {
  const user = req.user;
  const safeUser = {
    id: user._id || user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    createdAt: user.createdAt
  };
  return res.status(200).json({ user: safeUser });
});

module.exports = router;
