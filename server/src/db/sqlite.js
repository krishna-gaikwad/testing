const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '../../prisma');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'dev.db');
const db = new DatabaseSync(DB_PATH);

// Phase 4: SQLite WAL and busy timeout configuration
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

/**
 * Initialize Tables, Constraints, Indexes and Triggers
 */
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      failedLoginAttempts INTEGER DEFAULT 0,
      lockoutUntil TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Issue (
      id TEXT PRIMARY KEY,
      publicRef TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      department TEXT NOT NULL,
      categoryId TEXT,
      subcategoryId TEXT,
      category TEXT NOT NULL,
      status TEXT DEFAULT 'SUBMITTED',
      priority TEXT DEFAULT 'Normal',
      areaName TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address TEXT,
      distinctCitizenCount INTEGER DEFAULT 1,
      reportCount INTEGER DEFAULT 1,
      supportCount INTEGER DEFAULT 1,
      assignedToId TEXT,
      assignedToName TEXT,
      reopenCount INTEGER DEFAULT 0,
      escalationLevel INTEGER DEFAULT 0,
      isOverdue INTEGER DEFAULT 0,
      isApproachingDeadline INTEGER DEFAULT 0,
      emergencyStatus TEXT DEFAULT 'NONE',
      isPossibleEmergency INTEGER DEFAULT 0,
      isCriticalVerified INTEGER DEFAULT 0,
      resolutionNote TEXT,
      rejectionReason TEXT,
      responseDeadline TEXT NOT NULL,
      resolutionDue TEXT NOT NULL,
      submittedAt TEXT NOT NULL,
      resolvedAt TEXT,
      closedAt TEXT,
      version INTEGER DEFAULT 1,
      reviewingBy TEXT,
      reviewingUntil TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_issue_status_overdue ON Issue(status, isOverdue);
    CREATE INDEX IF NOT EXISTS idx_issue_category ON Issue(categoryId, subcategoryId);
    CREATE INDEX IF NOT EXISTS idx_issue_coords ON Issue(latitude, longitude);

    CREATE TABLE IF NOT EXISTS Report (
      id TEXT PRIMARY KEY,
      referenceId TEXT UNIQUE NOT NULL,
      issueId TEXT NOT NULL,
      citizenId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      address TEXT,
      locationSource TEXT DEFAULT 'MANUAL',
      locationConfirmedAt TEXT,
      isPossibleEmergency INTEGER DEFAULT 0,
      emergencyConcern TEXT,
      submittedAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(issueId, citizenId)
    );

    CREATE TABLE IF NOT EXISTS Evidence (
      id TEXT PRIMARY KEY,
      reportId TEXT,
      issueId TEXT,
      filePath TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      kind TEXT DEFAULT 'INITIAL',
      uploadedById TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ReopenRequest (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      citizenId TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      decidedById TEXT,
      decisionReason TEXT,
      createdAt TEXT NOT NULL,
      decidedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS PossibleDuplicate (
      id TEXT PRIMARY KEY,
      issueAId TEXT NOT NULL,
      issueBId TEXT NOT NULL,
      similarity REAL NOT NULL,
      distanceMeters REAL NOT NULL,
      status TEXT DEFAULT 'PENDING',
      resolvedById TEXT,
      resolvedAt TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(issueAId, issueBId)
    );

    CREATE TABLE IF NOT EXISTS IssueSupport (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      citizenId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(issueId, citizenId)
    );

    CREATE TABLE IF NOT EXISTS EmergencyFlag (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      reportId TEXT,
      flaggedById TEXT NOT NULL,
      concern TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      verifiedById TEXT,
      reason TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS SatisfactionRating (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      citizenId TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(issueId, citizenId)
    );

    CREATE TABLE IF NOT EXISTS EscalationEvent (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      kind TEXT NOT NULL,
      level INTEGER NOT NULL,
      triggeredAt TEXT NOT NULL,
      UNIQUE(issueId, kind, level)
    );

    CREATE TABLE IF NOT EXISTS WorkflowTransition (
      id TEXT PRIMARY KEY,
      fromStatus TEXT NOT NULL,
      toStatus TEXT NOT NULL,
      action TEXT NOT NULL,
      allowedRoles TEXT NOT NULL,
      requiresReporter INTEGER DEFAULT 0,
      departmentScoped INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS AuditEvent (
      id TEXT PRIMARY KEY,
      entityType TEXT DEFAULT 'Issue',
      entityId TEXT NOT NULL,
      actorId TEXT NOT NULL,
      actorRole TEXT NOT NULL,
      action TEXT NOT NULL,
      outcome TEXT NOT NULL,
      fromStatus TEXT,
      toStatus TEXT,
      reason TEXT,
      refusalReason TEXT,
      metadata TEXT,
      prevHash TEXT,
      hash TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_entity ON AuditEvent(entityType, entityId, timestamp);

    -- Phase 3: SQLite Raw Triggers enforcing append-only AuditEvent
    CREATE TRIGGER IF NOT EXISTS trg_audit_event_no_update
    BEFORE UPDATE ON AuditEvent
    BEGIN
      SELECT RAISE(ABORT, 'AuditEvent is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_audit_event_no_delete
    BEFORE DELETE ON AuditEvent
    BEGIN
      SELECT RAISE(ABORT, 'AuditEvent is append-only');
    END;

    CREATE TABLE IF NOT EXISTS Notification (
      id TEXT PRIMARY KEY,
      userId TEXT,
      targetRoles TEXT,
      issueId TEXT,
      message TEXT NOT NULL,
      messageKey TEXT,
      params TEXT,
      readAt TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notif_user_read ON Notification(userId, readAt);

    CREATE TABLE IF NOT EXISTS DeadlineChange (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      oldResponseDue TEXT,
      newResponseDue TEXT,
      oldResolutionDue TEXT,
      newResolutionDue TEXT,
      reason TEXT NOT NULL,
      actorId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS SystemWorkerHeartbeat (
      id INTEGER PRIMARY KEY DEFAULT 1,
      lastRanAt TEXT NOT NULL,
      status TEXT DEFAULT 'healthy',
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS IssueNote (
      id TEXT PRIMARY KEY,
      issueId TEXT NOT NULL,
      authorId TEXT NOT NULL,
      authorName TEXT NOT NULL,
      authorRole TEXT NOT NULL,
      body TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK(visibility IN ('INTERNAL', 'CITIZEN_UPDATE')),
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_issue_note_issue ON IssueNote(issueId, createdAt);

    CREATE TRIGGER IF NOT EXISTS trg_issue_note_no_update
    BEFORE UPDATE ON IssueNote
    BEGIN
      SELECT RAISE(ABORT, 'IssueNote is append-only');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_issue_note_no_delete
    BEFORE DELETE ON IssueNote
    BEGIN
      SELECT RAISE(ABORT, 'IssueNote is append-only');
    END;
  `);

  try { db.exec('ALTER TABLE Issue ADD COLUMN version INTEGER DEFAULT 1;'); } catch (e) {}
  try { db.exec('ALTER TABLE Issue ADD COLUMN reviewingBy TEXT;'); } catch (e) {}
  try { db.exec('ALTER TABLE Issue ADD COLUMN reviewingUntil TEXT;'); } catch (e) {}
}

initSchema();

/**
 * SHA-256 Hash Chain Generator for Audit Events
 * Canonical JSON representation of event payload
 */
function canonicalizeJson(obj) {
  const sortedKeys = Object.keys(obj).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    if (obj[k] !== undefined && k !== 'hash' && k !== 'prevHash') {
      sortedObj[k] = obj[k];
    }
  }
  return JSON.stringify(sortedObj);
}

function computeAuditHash(prevHash, eventFields) {
  const canonical = canonicalizeJson(eventFields);
  return crypto.createHash('sha256').update((prevHash || '') + canonical).digest('hex');
}

/**
 * Append Audit Event with Hash Chain
 */
function appendAuditEvent(fields) {
  // Find latest audit event to obtain prevHash
  const row = db.prepare('SELECT hash FROM AuditEvent ORDER BY rowid DESC LIMIT 1').get();
  const prevHash = row ? row.hash : '0000000000000000000000000000000000000000000000000000000000000000';
  const id = fields.id || `audit-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const timestamp = fields.timestamp || new Date().toISOString();

  const eventPayload = {
    entityType: fields.entityType || 'Issue',
    entityId: fields.entityId,
    actorId: fields.actorId,
    actorRole: fields.actorRole,
    action: fields.action,
    outcome: fields.outcome || 'accepted',
    fromStatus: fields.fromStatus || null,
    toStatus: fields.toStatus || null,
    reason: fields.reason || null,
    refusalReason: fields.refusalReason || null,
    metadata: typeof fields.metadata === 'object' ? JSON.stringify(fields.metadata) : (fields.metadata || null),
    timestamp
  };

  const hash = computeAuditHash(prevHash, eventPayload);

  db.prepare(`
    INSERT INTO AuditEvent (
      id, entityType, entityId, actorId, actorRole, action, outcome,
      fromStatus, toStatus, reason, refusalReason, metadata, prevHash, hash, timestamp
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    eventPayload.entityType,
    eventPayload.entityId,
    eventPayload.actorId,
    eventPayload.actorRole,
    eventPayload.action,
    eventPayload.outcome,
    eventPayload.fromStatus,
    eventPayload.toStatus,
    eventPayload.reason,
    eventPayload.refusalReason,
    eventPayload.metadata,
    prevHash,
    hash,
    timestamp
  );

  return { id, ...eventPayload, prevHash, hash };
}

/**
 * Verify Hash Chain Integrity (GET /api/audit/verify)
 */
function verifyAuditChain() {
  const rows = db.prepare('SELECT * FROM AuditEvent ORDER BY rowid ASC').all();
  let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.prevHash !== prevHash) {
      return {
        ok: false,
        valid: false,
        brokenRowId: row.id,
        index: i,
        error: `Broken chain link at row ${row.id}: expected prevHash ${prevHash}, got ${row.prevHash}`
      };
    }

    const payload = {
      entityType: row.entityType,
      entityId: row.entityId,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action: row.action,
      outcome: row.outcome,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      reason: row.reason,
      refusalReason: row.refusalReason,
      metadata: row.metadata,
      timestamp: row.timestamp
    };

    const calculatedHash = computeAuditHash(prevHash, payload);
    if (calculatedHash !== row.hash) {
      return {
        ok: false,
        valid: false,
        brokenRowId: row.id,
        index: i,
        error: `Tampered row at ${row.id}: calculated hash ${calculatedHash}, stored hash ${row.hash}`
      };
    }

    prevHash = row.hash;
  }

  return {
    ok: true,
    valid: true,
    count: rows.length,
    latestHash: prevHash
  };
}

/**
 * Prisma-compatible ORM wrapper for all models
 */
const prisma = {
  $queryRaw: (query, ...params) => db.prepare(query).all(...params),
  $executeRaw: (query, ...params) => db.prepare(query).run(...params),
  $transaction: async (fn) => {
    // SQLite transaction
    db.exec('BEGIN IMMEDIATE TRANSACTION;');
    try {
      const result = await fn(prisma);
      db.exec('COMMIT;');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK;'); } catch (e) { /* ignore */ }
      throw err;
    }
  },

  auditEvent: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM AuditEvent';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      sql += ' ORDER BY rowid ASC';
      return db.prepare(sql).all(...params);
    },
    create: ({ data }) => appendAuditEvent(data),
    update: ({ where, data }) => {
      // Direct raw query to test trigger enforcement
      const setClauses = Object.keys(data).map(k => `${k} = ?`).join(', ');
      const params = [...Object.values(data), where.id];
      return db.prepare(`UPDATE AuditEvent SET ${setClauses} WHERE id = ?`).run(...params);
    },
    delete: ({ where }) => {
      return db.prepare('DELETE FROM AuditEvent WHERE id = ?').run(where.id);
    }
  },

  issue: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM Issue';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          if (v && typeof v === 'object' && v.not !== undefined) {
            clauses.push(`${k} != ?`);
            params.push(v.not);
          } else {
            clauses.push(`${k} = ?`);
            params.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
          }
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      sql += ' ORDER BY datetime(createdAt) DESC';
      return db.prepare(sql).all(...params).map(r => ({
        ...r,
        isOverdue: Boolean(r.isOverdue),
        isApproachingDeadline: Boolean(r.isApproachingDeadline),
        isPossibleEmergency: Boolean(r.isPossibleEmergency),
        isCriticalVerified: Boolean(r.isCriticalVerified)
      }));
    },
    findUnique: ({ where }) => {
      const key = where.id ? 'id' : 'publicRef';
      const val = where.id || where.publicRef;
      const row = db.prepare(`SELECT * FROM Issue WHERE ${key} = ?`).get(val);
      if (!row) return null;
      return {
        ...row,
        isOverdue: Boolean(row.isOverdue),
        isApproachingDeadline: Boolean(row.isApproachingDeadline),
        isPossibleEmergency: Boolean(row.isPossibleEmergency),
        isCriticalVerified: Boolean(row.isCriticalVerified)
      };
    },
    create: ({ data }) => {
      const id = data.id || `issue-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO Issue (
          id, publicRef, title, description, department, categoryId, subcategoryId, category,
          status, priority, areaName, latitude, longitude, address,
          distinctCitizenCount, reportCount, supportCount, assignedToId, assignedToName,
          reopenCount, escalationLevel, isOverdue, isApproachingDeadline, emergencyStatus,
          isPossibleEmergency, isCriticalVerified, resolutionNote, rejectionReason,
          responseDeadline, resolutionDue, submittedAt, resolvedAt, closedAt, createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        id,
        data.publicRef,
        data.title,
        data.description,
        data.department,
        data.categoryId || null,
        data.subcategoryId || null,
        data.category,
        data.status || 'SUBMITTED',
        data.priority || 'Normal',
        data.areaName || null,
        data.latitude,
        data.longitude,
        data.address || null,
        data.distinctCitizenCount || 1,
        data.reportCount || 1,
        data.supportCount || 1,
        data.assignedToId || null,
        data.assignedToName || null,
        data.reopenCount || 0,
        data.escalationLevel || 0,
        data.isOverdue ? 1 : 0,
        data.isApproachingDeadline ? 1 : 0,
        data.emergencyStatus || 'NONE',
        data.isPossibleEmergency ? 1 : 0,
        data.isCriticalVerified ? 1 : 0,
        data.resolutionNote || null,
        data.rejectionReason || null,
        data.responseDeadline instanceof Date ? data.responseDeadline.toISOString() : (data.responseDeadline || now),
        data.resolutionDue instanceof Date ? data.resolutionDue.toISOString() : (data.resolutionDue || now),
        data.submittedAt instanceof Date ? data.submittedAt.toISOString() : (data.submittedAt || now),
        data.resolvedAt ? (data.resolvedAt instanceof Date ? data.resolvedAt.toISOString() : data.resolvedAt) : null,
        data.closedAt ? (data.closedAt instanceof Date ? data.closedAt.toISOString() : data.closedAt) : null,
        now,
        now
      );
      return prisma.issue.findUnique({ where: { id } });
    },
    update: ({ where, data }) => {
      const row = prisma.issue.findUnique({ where });
      if (!row) throw new Error('Issue not found for update');
      const keys = Object.keys(data);
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => {
        const val = data[k];
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (val instanceof Date) return val.toISOString();
        return val;
      });
      db.prepare(`UPDATE Issue SET ${setClauses}, updatedAt = ? WHERE id = ?`).run(...values, new Date().toISOString(), row.id);
      return prisma.issue.findUnique({ where: { id: row.id } });
    },
    count: (query = {}) => {
      const rows = prisma.issue.findMany(query);
      return rows.length;
    }
  },

  report: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM Report';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      if (where.issueId_citizenId) {
        return db.prepare('SELECT * FROM Report WHERE issueId = ? AND citizenId = ?').get(
          where.issueId_citizenId.issueId,
          where.issueId_citizenId.citizenId
        ) || null;
      }
      return db.prepare('SELECT * FROM Report WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `rep-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO Report (
          id, referenceId, issueId, citizenId, title, description,
          latitude, longitude, address, locationSource, locationConfirmedAt,
          isPossibleEmergency, emergencyConcern, submittedAt, createdAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        id,
        data.referenceId || `REP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        data.issueId,
        data.citizenId,
        data.title,
        data.description,
        data.latitude,
        data.longitude,
        data.address || null,
        data.locationSource || 'MANUAL',
        data.locationConfirmedAt ? (data.locationConfirmedAt instanceof Date ? data.locationConfirmedAt.toISOString() : data.locationConfirmedAt) : null,
        data.isPossibleEmergency ? 1 : 0,
        data.emergencyConcern || null,
        data.submittedAt instanceof Date ? data.submittedAt.toISOString() : (data.submittedAt || now),
        now
      );
      return prisma.report.findUnique({ where: { id } });
    },
    delete: ({ where }) => {
      return db.prepare('DELETE FROM Report WHERE id = ?').run(where.id);
    }
  },

  evidence: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM Evidence';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      return db.prepare('SELECT * FROM Evidence WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `ev-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO Evidence (id, reportId, issueId, filePath, mimeType, kind, uploadedById, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.reportId || null,
        data.issueId || null,
        data.filePath,
        data.mimeType,
        data.kind || 'INITIAL',
        data.uploadedById,
        now
      );
      return { id, ...data, createdAt: now };
    }
  },

  reopenRequest: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM ReopenRequest';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      return db.prepare('SELECT * FROM ReopenRequest WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `reopen-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO ReopenRequest (id, issueId, citizenId, reason, status, decidedById, decisionReason, createdAt, decidedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.issueId,
        data.citizenId,
        data.reason,
        data.status || 'PENDING',
        data.decidedById || null,
        data.decisionReason || null,
        now,
        null
      );
      return { id, ...data, createdAt: now };
    },
    update: ({ where, data }) => {
      const keys = Object.keys(data);
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => {
        const val = data[k];
        if (val instanceof Date) return val.toISOString();
        return val;
      });
      values.push(where.id);
      db.prepare(`UPDATE ReopenRequest SET ${setClauses} WHERE id = ?`).run(...values);
      return prisma.reopenRequest.findUnique({ where });
    }
  },

  possibleDuplicate: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM PossibleDuplicate';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      if (where.issueAId_issueBId) {
        return db.prepare('SELECT * FROM PossibleDuplicate WHERE issueAId = ? AND issueBId = ?').get(
          where.issueAId_issueBId.issueAId,
          where.issueAId_issueBId.issueBId
        ) || null;
      }
      return db.prepare('SELECT * FROM PossibleDuplicate WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `dup-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO PossibleDuplicate (id, issueAId, issueBId, similarity, distanceMeters, status, resolvedById, resolvedAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.issueAId,
        data.issueBId,
        data.similarity,
        data.distanceMeters,
        data.status || 'PENDING',
        data.resolvedById || null,
        data.resolvedAt ? (data.resolvedAt instanceof Date ? data.resolvedAt.toISOString() : data.resolvedAt) : null,
        now
      );
      return { id, ...data, createdAt: now };
    },
    update: ({ where, data }) => {
      const keys = Object.keys(data);
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => data[k] instanceof Date ? data[k].toISOString() : data[k]);
      values.push(where.id);
      db.prepare(`UPDATE PossibleDuplicate SET ${setClauses} WHERE id = ?`).run(...values);
      return prisma.possibleDuplicate.findUnique({ where });
    }
  },

  issueSupport: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM IssueSupport';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      if (where.issueId_citizenId) {
        return db.prepare('SELECT * FROM IssueSupport WHERE issueId = ? AND citizenId = ?').get(
          where.issueId_citizenId.issueId,
          where.issueId_citizenId.citizenId
        ) || null;
      }
      return db.prepare('SELECT * FROM IssueSupport WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `sup-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare('INSERT INTO IssueSupport (id, issueId, citizenId, createdAt) VALUES (?, ?, ?, ?)').run(
        id,
        data.issueId,
        data.citizenId,
        now
      );
      return { id, ...data, createdAt: now };
    },
    count: ({ where }) => {
      const row = db.prepare('SELECT COUNT(*) as count FROM IssueSupport WHERE issueId = ?').get(where.issueId);
      return row ? row.count : 0;
    }
  },

  emergencyFlag: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM EmergencyFlag';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      return db.prepare('SELECT * FROM EmergencyFlag WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `emg-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO EmergencyFlag (id, issueId, reportId, flaggedById, concern, status, verifiedById, reason, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.issueId,
        data.reportId || null,
        data.flaggedById,
        data.concern,
        data.status || 'PENDING',
        data.verifiedById || null,
        data.reason || null,
        now,
        now
      );
      return { id, ...data, createdAt: now, updatedAt: now };
    },
    update: ({ where, data }) => {
      const keys = Object.keys(data);
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => data[k]);
      values.push(new Date().toISOString(), where.id);
      db.prepare(`UPDATE EmergencyFlag SET ${setClauses}, updatedAt = ? WHERE id = ?`).run(...values);
      return prisma.emergencyFlag.findUnique({ where });
    }
  },

  satisfactionRating: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM SatisfactionRating';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      if (where.issueId_citizenId) {
        return db.prepare('SELECT * FROM SatisfactionRating WHERE issueId = ? AND citizenId = ?').get(
          where.issueId_citizenId.issueId,
          where.issueId_citizenId.citizenId
        ) || null;
      }
      return db.prepare('SELECT * FROM SatisfactionRating WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `rate-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare('INSERT INTO SatisfactionRating (id, issueId, citizenId, rating, comment, createdAt) VALUES (?, ?, ?, ?, ?, ?)').run(
        id,
        data.issueId,
        data.citizenId,
        data.rating,
        data.comment || null,
        now
      );
      return { id, ...data, createdAt: now };
    }
  },

  escalationEvent: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM EscalationEvent';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      if (where.issueId_kind_level) {
        return db.prepare('SELECT * FROM EscalationEvent WHERE issueId = ? AND kind = ? AND level = ?').get(
          where.issueId_kind_level.issueId,
          where.issueId_kind_level.kind,
          where.issueId_kind_level.level
        ) || null;
      }
      return db.prepare('SELECT * FROM EscalationEvent WHERE id = ?').get(where.id) || null;
    },
    create: ({ data }) => {
      const id = data.id || `esc-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare('INSERT INTO EscalationEvent (id, issueId, kind, level, triggeredAt) VALUES (?, ?, ?, ?, ?)').run(
        id,
        data.issueId,
        data.kind,
        data.level,
        now
      );
      return { id, ...data, triggeredAt: now };
    }
  },

  user: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM User';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      return db.prepare(sql).all(...params);
    },
    findUnique: ({ where }) => {
      const key = where.id ? 'id' : 'email';
      const val = where.id || where.email;
      return db.prepare(`SELECT * FROM User WHERE ${key} = ?`).get(val) || null;
    },
    create: ({ data }) => {
      const id = data.id || `usr-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO User (id, email, passwordHash, name, role, department, failedLoginAttempts, lockoutUntil, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.email,
        data.passwordHash,
        data.name,
        data.role,
        data.department || null,
        data.failedLoginAttempts || 0,
        data.lockoutUntil || null,
        now,
        now
      );
      return { id, ...data, createdAt: now, updatedAt: now };
    },
    update: ({ where, data }) => {
      const keys = Object.keys(data);
      const setClauses = keys.map(k => `${k} = ?`).join(', ');
      const values = keys.map(k => data[k]);
      const key = where.id ? 'id' : 'email';
      values.push(new Date().toISOString(), where[key]);
      db.prepare(`UPDATE User SET ${setClauses}, updatedAt = ? WHERE ${key} = ?`).run(...values);
      return prisma.user.findUnique({ where });
    }
  },

  notification: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM Notification';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      sql += ' ORDER BY datetime(createdAt) DESC';
      return db.prepare(sql).all(...params);
    },
    create: ({ data }) => {
      const id = data.id || `notif-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO Notification (id, userId, targetRoles, issueId, message, messageKey, params, readAt, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.userId || null,
        data.targetRoles || null,
        data.issueId || null,
        data.message,
        data.messageKey || null,
        data.params ? (typeof data.params === 'object' ? JSON.stringify(data.params) : data.params) : null,
        null,
        now
      );
      return { id, ...data, createdAt: now };
    }
  },

  systemWorkerHeartbeat: {
    get: () => {
      const row = db.prepare('SELECT * FROM SystemWorkerHeartbeat WHERE id = 1').get();
      return row || null;
    },
    record: (status = 'healthy', details = null) => {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO SystemWorkerHeartbeat (id, lastRanAt, status, details)
        VALUES (1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET lastRanAt = excluded.lastRanAt, status = excluded.status, details = excluded.details
      `).run(now, status, details);
      return { id: 1, lastRanAt: now, status, details };
    }
  },

  issueNote: {
    findMany: (query = {}) => {
      let sql = 'SELECT * FROM IssueNote';
      const params = [];
      if (query.where) {
        const clauses = [];
        for (const [k, v] of Object.entries(query.where)) {
          clauses.push(`${k} = ?`);
          params.push(v);
        }
        if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      }
      sql += ' ORDER BY datetime(createdAt) ASC';
      return db.prepare(sql).all(...params);
    },
    create: ({ data }) => {
      const id = data.id || `note-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
      const now = data.createdAt || new Date().toISOString();
      db.prepare(`
        INSERT INTO IssueNote (id, issueId, authorId, authorName, authorRole, body, visibility, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        data.issueId,
        data.authorId,
        data.authorName,
        data.authorRole,
        data.body,
        data.visibility || 'INTERNAL',
        now
      );
      return { id, ...data, createdAt: now };
    }
  }
};

module.exports = {
  db,
  prisma,
  appendAuditEvent,
  verifyAuditChain,
  initSchema
};
