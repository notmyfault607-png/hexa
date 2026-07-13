const supabase = require('../config/supabase');
const { sanitizeInput } = require('../utils/sanitize');

async function createStatus(userId, { type, content, media_url, background_color }) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('statuses')
    .insert({
      user_id: userId,
      type,
      content: sanitizeInput(content || ''),
      media_url: media_url || null,
      background_color: background_color || '#000000',
      expires_at: expiresAt.toISOString()
    })
    .select('*')
    .single();

  if (error) {
    console.error('createStatus error:', error.message);
    throw new Error(error.message || 'Failed to create status');
  }

  const { data: user } = await supabase
    .from('users')
    .select('id, name, avatar_url, user_number, name_skipped')
    .eq('id', userId)
    .single();

  return { ...data, user: user || null };
}

async function getContactStatuses(userId) {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('contact_user_id')
    .eq('user_id', userId);

  const contactIds = (contacts || []).map(c => c.contact_user_id);
  contactIds.push(userId);

  const { data, error } = await supabase
    .from('statuses')
    .select('*')
    .in('user_id', contactIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getContactStatuses error:', error.message);
    throw new Error('Failed to fetch statuses');
  }

  const userIds = [...new Set((data || []).map(s => s.user_id))];
  let usersMap = {};
  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar_url, user_number, name_skipped')
      .in('id', userIds);
    for (const u of users || []) usersMap[u.id] = u;
  }

  const statusIds = (data || []).map(s => s.id);
  let viewsMap = {};
  let reactionsMap = {};

  if (statusIds.length) {
    const { data: views } = await supabase
      .from('status_views')
      .select('status_id, viewer_id, viewed_at')
      .in('status_id', statusIds);
    for (const v of views || []) {
      if (!viewsMap[v.status_id]) viewsMap[v.status_id] = [];
      viewsMap[v.status_id].push(v);
    }

    const { data: reactions } = await supabase
      .from('status_reactions')
      .select('status_id, emoji, user_id')
      .in('status_id', statusIds);
    for (const r of reactions || []) {
      if (!reactionsMap[r.status_id]) reactionsMap[r.status_id] = [];
      reactionsMap[r.status_id].push(r);
    }
  }

  const grouped = {};
  for (const status of data || []) {
    status.user = usersMap[status.user_id] || null;
    status.views = viewsMap[status.id] || [];
    status.reactions = reactionsMap[status.id] || [];
    if (!grouped[status.user_id]) {
      grouped[status.user_id] = {
        user: status.user,
        statuses: [],
        has_unseen: false
      };
    }
    const viewed = (status.views || []).some(v => v.viewer_id === userId);
    if (!viewed && status.user_id !== userId) {
      grouped[status.user_id].has_unseen = true;
    }
    grouped[status.user_id].statuses.push(status);
  }

  return Object.values(grouped);
}

async function viewStatus(userId, statusId) {
  await supabase
    .from('status_views')
    .upsert({ status_id: statusId, viewer_id: userId }, { onConflict: 'status_id,viewer_id' });

  const { data: views, error } = await supabase
    .from('status_views')
    .select('viewer_id, viewed_at')
    .eq('status_id', statusId);

  if (error) {
    console.error('viewStatus error:', error.message);
    return [];
  }

  const viewerIds = [...new Set((views || []).map(v => v.viewer_id))];
  let viewersMap = {};
  if (viewerIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, avatar_url, user_number, name_skipped')
      .in('id', viewerIds);
    for (const u of users || []) viewersMap[u.id] = u;
  }

  return (views || []).map(v => ({
    ...v,
    viewer: viewersMap[v.viewer_id] || null
  }));
}

async function deleteStatus(userId, statusId) {
  const { error } = await supabase
    .from('statuses')
    .delete()
    .eq('id', statusId)
    .eq('user_id', userId);

  if (error) throw new Error('Failed to delete status');
  return { message: 'Status deleted' };
}

async function reactToStatus(userId, statusId, emoji) {
  const { data, error } = await supabase
    .from('status_reactions')
    .upsert({ status_id: statusId, user_id: userId, emoji }, { onConflict: 'status_id,user_id' })
    .select('*')
    .single();

  if (error) throw new Error('Failed to react');
  return data;
}

async function cleanupExpired() {
  await supabase.from('statuses').delete().lt('expires_at', new Date().toISOString());
}

module.exports = {
  createStatus,
  getContactStatuses,
  viewStatus,
  deleteStatus,
  reactToStatus,
  cleanupExpired
};
