const express = require('express');
const authMiddleware = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const notifications = await notificationService.getNotifications(req.userId);
    res.json({ success: true, notifications });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const count = await notificationService.getUnreadCount(req.userId);
    res.json({ success: true, count });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:id/read', async (req, res) => {
  try {
    await notificationService.markRead(req.userId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/read-all', async (req, res) => {
  try {
    await notificationService.markAllRead(req.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
