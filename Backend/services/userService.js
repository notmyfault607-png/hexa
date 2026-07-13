const supabase = require('../config/supabase');
const { sanitizeInput } = require('../utils/sanitize');

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, user_number, name_skipped, avatar_url, bio, about, is_online, last_seen, created_at')
    .eq('id', userId)
    .single();

  if (error) throw new Error('User not found');
  return data;
}

async function getPublicProfile(userId, requesterId) {
  const { getDisplayName } = require('./authService');

  const { data, error } = await supabase
    .from('users')
    .select('id, name, phone, user_number, name_skipped, avatar_url, bio, about, is_online, last_seen')
    .eq('id', userId)
    .single();

  if (error) throw new Error('User not found');

  const isSelf = userId === requesterId;
  if (isSelf) {
    const full = await getProfile(userId);
    return { ...full, display_name: getDisplayName(full) };
  }

  const publicPhone = data.phone?.startsWith('u') ? null : data.phone;

  return {
    ...data,
    phone: publicPhone,
    display_name: getDisplayName(data)
  };
}

async function updateProfile(userId, updates) {
  const allowed = {};
  if (updates.name) allowed.name = sanitizeInput(updates.name);
  if (updates.bio !== undefined) allowed.bio = sanitizeInput(updates.bio);
  if (updates.about !== undefined) allowed.about = sanitizeInput(updates.about);
  if (updates.phone) allowed.phone = sanitizeInput(updates.phone);
  if (updates.avatar_url) allowed.avatar_url = updates.avatar_url;

  const { data, error } = await supabase
    .from('users')
    .update(allowed)
    .eq('id', userId)
    .select('id, name, email, phone, avatar_url, bio, about, is_online, last_seen')
    .single();

  if (error) throw new Error('Failed to update profile');
  return data;
}

async function searchUsers(query, currentUserId) {
  const cleanQuery = sanitizeInput(query);
  if (!cleanQuery || cleanQuery.length < 1) return [];

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, phone, user_number, name_skipped, avatar_url, bio, is_online, last_seen')
    .neq('id', currentUserId)
    .or(`name.ilike.%${cleanQuery}%,user_number.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%`)
    .limit(20);

  if (error) throw new Error('Search failed');
  return data || [];
}

async function findByPhone(phone, currentUserId) {
  const cleanPhone = sanitizeInput(phone).replace(/[\s\-()]/g, '');
  if (!cleanPhone || cleanPhone.length < 10) return null;

  const variants = new Set([cleanPhone]);
  if (cleanPhone.startsWith('+')) {
    variants.add(cleanPhone.slice(1));
  } else {
    variants.add(`+${cleanPhone}`);
  }

  for (const variant of variants) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, phone, user_number, name_skipped, avatar_url, bio, is_online, last_seen')
      .eq('phone', variant)
      .neq('id', currentUserId)
      .maybeSingle();

    if (error) continue;
    if (data) return data;
  }

  return null;
}

async function setOnlineStatus(userId, isOnline) {
  await supabase
    .from('users')
    .update({ is_online: isOnline, last_seen: new Date().toISOString() })
    .eq('id', userId);
}

module.exports = {
  getProfile,
  getPublicProfile,
  updateProfile,
  searchUsers,
  findByPhone,
  setOnlineStatus
};
