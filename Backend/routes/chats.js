const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const chatService = require('../services/chatService');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const chats = await chatService.getUserChats(req.userId);
    res.json({ success: true, chats });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/direct', [body('userId').isUUID()], validate, async (req, res) => {
  try {
    const chatId = await chatService.getOrCreateDirectChat(req.userId, req.body.userId);
    res.json({ success: true, chatId });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:chatId/members', async (req, res) => {
  try {
    const members = await chatService.getChatMembers(req.params.chatId);
    res.json({ success: true, members });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
