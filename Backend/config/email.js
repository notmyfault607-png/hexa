function cleanEnv(value) {
  if (value == null) return '';
  return String(value).trim().replace(/^["']|["']$/g, '');
}

const RESEND_API_KEY = cleanEnv(process.env.RESEND_API_KEY);
const EMAIL_FROM = cleanEnv(process.env.EMAIL_FROM) || 'HexaChat <onboarding@resend.dev>';
const OTP_MINUTES = cleanEnv(process.env.OTP_EXPIRY_MINUTES) || '10';

const emailConfigured = !!RESEND_API_KEY;

async function sendViaResend(to, subject, html) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html
      }),
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.message || data.error || `HTTP ${res.status}`;
      throw new Error(`Resend API failed: ${detail}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function otpHtml(code) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:30px;background:#000;color:#fff;border-radius:12px;">
      <h1 style="text-align:center;color:#fff;">HexaChat</h1>
      <p style="text-align:center;color:#ccc;">Your verification code is:</p>
      <div style="background:#111;border:2px solid #fff;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
        <span style="font-size:32px;font-weight:bold;letter-spacing:8px;">${code}</span>
      </div>
      <p style="text-align:center;color:#888;font-size:12px;">Expires in ${OTP_MINUTES} minutes.</p>
    </div>
  `;
}

async function verifyEmailConnection() {
  if (!emailConfigured) {
    console.warn('Email OTP OFF — set RESEND_API_KEY in Railway Variables');
    return false;
  }
  console.log('Email OTP ready (Resend API)');
  console.log(`EMAIL_FROM=${EMAIL_FROM}`);
  return true;
}

async function getEmailStatus() {
  return {
    configured: emailConfigured,
    provider: emailConfigured ? 'resend' : 'none',
    ready: emailConfigured,
    from: EMAIL_FROM,
    recommendation: emailConfigured
      ? null
      : 'Add RESEND_API_KEY and EMAIL_FROM in Railway Variables'
  };
}

async function sendOTPEmail(email, code, type) {
  if (!emailConfigured) {
    throw new Error('Email not configured. Add RESEND_API_KEY on Railway Variables.');
  }

  const subject = type === 'signup'
    ? 'HexaChat - Verify Your Email'
    : 'HexaChat - Reset Your Password';

  try {
    await sendViaResend(email, subject, otpHtml(code));
  } catch (err) {
    console.error('sendOTPEmail error:', err.message);
    if (err.name === 'AbortError') {
      throw new Error('Email timeout. Check Resend API key and network.');
    }
    throw new Error(err.message || 'Failed to send OTP email');
  }
}

module.exports = {
  sendOTPEmail,
  verifyEmailConnection,
  getEmailStatus,
  emailConfigured
};
