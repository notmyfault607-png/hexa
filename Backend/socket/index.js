const { verifyToken } = require('../utils/jwt');
const messageService = require('../services/messageService');
const userService = require('../services/userService');
const notificationService = require('../services/notificationService');
const callService = require('../services/callService');
const chatService = require('../services/chatService');
const supabase = require('../config/supabase');

const onlineUsers = new Map();

function setupSocketHandlers(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = verifyToken(token);
      socket.userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    onlineUsers.set(userId, socket.id);

    await userService.setOnlineStatus(userId, true);
    socket.broadcast.emit('user:online', { userId });

    const userChats = await chatService.getUserChats(userId);
    for (const chat of userChats) {
      socket.join(`chat:${chat.id}`);
    }

    socket.on('chat:join', (chatId) => {
      socket.join(`chat:${chatId}`);
    });

    socket.on('chat:leave', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    socket.on('message:send', async (data, callback) => {
      try {
        if (!data?.chatId) throw new Error('Chat ID required');

        const message = await messageService.sendMessage(userId, data.chatId, data);
        io.to(`chat:${data.chatId}`).emit('message:new', message);

        try {
          const members = await chatService.getChatMembers(data.chatId);
          for (const member of members) {
            const memberId = member.user?.id;
            if (!memberId || memberId === userId) continue;

            const notif = await notificationService.createNotification(memberId, {
              type: 'message',
              title: message.sender?.name || 'New Message',
              body: message.type === 'text' ? message.content : `Sent a ${message.type}`,
              data: { chatId: data.chatId, messageId: message.id }
            });
            const recipientSocket = onlineUsers.get(memberId);
            if (recipientSocket) {
              io.to(recipientSocket).emit('notification:new', notif);
            }
          }
        } catch (notifErr) {
          console.error('Notification error:', notifErr.message);
        }

        if (callback) callback({ success: true, message });
      } catch (err) {
        console.error('Message send error:', err.message);
        if (callback) callback({ success: false, message: err.message });
      }
    });

    socket.on('message:edit', async (data) => {
      try {
        const message = await messageService.editMessage(userId, data.messageId, data.content);
        io.to(`chat:${data.chatId}`).emit('message:edited', message);
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('message:delete', async (data) => {
      try {
        if (data.forEveryone) {
          const message = await messageService.deleteForEveryone(userId, data.messageId);
          io.to(`chat:${data.chatId}`).emit('message:deleted', { messageId: data.messageId, forEveryone: true, message });
        } else {
          await messageService.deleteForMe(userId, data.messageId);
          socket.emit('message:deleted', { messageId: data.messageId, forEveryone: false });
        }
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('message:react', async (data) => {
      try {
        const reaction = await messageService.addReaction(userId, data.messageId, data.emoji);
        io.to(`chat:${data.chatId}`).emit('message:reaction', { messageId: data.messageId, reaction });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('message:delivered', async (data) => {
      await messageService.markDelivered(userId, data.messageId);
      io.to(`chat:${data.chatId}`).emit('message:delivered', { messageId: data.messageId, userId });
    });

    socket.on('message:read', async (data) => {
      await messageService.markRead(userId, data.messageId);
      io.to(`chat:${data.chatId}`).emit('message:read', { messageId: data.messageId, userId });
    });

    socket.on('chat:read', async (data) => {
      await messageService.markChatRead(userId, data.chatId);
      io.to(`chat:${data.chatId}`).emit('chat:read', { chatId: data.chatId, userId });
    });

    socket.on('typing:start', (data) => {
      socket.to(`chat:${data.chatId}`).emit('typing:start', { chatId: data.chatId, userId, name: data.name });
    });

    socket.on('typing:stop', (data) => {
      socket.to(`chat:${data.chatId}`).emit('typing:stop', { chatId: data.chatId, userId });
    });

    socket.on('call:initiate', async (data, callback) => {
      try {
        const call = await callService.createCall(userId, data.receiverId, data.type, data.chatId);

        if (call.status === 'busy') {
          if (callback) callback({ success: false, busy: true, call });
          return;
        }

        const receiverSocket = onlineUsers.get(data.receiverId);
        if (receiverSocket) {
          io.to(receiverSocket).emit('call:incoming', call);
        }

        const notif = await notificationService.createNotification(data.receiverId, {
          type: 'call',
          title: 'Incoming Call',
          body: `${call.caller?.name || 'Someone'} is calling`,
          data: { callId: call.id, type: data.type }
        });
        if (receiverSocket) io.to(receiverSocket).emit('notification:new', notif);

        if (callback) callback({ success: true, call });
      } catch (err) {
        if (callback) callback({ success: false, message: err.message });
      }
    });

    socket.on('call:accept', async (data) => {
      const call = await callService.updateCallStatus(data.callId, 'accepted');
      const callerSocket = onlineUsers.get(call.caller_id);
      if (callerSocket) io.to(callerSocket).emit('call:accepted', call);
    });

    socket.on('call:reject', async (data) => {
      const call = await callService.updateCallStatus(data.callId, 'rejected');
      const callerSocket = onlineUsers.get(call.caller_id);
      if (callerSocket) io.to(callerSocket).emit('call:rejected', call);
    });

    socket.on('call:end', async (data) => {
      const call = await callService.updateCallStatus(data.callId, 'ended');
      const otherId = call.caller_id === userId ? call.receiver_id : call.caller_id;
      const otherSocket = onlineUsers.get(otherId);
      if (otherSocket) io.to(otherSocket).emit('call:ended', call);
      socket.emit('call:ended', call);
    });

    socket.on('call:missed', async (data) => {
      const call = await callService.updateCallStatus(data.callId, 'missed');
      const callerSocket = onlineUsers.get(call.caller_id);
      if (callerSocket) io.to(callerSocket).emit('call:missed', call);
    });

    socket.on('webrtc:offer', (data) => {
      const targetSocket = onlineUsers.get(data.targetUserId);
      if (targetSocket) {
        io.to(targetSocket).emit('webrtc:offer', { ...data, fromUserId: userId });
      }
    });

    socket.on('webrtc:answer', (data) => {
      const targetSocket = onlineUsers.get(data.targetUserId);
      if (targetSocket) {
        io.to(targetSocket).emit('webrtc:answer', { ...data, fromUserId: userId });
      }
    });

    socket.on('webrtc:ice-candidate', (data) => {
      const targetSocket = onlineUsers.get(data.targetUserId);
      if (targetSocket) {
        io.to(targetSocket).emit('webrtc:ice-candidate', { ...data, fromUserId: userId });
      }
    });

    socket.on('status:new', (status) => {
      socket.broadcast.emit('status:update', status);
    });

    socket.on('disconnect', async () => {
      onlineUsers.delete(userId);
      await userService.setOnlineStatus(userId, false);
      socket.broadcast.emit('user:offline', { userId, lastSeen: new Date().toISOString() });
    });
  });

  return onlineUsers;
}

module.exports = { setupSocketHandlers, onlineUsers };
