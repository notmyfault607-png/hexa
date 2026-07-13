const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const statusService = require('../services/statusService');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const statuses = await statusService.getContactStatuses(req.userId);
    res.json({ success: true, statuses });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/', [
  body('type').isIn(['text', 'image', 'video', 'emoji']),
  body('content').optional({ values: 'null' }).isString(),
  body('media_url').optional({ values: 'null' }).isURL(),
  body('background_color').optional({ values: 'null' }).isString()
], validate, async (req, res) => {
  try {
    const status = await statusService.createStatus(req.userId, req.body);
    res.json({ success: true, status });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:statusId/view', async (req, res) => {
  try {
    const views = await statusService.viewStatus(req.userId, req.params.statusId);
    res.json({ success: true, views });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/:statusId', async (req, res) => {
  try {
    const result = await statusService.deleteStatus(req.userId, req.params.statusId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/:statusId/react', [body('emoji').notEmpty()], validate, async (req, res) => {
  try {
    const reaction = await statusService.reactToStatus(req.userId, req.params.statusId, req.body.emoji);
    res.json({ success: true, reaction });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
