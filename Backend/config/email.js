const nodemailer = require('nodemailer');

const emailPort = parseInt(process.env.EMAIL_PORT, 10) || 587;
const emailConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS && process.env.EMAIL_FROM);

const transporter = emailConfigured
  ? nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: emailPort,
      secure: emailPort === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
      connectionTimeout: 15000,
      greetingTimeout: 15000
    })
  : null;

async function verifyEmailConnection() {
  if (!transporter) {
    console.warn('Email OTP disabled: set EMAIL_HOST, EMAIL_USER, EMAIL_PASS, EMAIL_FROM in Railway variables');
    return false;
  }
  try {
    await transporter.verify();
    console.log('Email OTP service ready');
    return true;
  } catch (err) {
    console.error('Email OTP verify failed:', err.message);
    return false;
  }
}

async function sendOTPEmail(email, code, type) {
  if (!transporter) {
    throw new Error('Email service not configured. Contact admin to set SMTP on Railway.');
  }

  const subject = type === 'signup'
    ? 'HexaChat - Verify Your Email'
    : 'HexaChat - Reset Your Password';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 30px; background: #000; color: #fff; border-radius: 12px;">
      <h1 style="color: #fff; text-align: center;">HexaChat</h1>
      <p style="color: #ccc; text-align: center;">Your verification code is:</p>
      <div style="background: #111; border: 2px solid #fff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #fff;">${code}</span>
      </div>
      <p style="color: #888; text-align: center; font-size: 12px;">This code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</p>
      <p style="color: #888; text-align: center; font-size: 12px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject,
      html
    });
  } catch (err) {
    console.error('sendOTPEmail error:', err.message);
    throw new Error('Failed to send OTP email. Check SMTP settings on Railway.');
  }
}

module.exports = { transporter, sendOTPEmail, verifyEmailConnection, emailConfigured };
