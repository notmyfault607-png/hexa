const rateLimit = require('express-rate-limit');

const limiterOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }
};

const generalLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again later' }
});

const otpLimiter = rateLimit({
  ...limiterOptions,
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests, please wait' }
});

module.exports = { generalLimiter, authLimiter, otpLimiter };
