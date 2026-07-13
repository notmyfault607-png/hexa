const supabase = require('../config/supabase');

async function createNotification(userId, { type, title, body, data = {} }) {
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, type, title, body, data })
    .select('*')
    .single();

  if (error) throw new Error('Failed to create notification');
  return notification;
}

async function getNotifications(userId, limit = 50) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('Failed to fetch notifications');
  return data || [];
}

async function markRead(userId, notificationId) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);
}

async function markAllRead(userId) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);
}

async function getUnreadCount(userId) {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  return count || 0;
}

module.exports = {
  createNotification,
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount
};
