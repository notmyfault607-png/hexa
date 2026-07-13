const express = require('express');
const { body, query } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const messageService = require('../services/messageService');

const router = express.Router();

router.use(authMiddleware);

router.get('/search/:query', async (req, res) => {
  try {
    const messages = await messageService.searchMessages(req.userId, req.params.query, req.query.chatId);
    res.json({ success: true, messages });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:chatId', [
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('before').optional().isISO8601()
], validate, async (req, res) => {
  try {
    const messages = await messageService.getMessages(req.userId, req.params.chatId, {
      limit: parseInt(req.query.limit, 10) || 50,
      before: req.query.before
    });
    res.json({ success: true, messages });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:chatId', [
  body('content').optional({ values: 'null' }).isString(),
  body('type').optional().isIn(['text', 'image', 'video', 'audio', 'file', 'voice', 'gif', 'location', 'contact', 'emoji']),
  body('media_url').optional({ values: 'null' }).isURL(),
  body('reply_to_id').optional({ values: 'null' }).isUUID()
], validate, async (req, res) => {
  try {
    const message = await messageService.sendMessage(req.userId, req.params.chatId, req.body);
    res.json({ success: true, message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:messageId', [body('content').notEmpty()], validate, async (req, res) => {
  try {
    const message = await messageService.editMessage(req.userId, req.params.messageId, req.body.content);
    res.json({ success: true, message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:messageId/me', async (req, res) => {
  try {
    const result = await messageService.deleteForMe(req.userId, req.params.messageId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:messageId/all', async (req, res) => {
  try {
    const message = await messageService.deleteForEveryone(req.userId, req.params.messageId);
    res.json({ success: true, message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:messageId/react', [body('emoji').notEmpty()], validate, async (req, res) => {
  try {
    const reaction = await messageService.addReaction(req.userId, req.params.messageId, req.body.emoji);
    res.json({ success: true, reaction });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:messageId/react/:emoji', async (req, res) => {
  try {
    const result = await messageService.removeReaction(req.userId, req.params.messageId, req.params.emoji);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:chatId/pin/:messageId', async (req, res) => {
  try {
    const pin = await messageService.pinMessage(req.userId, req.params.chatId, req.params.messageId);
    res.json({ success: true, pin });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:chatId/pin/:messageId', async (req, res) => {
  try {
    const result = await messageService.unpinMessage(req.params.chatId, req.params.messageId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:messageId/star', async (req, res) => {
  try {
    const star = await messageService.starMessage(req.userId, req.params.messageId);
    res.json({ success: true, star });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:messageId/star', async (req, res) => {
  try {
    const result = await messageService.unstarMessage(req.userId, req.params.messageId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:chatId/read', async (req, res) => {
  try {
    await messageService.markChatRead(req.userId, req.params.chatId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:chatId/clear', async (req, res) => {
  try {
    const result = await messageService.clearChatForMe(req.userId, req.params.chatId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:messageId/forward', [body('targetChatId').isUUID()], validate, async (req, res) => {
  try {
    const message = await messageService.forwardMessage(req.userId, req.params.messageId, req.body.targetChatId);
    res.json({ success: true, message });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
