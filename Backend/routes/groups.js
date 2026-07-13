const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const groupService = require('../services/groupService');

const router = express.Router();

router.use(authMiddleware);

router.post('/', [
  body('name').trim().isLength({ min: 2, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('memberIds').optional().isArray()
], validate, async (req, res) => {
  try {
    const group = await groupService.createGroup(req.userId, req.body);
    res.json({ success: true, group });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:chatId', async (req, res) => {
  try {
    const group = await groupService.updateGroup(req.userId, req.params.chatId, req.body);
    res.json({ success: true, group });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:chatId/members', [body('memberIds').isArray()], validate, async (req, res) => {
  try {
    const members = await groupService.addMembers(req.userId, req.params.chatId, req.body.memberIds);
    res.json({ success: true, members });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:chatId/members/:memberId', async (req, res) => {
  try {
    const result = await groupService.removeMember(req.userId, req.params.chatId, req.params.memberId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:chatId/promote/:memberId', async (req, res) => {
  try {
    const member = await groupService.promoteAdmin(req.userId, req.params.chatId, req.params.memberId);
    res.json({ success: true, member });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:chatId/leave', async (req, res) => {
  try {
    const result = await groupService.leaveGroup(req.userId, req.params.chatId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:chatId', async (req, res) => {
  try {
    const result = await groupService.deleteGroup(req.userId, req.params.chatId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:chatId/notifications', async (req, res) => {
  try {
    const result = await groupService.toggleGroupNotifications(req.userId, req.params.chatId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
