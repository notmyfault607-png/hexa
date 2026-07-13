const express = require('express');
const authMiddleware = require('../middleware/auth');
const settingsService = require('../services/settingsService');

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const settings = await settingsService.getSettings(req.userId);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const settings = await settingsService.updateSettings(req.userId, req.body);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
