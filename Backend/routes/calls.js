const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const callService = require('../services/callService');

const router = express.Router();

router.use(authMiddleware);

router.get('/history', async (req, res) => {
  try {
    const calls = await callService.getCallHistory(req.userId);
    res.json({ success: true, calls });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:callId', async (req, res) => {
  try {
    const call = await callService.getCall(req.params.callId);
    res.json({ success: true, call });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

router.post('/', [
  body('receiverId').isUUID(),
  body('type').isIn(['voice', 'video']),
  body('chatId').optional().isUUID()
], validate, async (req, res) => {
  try {
    const call = await callService.createCall(req.userId, req.body.receiverId, req.body.type, req.body.chatId);
    res.json({ success: true, call });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/:callId/status', [body('status').isIn(['accepted', 'rejected', 'ended', 'missed', 'busy'])], validate, async (req, res) => {
  try {
    const call = await callService.updateCallStatus(req.params.callId, req.body.status);
    res.json({ success: true, call });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
