const nodemailer = require('nodemailer');

function cleanEnv(value) {
  if (!value) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

const resendApiKey = cleanEnv(process.env.RESEND_API_KEY);
const emailPort = parseInt(cleanEnv(process.env.EMAIL_PORT), 10) || 587;
const emailUser = cleanEnv(process.env.EMAIL_USER);
const emailPass = cleanEnv(process.env.EMAIL_PASS).replace(/\s/g, '');
const emailHost = cleanEnv(process.env.EMAIL_HOST) || 'smtp.gmail.com';
const emailFrom = cleanEnv(process.env.EMAIL_FROM)
  || (emailUser ? `HexaChat <${emailUser}>` : 'HexaChat <onboarding@resend.dev>');

const resendConfigured = !!resendApiKey;
const smtpConfigured = !resendConfigured && !!(emailHost && emailUser && emailPass);
const emailConfigured = resendConfigured || smtpConfigured;

function buildSmtpTransporter() {
  if (!smtpConfigured) return null;

  if (emailHost.includes('gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailUser, pass: emailPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    });
  }

  return nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    auth: { user: emailUser, pass: emailPass },
    requireTLS: emailPort === 587,
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
}

const transporter = buildSmtpTransporter();

function mapEmailError(err) {
  const msg = (err?.message || '').toLowerCase();
  const code = err?.code || '';

  if (msg.includes('timeout') || code === 'ETIMEDOUT' || code === 'ECONNECTION') {
    return 'Railway blocks Gmail SMTP. Add RESEND_API_KEY in Railway Variables (free at resend.com).';
  }
  if (code === 'EAUTH' || msg.includes('authentication')) {
    return 'Gmail login failed. Use 16-char App Password in EMAIL_PASS.';
  }
  if (msg.includes('resend')) {
    return err.message;
  }
  return err?.message || 'Failed to send OTP email';
}

async function sendViaResend(email, subject, html) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject,
        html
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.message || data?.error || `HTTP ${res.status}`;
      throw new Error(`Resend: ${detail}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaSmtp(email, subject, html) {
  if (!transporter) {
    throw new Error('SMTP not configured. Add RESEND_API_KEY on Railway (recommended).');
  }
  await transporter.sendMail({ from: emailFrom, to: email, subject, html });
}

async function verifyEmailConnection() {
  if (resendConfigured) {
    console.log('Email OTP via Resend API ready');
    return true;
  }

  if (!transporter) {
    console.warn('Email OTP OFF — add RESEND_API_KEY on Railway (resend.com, free)');
    return false;
  }

  console.warn('SMTP configured but Gmail is blocked on Railway. Add RESEND_API_KEY for OTP.');
  return false;
}

async function getEmailStatus() {
  return {
    configured: emailConfigured,
    provider: resendConfigured ? 'resend' : smtpConfigured ? 'smtp' : 'none',
    ready: resendConfigured,
    from: emailFrom,
    recommendation: resendConfigured
      ? null
      : 'Add RESEND_API_KEY + EMAIL_FROM on Railway. Gmail SMTP does not work on Railway.'
  };
}

async function sendOTPEmail(email, code, type) {
  if (!emailConfigured) {
    throw new Error('Email not configured. Add RESEND_API_KEY on Railway Variables.');
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
      <p style="color: #888; text-align: center; font-size: 12px;">Expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.</p>
    </div>
  `;

  try {
    if (resendConfigured) {
      await sendViaResend(email, subject, html);
    } else {
      await sendViaSmtp(email, subject, html);
    }
  } catch (err) {
    console.error('sendOTPEmail error:', err.message);
    throw new Error(mapEmailError(err));
  }
}

module.exports = {
  transporter,
  sendOTPEmail,
  verifyEmailConnection,
  getEmailStatus,
  emailConfigured
};
