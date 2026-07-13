require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server } = require('socket.io');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');
const { setupSocketHandlers } = require('./socket');
const mediaService = require('./services/mediaService');
const statusService = require('./services/statusService');
const { verifyEmailConnection } = require('./config/email');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contacts');
const chatRoutes = require('./routes/chats');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const statusRoutes = require('./routes/status');
const callRoutes = require('./routes/calls');
const notificationRoutes = require('./routes/notifications');
const mediaRoutes = require('./routes/media');
const settingsRoutes = require('./routes/settings');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'https://hexachat.netlify.app',
  'https://hexachat2.netlify.app'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(generalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'HexaChat API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/settings', settingsRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await mediaService.ensureBuckets();
    console.log('Storage buckets verified');
  } catch (err) {
    console.warn('Storage bucket setup:', err.message);
  }

  await verifyEmailConnection();

  setInterval(() => statusService.cleanupExpired(), 60 * 60 * 1000);

  server.listen(PORT, () => {
    console.log(`HexaChat server running on port ${PORT}`);
  });
}

start();

module.exports = { app, server, io };
