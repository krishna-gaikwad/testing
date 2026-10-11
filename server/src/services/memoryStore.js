const mongoose = require('mongoose');
const { prisma, appendAuditEvent } = require('../db/sqlite');

// In-Memory store mirrored with SQLite
const memoryStore = {
  users: [],
  complaints: [],
  evidence: [],
  supports: [],
  workflowEvents: [],
  emergencyFlags: [],
  notifications: [],
  aiSuggestions: [],
  reopenRequests: [],
  possibleDuplicates: [],
  satisfactionRatings: [],
  escalationEvents: [],
  issueNotes: []
};

// Simple ID generator
let idCounter = 1;
const generateId = () => {
  return (idCounter++).toString().padStart(24, 'a');
};

const UserStore = {
  async findOne(query) {
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      return User.findOne(query);
    }
    const user = memoryStore.users.find(u => {
      for (const key of Object.keys(query)) {
        if (query[key] instanceof RegExp) {
          if (!query[key].test(u[key])) return false;
        } else if (u[key] !== query[key]) {
          return false;
        }
      }
      return true;
    });
    return user ? { ...user } : null;
  },

  async find(query = {}) {
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      return User.find(query).select('-passwordHash');
    }
    return memoryStore.users.filter(u => {
      for (const key of Object.keys(query)) {
        if (query[key] !== undefined && u[key] !== query[key]) return false;
      }
      return true;
    }).map(u => {
      const { passwordHash, ...safe } = u;
      return safe;
    });
  },

  async findById(id) {
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      return User.findById(id).select('-passwordHash');
    }
    const user = memoryStore.users.find(u => u._id === id || u.id === id);
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  },

  async create(userData) {
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      return User.create(userData);
    }
    const id = generateId();
    const newUser = {
      _id: id,
      id,
      name: userData.name,
      email: userData.email.toLowerCase(),
      passwordHash: userData.passwordHash,
      role: userData.role || 'citizen',
      department: userData.department || null,
      isActive: userData.isActive !== undefined ? userData.isActive : true,
      failedLoginAttempts: 0,
      lockoutUntil: null,
      createdAt: new Date()
    };
    memoryStore.users.push(newUser);

    try {
      prisma.user.create({
        data: {
          id,
          name: newUser.name,
          email: newUser.email,
          passwordHash: newUser.passwordHash,
          role: newUser.role,
          department: newUser.department
        }
      });
    } catch (e) {
      // Ignore SQLite uniqueness collision if re-seeding
    }

    return { ...newUser };
  },

  async update(id, updates) {
    const user = memoryStore.users.find(u => u._id === id || u.id === id || u.email === id);
    if (!user) return null;
    Object.assign(user, updates);
    try {
      prisma.user.update({ where: { id: user.id }, data: updates });
    } catch (e) { /* ignore */ }
    return user;
  },

  async countDocuments(query = {}) {
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      return User.countDocuments(query);
    }
    return memoryStore.users.length;
  },

  async deleteMany(query = {}) {
    if (mongoose.connection.readyState === 1) {
      const User = require('../models/User');
      return User.deleteMany(query);
    }
    memoryStore.users = [];
    return { acknowledged: true, deletedCount: 0 };
  },

  getAll() {
    return memoryStore.users;
  }
};

const ComplaintStore = {
  async findById(id) {
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      return Complaint.findById(id);
    }
    return memoryStore.complaints.find(c => c._id === id || c.id === id || c.trackingId === id) || null;
  },

  async find(query = {}) {
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      return Complaint.find(query).sort({ createdAt: -1 });
    }
    return memoryStore.complaints.filter(c => {
      for (const key of Object.keys(query)) {
        if (query[key] !== undefined && c[key] !== query[key]) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async create(data) {
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      return Complaint.create(data);
    }
    const id = generateId();
    const item = {
      _id: id,
      id,
      reopenCount: 0,
      supportCount: 1,
      distinctCitizenCount: 1,
      reportCount: 1,
      escalationLevel: 0,
      isPossibleEmergency: false,
      isCriticalVerified: false,
      emergencyStatus: data.isPossibleEmergency ? 'POSSIBLE_UNVERIFIED' : 'NONE',
      isOverdue: false,
      isApproachingDeadline: false,
      version: data.version || 1,
      reviewingBy: null,
      reviewingUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    };
    memoryStore.complaints.push(item);

    try {
      const lat = item.location?.lat ?? item.lat ?? 18.5204;
      const lng = item.location?.lng ?? item.lng ?? 73.8567;
      prisma.issue.create({
        data: {
          id,
          publicRef: item.trackingId || `NS-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
          title: item.title,
          description: item.description,
          department: item.department,
          categoryId: item.categoryId || null,
          subcategoryId: item.subcategoryId || null,
          category: item.category,
          status: item.status || 'SUBMITTED',
          priority: item.priority || 'Normal',
          areaName: item.area || null,
          latitude: lat,
          longitude: lng,
          address: item.location?.address || item.address || null,
          distinctCitizenCount: item.distinctCitizenCount || 1,
          reportCount: item.reportCount || 1,
          supportCount: item.supportCount || 1,
          assignedToId: item.assignedTo || null,
          assignedToName: item.assignedToName || null,
          reopenCount: item.reopenCount || 0,
          escalationLevel: item.escalationLevel || 0,
          isOverdue: item.isOverdue || false,
          isApproachingDeadline: item.isApproachingDeadline || false,
          emergencyStatus: item.emergencyStatus || 'NONE',
          isPossibleEmergency: item.isPossibleEmergency || false,
          isCriticalVerified: item.isCriticalVerified || false,
          resolutionNote: item.resolutionNote || null,
          rejectionReason: item.rejectionReason || null,
          responseDeadline: item.initialResponseDue || new Date(),
          resolutionDue: item.resolutionDue || new Date(),
          submittedAt: item.createdAt || new Date(),
          version: item.version || 1
        }
      });
    } catch (e) {
      // ignore sqlite push error in memory mode
    }

    return item;
  },

  async update(id, updates) {
    if (mongoose.connection.readyState === 1) {
      const Complaint = require('../models/Complaint');
      return Complaint.findByIdAndUpdate(id, updates, { new: true });
    }
    const item = memoryStore.complaints.find(c => c._id === id || c.id === id);
    if (!item) return null;
    Object.assign(item, updates, { updatedAt: new Date() });

    try {
      const sqliteUpdates = {};
      if (updates.status) sqliteUpdates.status = updates.status;
      if (updates.priority) sqliteUpdates.priority = updates.priority;
      if (updates.assignedTo) sqliteUpdates.assignedToId = updates.assignedTo;
      if (updates.assignedToName) sqliteUpdates.assignedToName = updates.assignedToName;
      if (updates.supportCount !== undefined) {
        sqliteUpdates.supportCount = updates.supportCount;
        sqliteUpdates.distinctCitizenCount = updates.supportCount;
      }
      if (updates.isOverdue !== undefined) sqliteUpdates.isOverdue = updates.isOverdue;
      if (updates.isCriticalVerified !== undefined) sqliteUpdates.isCriticalVerified = updates.isCriticalVerified;
      if (updates.emergencyStatus) sqliteUpdates.emergencyStatus = updates.emergencyStatus;
      if (updates.resolvedAt) sqliteUpdates.resolvedAt = updates.resolvedAt;
      if (updates.resolutionNote) sqliteUpdates.resolutionNote = updates.resolutionNote;
      if (updates.rejectionReason) sqliteUpdates.rejectionReason = updates.rejectionReason;
      if (updates.version !== undefined) sqliteUpdates.version = updates.version;
      if (updates.reviewingBy !== undefined) sqliteUpdates.reviewingBy = updates.reviewingBy;
      if (updates.reviewingUntil !== undefined) sqliteUpdates.reviewingUntil = updates.reviewingUntil;
      if (updates.department) sqliteUpdates.department = updates.department;
      if (updates.category) sqliteUpdates.category = updates.category;
      if (updates.initialResponseDue) sqliteUpdates.responseDeadline = updates.initialResponseDue;
      if (updates.resolutionDue) sqliteUpdates.resolutionDue = updates.resolutionDue;
      if (Object.keys(sqliteUpdates).length) {
        prisma.issue.update({ where: { id: item.id || item._id }, data: sqliteUpdates });
      }
    } catch (e) { /* ignore */ }

    return item;
  }
};

const EvidenceStore = {
  async create(data) {
    if (mongoose.connection.readyState === 1) {
      const Evidence = require('../models/Evidence');
      return Evidence.create(data);
    }
    const id = generateId();
    const item = {
      _id: id,
      id,
      createdAt: new Date(),
      ...data
    };
    memoryStore.evidence.push(item);

    try {
      prisma.evidence.create({
        data: {
          id,
          issueId: item.complaint || item.issueId || null,
          filePath: item.filePath,
          mimeType: item.mimeType,
          kind: item.kind || 'INITIAL',
          uploadedById: item.uploader || item.uploadedById || 'anonymous'
        }
      });
    } catch (e) { /* ignore */ }

    return item;
  },

  async find(query = {}) {
    if (mongoose.connection.readyState === 1) {
      const Evidence = require('../models/Evidence');
      return Evidence.find(query);
    }
    return memoryStore.evidence.filter(e => {
      for (const key of Object.keys(query)) {
        if (e[key] !== query[key]) return false;
      }
      return true;
    });
  },

  async findById(id) {
    return memoryStore.evidence.find(e => e._id === id || e.id === id) || null;
  }
};

const EmergencyFlagStore = {
  async create(data) {
    if (mongoose.connection.readyState === 1) {
      const EmergencyFlag = require('../models/EmergencyFlag');
      return EmergencyFlag.create(data);
    }
    const id = generateId();
    const flag = {
      _id: id,
      id,
      verificationStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    };
    memoryStore.emergencyFlags.push(flag);

    try {
      prisma.emergencyFlag.create({
        data: {
          id,
          issueId: flag.complaint || flag.issueId,
          reportId: flag.reportId || null,
          flaggedById: flag.flaggedBy || flag.flaggedById,
          concern: flag.concern,
          status: 'PENDING'
        }
      });
    } catch (e) { /* ignore */ }

    return flag;
  },

  async find(query = {}) {
    if (mongoose.connection.readyState === 1) {
      const EmergencyFlag = require('../models/EmergencyFlag');
      return EmergencyFlag.find(query);
    }
    return memoryStore.emergencyFlags.filter(f => {
      for (const key of Object.keys(query)) {
        if (f[key] !== query[key]) return false;
      }
      return true;
    });
  },

  async update(id, updates) {
    const flag = memoryStore.emergencyFlags.find(f => f._id === id || f.id === id);
    if (!flag) return null;
    Object.assign(flag, updates, { updatedAt: new Date() });
    try {
      prisma.emergencyFlag.update({ where: { id: flag.id }, data: updates });
    } catch (e) { /* ignore */ }
    return flag;
  }
};

const WorkflowEventStore = {
  async create(data) {
    const id = generateId();
    let auditRecord = null;
    try {
      auditRecord = appendAuditEvent({
        id,
        entityType: 'Issue',
        entityId: data.complaint?.toString() || data.issueId?.toString() || id,
        actorId: data.actor?.toString() || 'system',
        actorRole: data.actorRole || 'system',
        action: data.action || 'Workflow Event',
        outcome: data.outcome || 'accepted',
        fromStatus: data.fromStatus || null,
        toStatus: data.toStatus || null,
        reason: data.reason || null,
        refusalReason: data.refusalReason || null,
        metadata: data.metadata || null
      });
    } catch (e) {
      console.warn('SQLite audit write:', e.message);
    }

    const event = {
      _id: id,
      id,
      createdAt: new Date(),
      prevHash: auditRecord ? auditRecord.prevHash : null,
      hash: auditRecord ? auditRecord.hash : null,
      ...data
    };
    memoryStore.workflowEvents.push(event);
    return event;
  },

  async find(query = {}) {
    return memoryStore.workflowEvents.filter(e => {
      for (const key of Object.keys(query)) {
        if (e[key] !== query[key]) return false;
      }
      return true;
    });
  }
};

const NotificationStore = {
  async create(data) {
    const id = generateId();
    const notif = {
      _id: id,
      id,
      isRead: false,
      createdAt: new Date(),
      ...data
    };
    memoryStore.notifications.push(notif);

    try {
      prisma.notification.create({
        data: {
          id,
          userId: notif.user || notif.userId || null,
          targetRoles: notif.targetRoles ? JSON.stringify(notif.targetRoles) : null,
          issueId: notif.complaint || notif.issueId || null,
          message: notif.message,
          messageKey: notif.messageKey || null,
          params: notif.params ? (typeof notif.params === 'object' ? JSON.stringify(notif.params) : notif.params) : null
        }
      });
    } catch (e) { /* ignore */ }

    return notif;
  },

  async find(query = {}) {
    return memoryStore.notifications.filter(n => {
      for (const key of Object.keys(query)) {
        if (n[key] !== query[key]) return false;
      }
      return true;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async markAsRead(id, userId) {
    const notif = memoryStore.notifications.find(n => (n._id === id || n.id === id) && (n.user === userId || n.user === null));
    if (notif) notif.isRead = true;
    return notif;
  }
};

const SupportStore = {
  async create(data) {
    const complaintId = data.complaint.toString();
    const citizenId = data.citizen.toString();
    const existing = memoryStore.supports.find(
      s => s.complaint.toString() === complaintId && s.citizen.toString() === citizenId
    );
    if (existing) {
      const err = new Error('Duplicate key: citizen already supported this complaint');
      err.code = 11000;
      throw err;
    }
    const id = generateId();
    const sup = {
      _id: id,
      id,
      createdAt: new Date(),
      ...data,
      complaint: complaintId,
      citizen: citizenId
    };
    memoryStore.supports.push(sup);

    try {
      prisma.issueSupport.create({
        data: {
          id,
          issueId: complaintId,
          citizenId
        }
      });
    } catch (e) { /* ignore */ }

    return sup;
  },

  async find(query = {}) {
    return memoryStore.supports.filter(s => {
      for (const key of Object.keys(query)) {
        if (s[key]?.toString() !== query[key]?.toString()) return false;
      }
      return true;
    });
  },

  async findOne(query = {}) {
    return memoryStore.supports.find(s => {
      for (const key of Object.keys(query)) {
        if (s[key]?.toString() !== query[key]?.toString()) return false;
      }
      return true;
    }) || null;
  },

  async countDocuments(query = {}) {
    return (await this.find(query)).length;
  }
};

const ReopenRequestStore = {
  async create(data) {
    const id = generateId();
    const row = {
      _id: id,
      id,
      status: 'PENDING',
      createdAt: new Date(),
      decidedAt: null,
      ...data
    };
    memoryStore.reopenRequests.push(row);

    try {
      prisma.reopenRequest.create({
        data: {
          id,
          issueId: row.issueId || row.complaint,
          citizenId: row.citizenId || row.citizen,
          reason: row.reason,
          status: row.status || 'PENDING'
        }
      });
    } catch (e) { /* ignore */ }

    return row;
  },

  async find(query = {}) {
    return memoryStore.reopenRequests.filter(r => {
      for (const key of Object.keys(query)) {
        if (r[key] !== query[key]) return false;
      }
      return true;
    });
  },

  async findOne(query = {}) {
    return memoryStore.reopenRequests.find(r => {
      for (const key of Object.keys(query)) {
        if (r[key] !== query[key]) return false;
      }
      return true;
    }) || null;
  },

  async update(id, updates) {
    const item = memoryStore.reopenRequests.find(r => r._id === id || r.id === id);
    if (!item) return null;
    Object.assign(item, updates);
    try {
      prisma.reopenRequest.update({ where: { id: item.id }, data: updates });
    } catch (e) { /* ignore */ }
    return item;
  }
};

const PossibleDuplicateStore = {
  async create(data) {
    const id = generateId();
    const row = {
      _id: id,
      id,
      status: 'PENDING',
      createdAt: new Date(),
      resolvedAt: null,
      ...data
    };
    memoryStore.possibleDuplicates.push(row);

    try {
      prisma.possibleDuplicate.create({
        data: {
          id,
          issueAId: row.issueAId,
          issueBId: row.issueBId,
          similarity: row.similarity,
          distanceMeters: row.distanceMeters,
          status: row.status || 'PENDING'
        }
      });
    } catch (e) { /* ignore */ }

    return row;
  },

  async find(query = {}) {
    return memoryStore.possibleDuplicates.filter(d => {
      for (const key of Object.keys(query)) {
        if (d[key] !== query[key]) return false;
      }
      return true;
    });
  },

  async update(id, updates) {
    const item = memoryStore.possibleDuplicates.find(d => d._id === id || d.id === id);
    if (!item) return null;
    Object.assign(item, updates);
    try {
      prisma.possibleDuplicate.update({ where: { id: item.id }, data: updates });
    } catch (e) { /* ignore */ }
    return item;
  }
};

const SatisfactionRatingStore = {
  async create(data) {
    const id = generateId();
    const row = {
      _id: id,
      id,
      createdAt: new Date(),
      ...data
    };
    memoryStore.satisfactionRatings.push(row);

    try {
      prisma.satisfactionRating.create({
        data: {
          id,
          issueId: row.issueId || row.complaint,
          citizenId: row.citizenId || row.citizen,
          rating: row.rating,
          comment: row.comment || null
        }
      });
    } catch (e) { /* ignore */ }

    return row;
  },

  async findOne(query = {}) {
    return memoryStore.satisfactionRatings.find(r => {
      for (const key of Object.keys(query)) {
        if (r[key] !== query[key]) return false;
      }
      return true;
    }) || null;
  }
};

const EscalationEventStore = {
  async create(data) {
    const id = generateId();
    const row = {
      _id: id,
      id,
      triggeredAt: new Date(),
      ...data
    };
    memoryStore.escalationEvents.push(row);

    try {
      prisma.escalationEvent.create({
        data: {
          id,
          issueId: row.issueId || row.complaint,
          kind: row.kind,
          level: row.level
        }
      });
    } catch (e) { /* ignore */ }

    return row;
  },

  async findOne(query = {}) {
    return memoryStore.escalationEvents.find(e => {
      for (const key of Object.keys(query)) {
        if (e[key] !== query[key]) return false;
      }
      return true;
    }) || null;
  }
};

const AiSuggestionStore = {
  async create(data) {
    const id = generateId();
    const sug = {
      _id: id,
      id,
      createdAt: new Date(),
      ...data
    };
    memoryStore.aiSuggestions.push(sug);
    return sug;
  },

  async find(query = {}) {
    return memoryStore.aiSuggestions.filter(s => {
      for (const key of Object.keys(query)) {
        if (s[key]?.toString() !== query[key]?.toString()) return false;
      }
      return true;
    });
  },

  async findOne(query = {}) {
    return memoryStore.aiSuggestions.find(s => {
      for (const key of Object.keys(query)) {
        if (s[key]?.toString() !== query[key]?.toString()) return false;
      }
      return true;
    }) || null;
  }
};

const IssueNoteStore = {
  async find(query = {}) {
    return memoryStore.issueNotes.filter(n => {
      for (const key of Object.keys(query)) {
        if (query[key] !== undefined && n[key] !== query[key]) return false;
      }
      return true;
    }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  },

  async create(data) {
    const id = generateId();
    const item = {
      _id: id,
      id,
      createdAt: new Date().toISOString(),
      ...data
    };
    memoryStore.issueNotes.push(item);

    try {
      prisma.issueNote.create({
        data: {
          id,
          issueId: item.issueId || item.complaint,
          authorId: item.authorId,
          authorName: item.authorName,
          authorRole: item.authorRole,
          body: item.body,
          visibility: item.visibility || 'INTERNAL',
          createdAt: item.createdAt
        }
      });
    } catch (e) { /* ignore */ }

    return item;
  }
};

module.exports = {
  memoryStore,
  UserStore,
  ComplaintStore,
  EvidenceStore,
  EmergencyFlagStore,
  WorkflowEventStore,
  NotificationStore,
  SupportStore,
  ReopenRequestStore,
  PossibleDuplicateStore,
  SatisfactionRatingStore,
  EscalationEventStore,
  AiSuggestionStore,
  IssueNoteStore,
  generateId
};
