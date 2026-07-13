require('dotenv').config();

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !String(process.env[key] || '').trim());
if (missing.length) {
  console.error('FATAL: Missing env vars:', missing.join(', '));
  console.error('Set them in Railway → Variables, then redeploy.');
  process.exit(1);
}

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
const { verifyEmailConnection, getEmailStatus } = require('./config/email');

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

// Railway reverse proxy — required for rate-limit + correct IPs
app.set('trust proxy', 1);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://hexachat.netlify.app',
  'https://hexachat2.netlify.app'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.length ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

function healthHandler(_req, res) {
  res.status(200).json({
    success: true,
    message: 'HexaChat API is running',
    port: process.env.PORT || 5000,
    timestamp: new Date().toISOString()
  });
}

// Health endpoints FIRST (before rate limit / heavy middleware)
app.get('/', healthHandler);
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);
app.get('/api/health/email', async (_req, res) => {
  try {
    const email = await getEmailStatus();
    res.json({ success: true, email });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(generalLimiter);

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

app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

setupSocketHandlers(io);

const PORT = Number(process.env.PORT) || 5000;
const HOST = '0.0.0.0';

function startBackgroundTasks() {
  mediaService.ensureBuckets()
    .then(() => console.log('Storage buckets verified'))
    .catch((err) => console.warn('Storage bucket setup:', err.message));

  verifyEmailConnection()
    .catch((err) => console.warn('Email verify:', err.message));

  setInterval(() => {
    statusService.cleanupExpired().catch(() => {});
  }, 60 * 60 * 1000);
}

server.listen(PORT, HOST, () => {
  console.log(`HexaChat listening on ${HOST}:${PORT}`);
  console.log('Health: GET /api/health');
  console.log('Email status: GET /api/health/email');
  startBackgroundTasks();
});

server.on('error', (err) => {
  console.error('Server failed to start:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err?.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
  process.exit(1);
});

module.exports = { app, server, io };
