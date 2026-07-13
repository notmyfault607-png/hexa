const rateLimit = require('express-rate-limit');

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  // Railway uses X-Forwarded-For; trust proxy is set on Express app
  validate: { trustProxy: false }
};

const generalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, message: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { success: false, message: 'Too many auth attempts, please try again later' }
});

const otpLimiter = rateLimit({
  ...base,
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many OTP requests, please wait' }
});

module.exports = { generalLimiter, authLimiter, otpLimiter };
