// Set server process timezone
process.env.TZ = process.env.CITY_TIMEZONE || 'Asia/Kolkata';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const healthRoutes = require('./routes/health');
const configRoutes = require('./routes/config');
const authRoutes = require('./routes/auth');
const categoriesRoutes = require('./routes/categories');
const complaintsRoutes = require('./routes/complaints');
const evidenceRoutes = require('./routes/evidence');
const notificationsRoutes = require('./routes/notifications');
const officialRoutes = require('./routes/official');
const geoRoutes = require('./routes/geo');
const publicRoutes = require('./routes/public');
const aiRoutes = require('./routes/ai');
const issuesRoutes = require('./routes/issues');
const reportsRoutes = require('./routes/reports');
const auditRoutes = require('./routes/audit');
const devRoutes = require('./routes/dev');

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      origin === allowedOrigin ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('192.168.') ||
      origin.endsWith('.railway.app') ||
      origin.endsWith('.up.railway.app')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

// CSRF Origin verification on state-mutating requests
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      const isAllowed =
        origin === allowedOrigin ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('192.168.') ||
        origin.endsWith('.railway.app') ||
        origin.endsWith('.up.railway.app') ||
        (req.headers.host && origin.includes(req.headers.host));
      if (!isAllowed) {
        return res.status(403).json({
          ok: false,
          errorCode: 'FORBIDDEN_ORIGIN',
          error: 'Cross-origin request blocked',
          message: 'Cross-origin request blocked'
        });
      }
    }
  }
  next();
});

// Rate Limiting (200 requests per 15 minutes per IP, skipped for local test runners)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  skip: (req) => process.env.NODE_ENV === 'test' || req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1',
  message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', limiter);

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check API
app.use('/api/health', healthRoutes);

// City & App Configuration API
app.use('/api/config', configRoutes);

// Geocoding Proxy API (Nominatim with 1 req/sec limit and Pune bounding)
app.use('/api/geo', geoRoutes);

// Public Issues Map API (No auth required, public-safe data only)
app.use('/api/public', publicRoutes);

// AI Suggestion & Triage API (Adheres strictly to read-only limits)
app.use('/api/ai', aiRoutes);

// Official Categories API
app.use('/api/categories', categoriesRoutes);

// Authentication API (Citizens register, Officials seeded)
app.use('/api/auth', authRoutes);

// Complaints Redressal API (Original complaints endpoint for backwards compatibility)
app.use('/api/complaints', complaintsRoutes);

// Issues API (Phase 1-5 specification endpoints)
app.use('/api/issues', issuesRoutes);

// Reports Submission & Deduplication API
app.use('/api/reports', reportsRoutes);

// Audit Chain Verification API
app.use('/api/audit', auditRoutes);

// Developer & Operational Monitoring API
app.use('/api/dev', devRoutes);

// Official Workflow API (Reviewers, Officers, Supervisors)
app.use('/api/official', officialRoutes);

// Evidence Secure Streaming API (Never statically served)
app.use('/api/evidence', evidenceRoutes);

// Notifications API
app.use('/api/notifications', notificationsRoutes);

// Serve static files from client build if present (for single-container Railway deployment)
const path = require('path');
const fs = require('fs');
const clientDistPath = path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  // Root informational endpoint when running API-only
  app.get('/', (req, res) => {
    res.json({
      app: 'Nagar Setu - Municipal Grievance Resolution API',
      status: 'running',
      healthCheck: '/api/health'
    });
  });
}

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const { seedDatabase } = require('./seed/seedUsers');
const { seedComplaints } = require('./seed/seedComplaints');
const { startEscalationCron } = require('./services/escalationScheduler');

// Start Server & Connect Database
const startServer = async () => {
  await connectDB();
  if (process.env.DEMO_MODE !== 'false') {
    await seedDatabase();
    await seedComplaints();
  }
  startEscalationCron();
  app.listen(PORT, () => {
    console.log(`🚀 Nagar Setu backend running on http://localhost:${PORT}`);
    console.log(`📡 Health Check endpoint: http://localhost:${PORT}/api/health`);
  });
};

startServer();

module.exports = app;
