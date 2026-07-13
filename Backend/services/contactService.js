const supabase = require('../config/supabase');

async function isBlockedByMe(userId, otherUserId) {
  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('user_id', userId)
    .eq('blocked_user_id', otherUserId)
    .maybeSingle();
  return !!data;
}

async function isBlockedByThem(userId, otherUserId) {
  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('user_id', otherUserId)
    .eq('blocked_user_id', userId)
    .maybeSingle();
  return !!data;
}

async function isBlocked(userId, otherUserId) {
  return (await isBlockedByMe(userId, otherUserId)) || (await isBlockedByThem(userId, otherUserId));
}

async function getBlockStatus(userId, otherUserId) {
  const blockedByMe = await isBlockedByMe(userId, otherUserId);
  const blockedByThem = await isBlockedByThem(userId, otherUserId);
  return { blockedByMe, blockedByThem, isBlocked: blockedByMe || blockedByThem };
}

async function addContact(userId, contactUserId) {
  if (userId === contactUserId) throw new Error('Cannot add yourself');

  if (await isBlocked(userId, contactUserId)) throw new Error('Cannot add blocked user');

  const { data: contactUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', contactUserId)
    .maybeSingle();

  if (!contactUser) throw new Error('User not found');

  const { data, error } = await supabase
    .from('contacts')
    .insert({ user_id: userId, contact_user_id: contactUserId })
    .select('id, user_id, is_favorite, created_at, contact_user_id(id, name, phone, user_number, name_skipped, avatar_url, bio, is_online, last_seen)')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Contact already exists');
    throw new Error('Failed to add contact');
  }

  return { ...data, contact: data.contact_user_id };
}

async function getContacts(userId) {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, is_favorite, created_at, contact_user_id(id, name, phone, user_number, name_skipped, avatar_url, bio, is_online, last_seen)')
    .eq('user_id', userId)
    .order('is_favorite', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error('Failed to fetch contacts');
  return (data || []).map(c => ({ ...c, contact: c.contact_user_id }));
}

async function removeContact(userId, contactId) {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId)
    .eq('user_id', userId);

  if (error) throw new Error('Failed to remove contact');
  return { message: 'Contact removed' };
}

async function toggleFavorite(userId, contactId) {
  const { data: contact } = await supabase
    .from('contacts')
    .select('is_favorite')
    .eq('id', contactId)
    .eq('user_id', userId)
    .single();

  if (!contact) throw new Error('Contact not found');

  const { data, error } = await supabase
    .from('contacts')
    .update({ is_favorite: !contact.is_favorite })
    .eq('id', contactId)
    .select('*')
    .single();

  if (error) throw new Error('Failed to update favorite');
  return data;
}

async function blockUser(userId, blockedUserId) {
  if (userId === blockedUserId) throw new Error('Cannot block yourself');

  await supabase.from('contacts').delete()
    .or(`and(user_id.eq.${userId},contact_user_id.eq.${blockedUserId}),and(user_id.eq.${blockedUserId},contact_user_id.eq.${userId})`);

  const { data, error } = await supabase
    .from('blocked_users')
    .insert({ user_id: userId, blocked_user_id: blockedUserId })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('User already blocked');
    throw new Error('Failed to block user');
  }

  return data;
}

async function unblockUser(userId, blockedUserId) {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('user_id', userId)
    .eq('blocked_user_id', blockedUserId);

  if (error) throw new Error('Failed to unblock user');
  return { message: 'User unblocked' };
}

async function getBlockedUsers(userId) {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('id, blocked_user_id, created_at')
    .eq('user_id', userId);

  if (error) throw new Error('Failed to fetch blocked users');

  const userIds = (data || []).map(b => b.blocked_user_id);
  let usersMap = {};
  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, phone, avatar_url, user_number, name_skipped')
      .in('id', userIds);
    for (const u of users || []) usersMap[u.id] = u;
  }

  return (data || []).map(b => ({
    id: b.id,
    created_at: b.created_at,
    blocked: usersMap[b.blocked_user_id] || null
  }));
}

module.exports = {
  isBlocked,
  isBlockedByMe,
  isBlockedByThem,
  getBlockStatus,
  addContact,
  getContacts,
  removeContact,
  toggleFavorite,
  blockUser,
  unblockUser,
  getBlockedUsers
};
