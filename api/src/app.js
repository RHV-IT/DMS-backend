require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/database');
const { ensureConnected } = require('./config/database');
const logger = require('./config/logger');
const { seedDepartments, seedSuperAdmin } = require('./utils/seed');
const mongoose = require('mongoose');
const adminController = require('./controllers/adminController');
const corsConfig = require('./config/cors');

const app = express();

app.use(corsConfig);
app.options('*', corsConfig);

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Ensure database connection for all API routes
app.use('/api', ensureConnected);

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

const startServer = async (retryCount = 0) => {
  const maxRetries = 3;
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
    logger.error('Failed to start server:', error.message);

    if (retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
      logger.info(`Retrying database connection in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
      setTimeout(() => startServer(retryCount + 1), delay);
    } else {
      logger.error(`Failed to connect to database after ${maxRetries} attempts`);
      process.exit(1);
    }
  }
};

// Initialize database connection for all environments
const initializeApp = async () => {
  try {
    await connectDB();
    console.log('✅ Database connected during app initialization');

    // Only seed in development or when explicitly requested
    if (process.env.NODE_ENV === 'development' || process.env.SEED_DATA === 'true') {
      await seedDepartments().catch(() => { });
      await seedSuperAdmin().catch(() => { });
    }
  } catch (err) {
    console.error('❌ DB connection failed during initialization:', err.message);
    // In production/serverless, don't exit - let individual requests handle connection issues
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }
  }
};

// Start server if this file is run directly (not imported as module)
if (require.main === module) {
  initializeApp().then(() => {
    startServer();
  });
}

module.exports = app;
module.exports.startServer = startServer;
module.exports.initializeApp = initializeApp;

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', promise, reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});