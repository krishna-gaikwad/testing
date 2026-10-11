const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const { NotificationStore } = require('../services/memoryStore');

// GET /api/notifications - List user's notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const userId = (user._id || user.id).toString();

    let notifs = [];
    if (mongoose.connection.readyState === 1) {
      const Notification = require('../models/Notification');
      notifs = await Notification.find({
        $or: [
          { user: userId },
          { user: null } // broadcast / system notifications
        ]
      }).sort({ createdAt: -1 }).limit(50);
    } else {
      const all = await NotificationStore.find({});
      notifs = all.filter(n => {
        if (!n.user) {
          // Check role broadcast if present
          if (n.targetRoles && !n.targetRoles.includes(user.role)) return false;
          if (n.department && user.role === 'officer' && n.department !== user.department) return false;
          return true;
        }
        return n.user === userId;
      });
    }

    res.status(200).json({ notifications: notifs });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// POST /api/notifications/:id/read - Mark notification as read
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    const userId = (user._id || user.id).toString();
    const notifId = req.params.id;

    let updated;
    if (mongoose.connection.readyState === 1) {
      const Notification = require('../models/Notification');
      updated = await Notification.findOneAndUpdate(
        { _id: notifId },
        { isRead: true },
        { new: true }
      );
    } else {
      updated = await NotificationStore.markAsRead(notifId, userId);
    }

    if (!updated) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.status(200).json({ message: 'Notification marked as read.', notification: updated });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

module.exports = router;
