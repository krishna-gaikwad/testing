const jwt = require('jsonwebtoken');
const { UserStore } = require('../services/memoryStore');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production';

/**
 * Authentication Middleware
 * Validates the Bearer token and attaches req.user (safe, no passwordHash)
 */
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    let user;
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      user = await User.findById(decoded.id).select('-passwordHash');
    } else {
      user = await UserStore.findById(decoded.id);
    }

    if (!user) {
      return res.status(401).json({ error: 'User associated with token no longer exists.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'User account is deactivated.' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('requireAuth middleware error:', error);
    return res.status(500).json({ error: 'Server authentication error.' });
  }
};

/**
 * Role-Based Access Control Middleware
 * Backend strictly checks req.user.role against allowed roles
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Access requires one of roles [${allowedRoles.join(', ')}]. Current role: ${req.user.role}`,
        attemptedRole: req.user.role,
        requiredRoles: allowedRoles
      });
    }

    next();
  };
};

module.exports = {
  requireAuth,
  requireRole,
  JWT_SECRET
};
