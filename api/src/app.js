require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/database');
const logger = require('./config/logger');
const { seedDepartments, seedSuperAdmin } = require('./utils/seed');
const mongoose = require('mongoose');
const adminController = require('./controllers/adminController');

// ====================== CORS CONFIGURATION ======================
const getAllowedOrigins = () => {
  const origins = new Set();

  // Add from ALLOWED_ORIGINS (highest priority)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',')
      .map(o => o.trim())
      .filter(Boolean)
      .forEach(origin => origins.add(origin));
  }

  // Add FRONTEND_URL and CLIENT_URL
  if (process.env.FRONTEND_URL) origins.add(process.env.FRONTEND_URL);
  if (process.env.CLIENT_URL) origins.add(process.env.CLIENT_URL);

  // Default fallbacks
  const defaults = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://rhv-dms.vercel.app'
  ];

  defaults.forEach(origin => origins.add(origin));

  return Array.from(origins);
};

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Development: Allow any localhost
    if (process.env.NODE_ENV === 'development') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }

    // Production: Allow Vercel + epilux domains
    if (process.env.NODE_ENV === 'production') {
      if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin) ||
        /^https?:\/\/([a-zA-Z0-9-]+\.)*epilux\.com\.ng$/.test(origin)) {
        return callback(null, true);
      }
    }

    console.warn(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'X-Total-Count']
};
// ================================================================

const app = express();

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

const { enhanceAuditLog } = require('./middlewares/auditEnhancementMiddleware');
app.use(enhanceAuditLog);

if (process.env.ENABLE_SWAGGER !== 'false') {
  const swaggerSpec = require('./utils/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
}

// Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const fileRoutes = require('./routes/file.routes');
const permissionRoutes = require('./routes/permission.routes');
const notificationRoutes = require('./routes/notification.routes');
const logRoutes = require('./routes/log.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const settingsRoutes = require('./routes/settings.routes');
const scannerRoutes = require('./routes/scanner.routes');
const pendingScanRoutes = require('./routes/pendingScan.routes');
const agentRoutes = require('./routes/agent.routes');

app.use('/api/v1/auth', authRoutes);
app.post('/api/v1/auth/track-login', (req, res) => res.status(200).json({ success: true, message: 'Login tracked' }));

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/logs', logRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/scanner', scannerRoutes);
app.use('/api/v1/scanner', pendingScanRoutes);
app.use('/api/v1/agent', agentRoutes);

app.get('/api/v1/config/confidentiality-levels', (req, res) => {
  res.json({
    success: true, data: [
      { label: "Public", value: "public" },
      { label: "Internal", value: "internal" },
      { label: "Confidential", value: "confidential" },
      { label: "Highly Confidential", value: "highly_confidential" }
    ]
  });
});

app.post('/api/v1/admin/register', adminController.registerAdmin);

app.get('/scanner', (req, res) => {
  const filePath = path.join(__dirname, '../public/scanner-download.html');
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).json({ success: false, message: 'Page not found' });
});

app.post('/set-token', (req, res) => {
  const { token, userId, userEmail, userName } = req.body;
  if (!token || !userId || !userEmail) {
    return res.status(400).json({ success: false, message: 'Token, userId, and userEmail are required' });
  }
  req.session = req.session || {};
  req.session.token = token;
  req.session.userId = userId;
  req.session.userEmail = userEmail;
  req.session.userName = userName;

  res.json({ success: true, message: 'Token set successfully', user: { userId, userEmail, userName } });
});

app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    success: dbStatus === 'connected',
    database: dbStatus,
    message: dbStatus === 'connected' ? 'DMS Server is running' : 'Database connection issue'
  });
});

app.get('/', (req, res) => {
  res.json({ success: true, message: 'DMS API running', docs: '/api-docs' });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    logger.info('Database connected');

    await seedDepartments().catch(() => { });
    await seedSuperAdmin().catch(() => { });

    if (process.env.NODE_ENV !== 'production') {
      app.listen(PORT, '0.0.0.0', () => {
        logger.info(`Server running on port ${PORT}`);
        console.log(`🚀 Server: http://localhost:${PORT}`);
        console.log(`📄 Docs: http://localhost:${PORT}/api-docs`);
      });
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

module.exports = app;
module.exports.startServer = startServer;

// Production initialization
if (process.env.NODE_ENV === 'production') {
  connectDB().then(async () => {
    console.log('✅ Database connected');
    await seedDepartments().catch(() => { });
    await seedSuperAdmin().catch(() => { });
  }).catch(err => console.error('❌ DB connection failed:', err));
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', promise, reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});