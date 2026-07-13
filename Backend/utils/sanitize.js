const sanitizeHtml = require('sanitize-html');

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getOTPExpiry() {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10;
  return new Date(Date.now() + minutes * 60 * 1000);
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {}
  }).trim();
}

function sanitizeMessage(content) {
  if (typeof content !== 'string') return '';
  return sanitizeHtml(content, {
    allowedTags: ['b', 'i', 'u', 's', 'br'],
    allowedAttributes: {}
  }).trim();
}

module.exports = { generateOTP, getOTPExpiry, sanitizeInput, sanitizeMessage };
