const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authService = require('../services/authService');
const { otpLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/check-email', [
  body('email').isEmail().normalizeEmail()
], validate, async (req, res) => {
  try {
    const result = await authService.checkEmailAvailable(req.body.email);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, available: false });
  }
});

router.post('/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('phone').trim().isLength({ min: 10, max: 20 }),
  body('name').optional({ values: 'null' }).trim().isLength({ min: 2, max: 100 }),
  body('skipName').optional().isBoolean()
], validate, async (req, res) => {
  try {
    const result = await authService.signup(
      req.body.email,
      req.body.password,
      req.body.phone,
      req.body.name || null,
      req.body.skipName === true
    );
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 })
], validate, async (req, res) => {
  try {
    const result = await authService.verifySignupOTP(req.body.email, req.body.code);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/resend-otp', otpLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('type').isIn(['signup', 'reset'])
], validate, async (req, res) => {
  try {
    const result = await authService.resendOTP(req.body.email, req.body.type);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], validate, async (req, res) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

router.post('/forgot-password', otpLimiter, [
  body('email').isEmail().normalizeEmail()
], validate, async (req, res) => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/verify-reset-otp', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 })
], validate, async (req, res) => {
  try {
    const result = await authService.verifyResetOTP(req.body.email, req.body.code);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/reset-password', [
  body('email').isEmail().normalizeEmail(),
  body('code').isLength({ min: 6, max: 6 }),
  body('newPassword').isLength({ min: 6 })
], validate, async (req, res) => {
  try {
    const result = await authService.resetPassword(req.body.email, req.body.code, req.body.newPassword);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
