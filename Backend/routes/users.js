const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');
const userService = require('../services/userService');

const router = express.Router();

router.use(authMiddleware);

router.get('/profile', async (req, res) => {
  try {
    const profile = await userService.getProfile(req.userId);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

router.get('/search/:query', async (req, res) => {
  try {
    const users = await userService.searchUsers(req.params.query, req.userId);
    res.json({ success: true, users });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/lookup/phone/:phone', async (req, res) => {
  try {
    const phone = decodeURIComponent(req.params.phone || '').replace(/ /g, '+');
    const user = await userService.findByPhone(phone, req.userId);
    res.json({ success: true, found: !!user, user: user || null });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/lookup/phone', [body('phone').trim().isLength({ min: 10, max: 20 })], validate, async (req, res) => {
  try {
    const user = await userService.findByPhone(req.body.phone, req.userId);
    res.json({ success: true, found: !!user, user: user || null });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const profile = await userService.getPublicProfile(req.params.userId, req.userId);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

router.put('/profile', [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('bio').optional().isLength({ max: 500 }),
  body('about').optional().isLength({ max: 1000 }),
  body('phone').optional().trim().isLength({ min: 10, max: 20 })
], validate, async (req, res) => {
  try {
    const profile = await userService.updateProfile(req.userId, req.body);
    res.json({ success: true, profile });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
