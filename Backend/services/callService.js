const supabase = require('../config/supabase');
const contactService = require('./contactService');

async function createCall(callerId, receiverId, type, chatId = null) {
  if (await contactService.isBlocked(callerId, receiverId)) {
    throw new Error('Cannot call this user');
  }
  const { data: activeCall } = await supabase
    .from('calls')
    .select('id')
    .or(`caller_id.eq.${receiverId},receiver_id.eq.${receiverId}`)
    .in('status', ['ringing', 'accepted'])
    .maybeSingle();

  if (activeCall) {
    const { data: busyCall } = await supabase
      .from('calls')
      .insert({
        caller_id: callerId,
        receiver_id: receiverId,
        chat_id: chatId,
        type,
        status: 'busy'
      })
      .select('*')
      .single();

    return busyCall;
  }

  const { data, error } = await supabase
    .from('calls')
    .insert({
      caller_id: callerId,
      receiver_id: receiverId,
      chat_id: chatId,
      type,
      status: 'ringing'
    })
    .select('*')
    .single();

  if (error) throw new Error('Failed to create call');

  const userIds = [callerId, receiverId];
  const { data: users } = await supabase
    .from('users')
    .select('id, name, avatar_url, user_number, name_skipped')
    .in('id', userIds);

  const usersMap = {};
  for (const u of users || []) usersMap[u.id] = u;

  return {
    ...data,
    caller: usersMap[callerId] || null,
    receiver: usersMap[receiverId] || null
  };
}

async function updateCallStatus(callId, status) {
  const updates = { status };
  if (status === 'accepted') updates.answered_at = new Date().toISOString();
  if (['ended', 'rejected', 'missed', 'failed', 'busy'].includes(status)) {
    updates.ended_at = new Date().toISOString();
  }

  const { data: call } = await supabase.from('calls').select('*').eq('id', callId).single();

  if (call && updates.ended_at && call.answered_at) {
    updates.duration = Math.floor((new Date(updates.ended_at) - new Date(call.answered_at)) / 1000);
  }

  const { data, error } = await supabase
    .from('calls')
    .update(updates)
    .eq('id', callId)
    .select('*')
    .single();

  if (error) throw new Error('Failed to update call');
  return data;
}

async function getCallHistory(userId, limit = 50) {
  const { data, error } = await supabase
    .from('calls')
    .select('*')
    .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('Failed to fetch call history');

  const userIds = new Set();
  for (const call of data || []) {
    userIds.add(call.caller_id);
    userIds.add(call.receiver_id);
  }

  let usersMap = {};
  if (userIds.size) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar_url, user_number, name_skipped')
      .in('id', [...userIds]);
    for (const u of users || []) usersMap[u.id] = u;
  }

  return (data || []).map(call => ({
    ...call,
    caller: usersMap[call.caller_id] || null,
    receiver: usersMap[call.receiver_id] || null
  }));
}

async function getCall(callId) {
  const { data, error } = await supabase
    .from('calls')
    .select('*, caller:users!calls_caller_id_fkey(id, name, avatar_url), receiver:users!calls_receiver_id_fkey(id, name, avatar_url)')
    .eq('id', callId)
    .single();

  if (error) throw new Error('Call not found');
  return data;
}

module.exports = {
  createCall,
  updateCallStatus,
  getCallHistory,
  getCall
};
