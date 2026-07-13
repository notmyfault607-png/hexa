const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const mediaService = require('../services/mediaService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.use(authMiddleware);

router.post('/avatar', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const result = await mediaService.uploadFile(req.file, mediaService.BUCKETS.avatars, `${req.userId}/`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/message', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const result = await mediaService.uploadFile(req.file, mediaService.BUCKETS.messages, `${req.userId}/`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/status', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const result = await mediaService.uploadFile(req.file, mediaService.BUCKETS.status, `${req.userId}/`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/group', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });
    const result = await mediaService.uploadFile(req.file, mediaService.BUCKETS.groups, `${req.userId}/`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
