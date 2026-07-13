const supabase = require('../config/supabase');

async function getSettings(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) {
    const { data: newSettings } = await supabase
      .from('user_settings')
      .insert({ user_id: userId })
      .select('*')
      .single();
    return newSettings;
  }

  return data;
}

async function updateSettings(userId, updates) {
  const allowed = {};
  const fields = [
    'dark_theme', 'show_last_seen', 'show_online_status', 'read_receipts',
    'message_notifications', 'call_notifications', 'group_notifications',
    'status_notifications', 'notification_sound'
  ];

  for (const field of fields) {
    if (updates[field] !== undefined) allowed[field] = updates[field];
  }

  const { data, error } = await supabase
    .from('user_settings')
    .update(allowed)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new Error('Failed to update settings');
  return data;
}

module.exports = { getSettings, updateSettings };
