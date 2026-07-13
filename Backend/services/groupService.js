const supabase = require('../config/supabase');
const { sanitizeInput } = require('../utils/sanitize');
const chatService = require('./chatService');

async function createGroup(creatorId, { name, description, memberIds, avatar_url }) {
  const cleanName = sanitizeInput(name);
  const cleanDesc = sanitizeInput(description || '');

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({ type: 'group' })
    .select('id')
    .single();

  if (chatError) throw new Error('Failed to create group chat');

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      chat_id: chat.id,
      name: cleanName,
      description: cleanDesc,
      avatar_url: avatar_url || null,
      created_by: creatorId
    })
    .select('*')
    .single();

  if (groupError) throw new Error('Failed to create group');

  const members = [{ chat_id: chat.id, user_id: creatorId, role: 'owner' }];
  const uniqueMembers = [...new Set(memberIds || [])].filter(id => id !== creatorId);

  for (const memberId of uniqueMembers) {
    members.push({ chat_id: chat.id, user_id: memberId, role: 'member' });
  }

  await supabase.from('chat_members').insert(members);

  return { ...group, chat_id: chat.id };
}

async function updateGroup(userId, chatId, updates) {
  const { data: member } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .in('role', ['admin', 'owner'])
    .maybeSingle();

  if (!member) throw new Error('Only admins can update group');

  const allowed = {};
  if (updates.name) allowed.name = sanitizeInput(updates.name);
  if (updates.description !== undefined) allowed.description = sanitizeInput(updates.description);
  if (updates.avatar_url) allowed.avatar_url = updates.avatar_url;

  const { data, error } = await supabase
    .from('groups')
    .update(allowed)
    .eq('chat_id', chatId)
    .select('*')
    .single();

  if (error) throw new Error('Failed to update group');
  return data;
}

async function addMembers(adminId, chatId, memberIds) {
  const { data: admin } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', adminId)
    .in('role', ['admin', 'owner'])
    .maybeSingle();

  if (!admin) throw new Error('Only admins can add members');

  const inserts = memberIds.map(id => ({ chat_id: chatId, user_id: id, role: 'member' }));
  const { data, error } = await supabase
    .from('chat_members')
    .upsert(inserts, { onConflict: 'chat_id,user_id', ignoreDuplicates: true })
    .select('*, user:users(id, name, avatar_url)');

  if (error) throw new Error('Failed to add members');
  return data;
}

async function removeMember(adminId, chatId, memberId) {
  const { data: admin } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', adminId)
    .in('role', ['admin', 'owner'])
    .maybeSingle();

  if (!admin) throw new Error('Only admins can remove members');

  const { data: target } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', memberId)
    .single();

  if (target?.role === 'owner') throw new Error('Cannot remove group owner');

  await supabase
    .from('chat_members')
    .update({ left_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', memberId);

  return { message: 'Member removed' };
}

async function promoteAdmin(ownerId, chatId, memberId) {
  const { data: owner } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', ownerId)
    .eq('role', 'owner')
    .maybeSingle();

  if (!owner) throw new Error('Only owner can promote admins');

  const { data, error } = await supabase
    .from('chat_members')
    .update({ role: 'admin' })
    .eq('chat_id', chatId)
    .eq('user_id', memberId)
    .select('*')
    .single();

  if (error) throw new Error('Failed to promote member');
  return data;
}

async function leaveGroup(userId, chatId) {
  const { data: member } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .single();

  if (!member) throw new Error('Not a member');

  if (member.role === 'owner') {
    const { data: admins } = await supabase
      .from('chat_members')
      .select('user_id')
      .eq('chat_id', chatId)
      .eq('role', 'admin')
      .is('left_at', null)
      .limit(1);

    if (admins && admins.length > 0) {
      await supabase
        .from('chat_members')
        .update({ role: 'owner' })
        .eq('chat_id', chatId)
        .eq('user_id', admins[0].user_id);
    }
  }

  await supabase
    .from('chat_members')
    .update({ left_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .eq('user_id', userId);

  return { message: 'Left group' };
}

async function deleteGroup(userId, chatId) {
  const { data: member } = await supabase
    .from('chat_members')
    .select('role')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('role', 'owner')
    .maybeSingle();

  if (!member) throw new Error('Only owner can delete group');

  await supabase.from('chats').delete().eq('id', chatId);
  return { message: 'Group deleted' };
}

async function toggleGroupNotifications(userId, chatId) {
  const { data: member } = await supabase
    .from('chat_members')
    .select('notifications_enabled')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .single();

  if (!member) throw new Error('Not a member');

  const { data } = await supabase
    .from('chat_members')
    .update({ notifications_enabled: !member.notifications_enabled })
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .select('notifications_enabled')
    .single();

  return data;
}

module.exports = {
  createGroup,
  updateGroup,
  addMembers,
  removeMember,
  promoteAdmin,
  leaveGroup,
  deleteGroup,
  toggleGroupNotifications
};
