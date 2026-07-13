const supabase = require('../config/supabase');
const { sanitizeMessage } = require('../utils/sanitize');
const contactService = require('./contactService');

async function getOrCreateDirectChat(userId, otherUserId) {
  if (await contactService.isBlocked(userId, otherUserId)) {
    throw new Error('Cannot chat with blocked user');
  }

  const { data: userChats } = await supabase
    .from('chat_members')
    .select('chat_id')
    .eq('user_id', userId);

  const chatIds = (userChats || []).map(c => c.chat_id);

  if (chatIds.length > 0) {
    const { data: shared } = await supabase
      .from('chat_members')
      .select('chat_id, chats!inner(type)')
      .eq('user_id', otherUserId)
      .in('chat_id', chatIds)
      .eq('chats.type', 'direct');

    if (shared && shared.length > 0) {
      return shared[0].chat_id;
    }
  }

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .insert({ type: 'direct' })
    .select('id')
    .single();

  if (chatError) throw new Error('Failed to create chat');

  await supabase.from('chat_members').insert([
    { chat_id: chat.id, user_id: userId },
    { chat_id: chat.id, user_id: otherUserId }
  ]);

  return chat.id;
}

async function getUserChats(userId) {
  const { data: memberships, error } = await supabase
    .from('chat_members')
    .select('chat_id, role, notifications_enabled, chats(id, type, updated_at)')
    .eq('user_id', userId)
    .is('left_at', null);

  if (error) throw new Error('Failed to fetch chats');

  const chats = [];
  for (const m of memberships || []) {
    const chat = m.chats;
    if (!chat) continue;

    let chatInfo = { ...chat, role: m.role, notifications_enabled: m.notifications_enabled };

    if (chat.type === 'direct') {
      const { data: members } = await supabase
        .from('chat_members')
        .select('user:users(id, name, phone, avatar_url, is_online, last_seen)')
        .eq('chat_id', chat.id)
        .neq('user_id', userId);

      chatInfo.participant = members?.[0]?.user || null;
      chatInfo.name = members?.[0]?.user?.name || 'Unknown';
      chatInfo.avatar_url = members?.[0]?.user?.avatar_url;
    } else {
      const { data: group } = await supabase
        .from('groups')
        .select('name, description, avatar_url')
        .eq('chat_id', chat.id)
        .single();

      chatInfo = { ...chatInfo, ...group };
    }

    const { data: lastMsg } = await supabase
      .from('messages')
      .select('id, content, type, sender_id, created_at, is_deleted_for_all')
      .eq('chat_id', chat.id)
      .eq('is_deleted_for_all', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    chatInfo.last_message = lastMsg;

    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chat.id)
      .neq('sender_id', userId)
      .not('id', 'in', `(SELECT message_id FROM message_reads WHERE user_id = '${userId}')`);

    chatInfo.unread_count = count || 0;

    chats.push(chatInfo);
  }

  chats.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return chats;
}

async function getChatMembers(chatId) {
  const { data, error } = await supabase
    .from('chat_members')
    .select('id, role, user:users(id, name, phone, avatar_url, is_online, last_seen)')
    .eq('chat_id', chatId)
    .is('left_at', null);

  if (error) throw new Error('Failed to fetch members');
  return data || [];
}

async function isChatMember(userId, chatId) {
  const { data } = await supabase
    .from('chat_members')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();

  return !!data;
}

async function getDirectChatPartner(userId, chatId) {
  const { data: chat } = await supabase
    .from('chats')
    .select('type')
    .eq('id', chatId)
    .maybeSingle();

  if (!chat || chat.type !== 'direct') return null;

  const { data: member } = await supabase
    .from('chat_members')
    .select('user_id')
    .eq('chat_id', chatId)
    .neq('user_id', userId)
    .is('left_at', null)
    .maybeSingle();

  return member?.user_id || null;
}

module.exports = {
  getOrCreateDirectChat,
  getUserChats,
  getChatMembers,
  isChatMember,
  getDirectChatPartner
};
