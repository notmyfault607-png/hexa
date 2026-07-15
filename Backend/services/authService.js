const supabase = require('../config/supabase');
const { hashPassword, comparePassword } = require('../utils/hash');
const { generateToken } = require('../utils/jwt');
const { generateOTP, getOTPExpiry, sanitizeInput } = require('../utils/sanitize');
const { sendOTPEmail } = require('../config/email');

async function generateUserNumber() {
  for (let i = 0; i < 20; i++) {
    const num = String(Math.floor(100000 + Math.random() * 900000));
    const { data } = await supabase.from('users').select('id').eq('user_number', num).maybeSingle();
    if (!data) return num;
  }
  return String(Date.now()).slice(-8);
}

function getDisplayName(user) {
  if (user && !user.name_skipped && user.name && user.name.trim()) {
    return user.name.trim();
  }
  if (user?.user_number) return `User ${user.user_number}`;
  if (user?.name && user.name.trim()) return user.name.trim();
  return 'User';
}

function getPublicPhone(user) {
  if (!user?.phone) return null;
  if (user.phone.startsWith('u')) return null;
  return user.phone;
}

async function checkEmailAvailable(email) {
  const cleanEmail = sanitizeInput(email).toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Invalid email address');
  }

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();

  return { available: !existingUser, message: existingUser ? 'Email already registered' : 'Email available' };
}

// Direct signup — NO OTP. Creates account immediately and returns token.
async function signup(email, password, phone, name = null, skipName = false) {
  const cleanEmail = sanitizeInput(email).toLowerCase();
  const cleanPhone = sanitizeInput(phone);
  const cleanName = skipName || !name ? '' : sanitizeInput(name).trim();
  const nameSkipped = skipName || !cleanName;

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('Please enter a valid email address');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Please enter a valid phone number');
  }

  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .or(`email.eq.${cleanEmail},phone.eq.${cleanPhone}`)
    .maybeSingle();

  if (existingUser) {
    throw new Error('Email or phone number already registered');
  }

  const passwordHash = await hashPassword(password);
  const userNumber = await generateUserNumber();
  const finalName = nameSkipped ? `User ${userNumber}` : cleanName;

  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      name: finalName,
      email: cleanEmail,
      phone: cleanPhone,
      password_hash: passwordHash,
      user_number: userNumber,
      name_skipped: nameSkipped,
      is_online: true,
      last_seen: new Date().toISOString()
    })
    .select('id, name, email, phone, user_number, name_skipped, avatar_url, bio, about, is_online, last_seen')
    .single();

  if (userError) {
    console.error('signup insert error:', userError.message);
    if (userError.code === '23505') throw new Error('Email or phone number already registered');
    throw new Error('Failed to create account');
  }

  await supabase.from('user_settings').insert({ user_id: user.id }).then(() => {}, () => {});
  await supabase.from('pending_signups').delete().eq('email', cleanEmail).then(() => {}, () => {});

  const token = generateToken({ userId: user.id });

  return {
    message: 'Account created successfully',
    user: { ...user, display_name: getDisplayName(user) },
    token,
    userNumber: nameSkipped ? userNumber : null,
    phone: cleanPhone
  };
}

async function verifySignupOTP(email, code) {
  const cleanEmail = sanitizeInput(email).toLowerCase();

  const { data: otpRecord } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', cleanEmail)
    .eq('code', code)
    .eq('type', 'signup')
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRecord) throw new Error('Invalid or expired OTP');

  const { data: pending } = await supabase
    .from('pending_signups')
    .select('*')
    .eq('email', cleanEmail)
    .single();

  if (!pending) throw new Error('Signup session expired, please sign up again');

  const finalName = pending.name_skipped || !pending.name?.trim()
    ? `User ${pending.user_number}`
    : pending.name.trim();

  const { data: user, error: userError } = await supabase
    .from('users')
    .insert({
      name: finalName,
      email: pending.email,
      phone: pending.phone,
      password_hash: pending.password_hash,
      user_number: pending.user_number,
      name_skipped: pending.name_skipped || false
    })
    .select('id, name, email, phone, user_number, name_skipped, avatar_url, bio, about, is_online, last_seen')
    .single();

  if (userError) throw new Error('Failed to create account');

  await supabase.from('user_settings').insert({ user_id: user.id });
  await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);
  await supabase.from('pending_signups').delete().eq('email', cleanEmail);

  const token = generateToken({ userId: user.id });

  return { user: { ...user, display_name: getDisplayName(user) }, token };
}

async function resendOTP(email, type) {
  const cleanEmail = sanitizeInput(email).toLowerCase();

  if (type === 'signup') {
    const { data: pending } = await supabase
      .from('pending_signups')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();
    if (!pending) throw new Error('No pending signup found');
  } else {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .maybeSingle();
    if (!user) throw new Error('No account found with this email');
  }

  const otp = generateOTP();
  const expiresAt = getOTPExpiry();

  await supabase.from('otp_codes').delete().eq('email', cleanEmail).eq('type', type);

  await supabase.from('otp_codes').insert({
    email: cleanEmail,
    code: otp,
    type,
    expires_at: expiresAt.toISOString()
  });

  await sendOTPEmail(cleanEmail, otp, type);

  return { message: 'OTP resent successfully' };
}

async function login(email, password) {
  const cleanEmail = sanitizeInput(email).toLowerCase();

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', cleanEmail)
    .single();

  if (error || !user) throw new Error('Invalid email or password');

  const valid = await comparePassword(password, user.password_hash);
  if (!valid) throw new Error('Invalid email or password');

  await supabase.from('users').update({ is_online: true, last_seen: new Date().toISOString() }).eq('id', user.id);

  const token = generateToken({ userId: user.id });
  const { password_hash, ...safeUser } = user;

  return { user: { ...safeUser, display_name: getDisplayName(safeUser) }, token };
}

async function forgotPassword(email) {
  const cleanEmail = sanitizeInput(email).toLowerCase();

  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (!user) throw new Error('No account found with this email');

  const otp = generateOTP();
  const expiresAt = getOTPExpiry();

  await supabase.from('otp_codes').delete().eq('email', cleanEmail).eq('type', 'reset');

  await supabase.from('otp_codes').insert({
    email: cleanEmail,
    code: otp,
    type: 'reset',
    expires_at: expiresAt.toISOString()
  });

  await sendOTPEmail(cleanEmail, otp, 'reset');

  return { message: 'OTP sent to your email' };
}

async function verifyResetOTP(email, code) {
  const cleanEmail = sanitizeInput(email).toLowerCase();

  const { data: otpRecord } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', cleanEmail)
    .eq('code', code)
    .eq('type', 'reset')
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRecord) throw new Error('Invalid or expired OTP');

  return { message: 'OTP verified', resetToken: otpRecord.id };
}

async function resetPassword(email, code, newPassword) {
  const cleanEmail = sanitizeInput(email).toLowerCase();

  const { data: otpRecord } = await supabase
    .from('otp_codes')
    .select('*')
    .eq('email', cleanEmail)
    .eq('code', code)
    .eq('type', 'reset')
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRecord) throw new Error('Invalid or expired OTP');

  const passwordHash = await hashPassword(newPassword);

  const { error } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('email', cleanEmail);

  if (error) throw new Error('Failed to reset password');

  await supabase.from('otp_codes').update({ used: true }).eq('id', otpRecord.id);

  return { message: 'Password reset successfully' };
}

module.exports = {
  signup,
  verifySignupOTP,
  resendOTP,
  login,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  getDisplayName,
  getPublicPhone,
  checkEmailAvailable
};
