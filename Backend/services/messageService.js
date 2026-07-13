const supabase = require('../config/supabase');
const { sanitizeMessage } = require('../utils/sanitize');
const chatService = require('./chatService');
const contactService = require('./contactService');

async function sendMessage(senderId, chatId, data) {
  const isMember = await chatService.isChatMember(senderId, chatId);
  if (!isMember) throw new Error('Not a member of this chat');

  const partnerId = await chatService.getDirectChatPartner(senderId, chatId);
  if (partnerId && await contactService.isBlocked(senderId, partnerId)) {
    throw new Error('Cannot send messages to this user');
  }

  const messageData = {
    chat_id: chatId,
    sender_id: senderId,
    content: sanitizeMessage(data.content || ''),
    type: data.type || 'text',
    media_url: data.media_url || null,
    media_name: data.media_name || null,
    media_size: data.media_size || null,
    media_mime: data.media_mime || null,
    reply_to_id: data.reply_to_id || null,
    forwarded_from_id: data.forwarded_from_id || null
  };

  const { data: message, error } = await supabase
    .from('messages')
    .insert(messageData)
    .select('*')
    .single();

  if (error) {
    console.error('sendMessage error:', error.message);
    throw new Error('Failed to send message');
  }

  const { data: sender } = await supabase
    .from('users')
    .select('id, name, avatar_url, user_number, name_skipped')
    .eq('id', senderId)
    .single();

  await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', chatId);

  return { ...message, sender: sender || null };
}

async function getMessages(userId, chatId, { limit = 50, before = null } = {}) {
  const isMember = await chatService.isChatMember(userId, chatId);
  if (!isMember) throw new Error('Not a member of this chat');

  let query = supabase
    .from('messages')
    .select('*, sender:users(id, name, avatar_url, user_number, name_skipped)')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) {
    console.error('getMessages error:', error.message);
    throw new Error('Failed to fetch messages');
  }

  const { data: deletions } = await supabase
    .from('message_deletions')
    .select('message_id')
    .eq('user_id', userId);

  const deletedIds = new Set((deletions || []).map(d => d.message_id));

  const filtered = (data || []).filter(m => {
    if (deletedIds.has(m.id)) return false;
    if (m.is_deleted_for_all) return m.sender_id === userId;
    return true;
  });

  return filtered.reverse();
}

async function editMessage(userId, messageId, content) {
  const { data: msg } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('sender_id', userId)
    .single();

  if (!msg) throw new Error('Message not found or unauthorized');

  const { data, error } = await supabase
    .from('messages')
    .update({
      content: sanitizeMessage(content),
      is_edited: true,
      edited_at: new Date().toISOString()
    })
    .eq('id', messageId)
    .select('*, sender:users(id, name, avatar_url)')
    .single();

  if (error) throw new Error('Failed to edit message');
  return data;
}

async function deleteForMe(userId, messageId) {
  const { error } = await supabase
    .from('message_deletions')
    .insert({ message_id: messageId, user_id: userId });

  if (error && error.code !== '23505') throw new Error('Failed to delete message');
  return { message: 'Message deleted for you' };
}

async function deleteForEveryone(userId, messageId) {
  const { data: msg } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .eq('sender_id', userId)
    .single();

  if (!msg) throw new Error('Message not found or unauthorized');

  const timeDiff = Date.now() - new Date(msg.created_at).getTime();
  if (timeDiff > 60 * 60 * 1000) throw new Error('Cannot delete messages older than 1 hour');

  const { data, error } = await supabase
    .from('messages')
    .update({
      is_deleted_for_all: true,
      deleted_at: new Date().toISOString(),
      content: ''
    })
    .eq('id', messageId)
    .select('*')
    .single();

  if (error) throw new Error('Failed to delete message');
  return data;
}

async function addReaction(userId, messageId, emoji) {
  const { data, error } = await supabase
    .from('message_reactions')
    .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id,emoji' })
    .select('*')
    .single();

  if (error) throw new Error('Failed to add reaction');
  return data;
}

async function removeReaction(userId, messageId, emoji) {
  await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);

  return { message: 'Reaction removed' };
}

async function pinMessage(userId, chatId, messageId) {
  const isMember = await chatService.isChatMember(userId, chatId);
  if (!isMember) throw new Error('Not a member');

  const { data, error } = await supabase
    .from('message_pins')
    .upsert({ message_id: messageId, chat_id: chatId, pinned_by: userId }, { onConflict: 'chat_id,message_id' })
    .select('*, message:messages(*, sender:users(name))')
    .single();

  if (error) throw new Error('Failed to pin message');
  return data;
}

async function unpinMessage(chatId, messageId) {
  await supabase.from('message_pins').delete().eq('chat_id', chatId).eq('message_id', messageId);
  return { message: 'Message unpinned' };
}

async function starMessage(userId, messageId) {
  const { data, error } = await supabase
    .from('message_stars')
    .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' })
    .select('*')
    .single();

  if (error) throw new Error('Failed to star message');
  return data;
}

async function unstarMessage(userId, messageId) {
  await supabase.from('message_stars').delete().eq('message_id', messageId).eq('user_id', userId);
  return { message: 'Message unstarred' };
}

async function markDelivered(userId, messageId) {
  await supabase
    .from('message_deliveries')
    .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' });
}

async function markRead(userId, messageId) {
  await supabase
    .from('message_reads')
    .upsert({ message_id: messageId, user_id: userId }, { onConflict: 'message_id,user_id' });
  await markDelivered(userId, messageId);
}

async function markChatRead(userId, chatId) {
  const { data: messages } = await supabase
    .from('messages')
    .select('id')
    .eq('chat_id', chatId)
    .neq('sender_id', userId);

  for (const msg of messages || []) {
    await markRead(userId, msg.id);
  }
}

async function searchMessages(userId, query, chatId = null) {
  let q = supabase
    .from('messages')
    .select('*, sender:users(name, avatar_url), chat:chats(id, type)')
    .ilike('content', `%${query}%`)
    .eq('is_deleted_for_all', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (chatId) q = q.eq('chat_id', chatId);

  const { data, error } = await q;
  if (error) throw new Error('Search failed');

  const results = [];
  for (const msg of data || []) {
    if (await chatService.isChatMember(userId, msg.chat_id)) {
      results.push(msg);
    }
  }
  return results;
}

async function clearChatForMe(userId, chatId) {
  const isMember = await chatService.isChatMember(userId, chatId);
  if (!isMember) throw new Error('Not a member of this chat');

  const { data: messages, error: fetchError } = await supabase
    .from('messages')
    .select('id')
    .eq('chat_id', chatId);

  if (fetchError) throw new Error('Failed to clear chat');
  if (!messages?.length) return { message: 'Chat cleared', count: 0 };

  const rows = messages.map(m => ({ message_id: m.id, user_id: userId }));
  const { error } = await supabase
    .from('message_deletions')
    .upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true });

  if (error) throw new Error('Failed to clear chat');
  return { message: 'Chat cleared', count: messages.length };
}

async function forwardMessage(userId, messageId, targetChatId) {
  const { data: original } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (!original) throw new Error('Message not found');

  return sendMessage(userId, targetChatId, {
    content: original.content,
    type: original.type,
    media_url: original.media_url,
    media_name: original.media_name,
    media_size: original.media_size,
    media_mime: original.media_mime,
    forwarded_from_id: messageId
  });
}

module.exports = {
  sendMessage,
  getMessages,
  editMessage,
  deleteForMe,
  deleteForEveryone,
  clearChatForMe,
  addReaction,
  removeReaction,
  pinMessage,
  unpinMessage,
  starMessage,
  unstarMessage,
  markDelivered,
  markRead,
  markChatRead,
  searchMessages,
  forwardMessage
};
