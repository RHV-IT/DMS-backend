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

// Create uploads directory
const uploadsDir = path.join(process.cwd(), process.env.VERCEL ? 'tmp' : '', 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Uploads directory created');
  }
} catch (err) {
  console.error('Upload directory creation failed:', err.message);
}

// ====================== CORS CONFIGURATION ======================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://192.168.4.213:3000',
  'https://rhv-dms.vercel.app',
  // Add more domains here as needed
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Allow explicitly defined origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Development: Allow any localhost
    if (process.env.NODE_ENV === 'development') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }

    // Production: Allow Vercel domains and epilux domains
    if (process.env.NODE_ENV === 'production') {
      if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) {
        return callback(null, true);
      }
      if (/^https?:\/\/([a-zA-Z0-9-]+\.)*epilux\.com\.ng$/.test(origin)) {
        return callback(null, true);
      }
    }

    // Log blocked origin for debugging
    console.warn(`❌ CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count']
};
// ================================================================

const app = express();

// Apply CORS
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle preflight requests

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Audit log enhancement middleware
const { enhanceAuditLog } = require('./middlewares/auditEnhancementMiddleware');
app.use(enhanceAuditLog);

if (process.env.ENABLE_SWAGGER !== 'false') {
  const swaggerSpec = require('./utils/swagger');
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
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
app.post('/api/v1/auth/track-login', (req, res) => {
  res.status(200).json({ success: true, message: 'Login tracked' });
});

app.use('/api/v1/users', userRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/logs', logRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/scanner', scannerRoutes);
app.use('/api/v1/scanner', pendingScanRoutes); // Note: same prefix as above
app.use('/api/v1/agent', agentRoutes);

// Config endpoint
app.get('/api/v1/config/confidentiality-levels', (req, res) => {
  res.json({
    success: true,
    data: [
      { label: "Public", value: "public" },
      { label: "Internal", value: "internal" },
      { label: "Confidential", value: "confidential" },
      { label: "Highly Confidential", value: "highly_confidential" }
    ]
  });
});

// Admin registration
app.post('/api/v1/admin/register', adminController.registerAdmin);

// Scanner download page
app.get('/scanner', (req, res) => {
  const filePath = path.join(__dirname, '../public/scanner-download.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ success: false, message: 'Page not found' });
  }
});

// Set token endpoint
app.post('/set-token', (req, res) => {
  const { token, userId, userEmail, userName } = req.body;

  if (!token || !userId || !userEmail) {
    return res.status(400).json({
      success: false,
      message: 'Token, userId, and userEmail are required'
    });
  }

  req.session = req.session || {};
  req.session.token = token;
  req.session.userId = userId;
  req.session.userEmail = userEmail;
  req.session.userName = userName;

  res.json({
    success: true,
    message: 'Token set successfully',
    user: { userId, userEmail, userName }
  });
});

// Health check
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    success: dbStatus === 'connected',
    database: dbStatus,
    message: dbStatus === 'connected' ? 'DMS Server is running' : 'Database connection issue'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'DMS API running',
    docs: '/api-docs'
  });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

const { errorHandler, notFound } = require('./middlewares/errorMiddleware');

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

const startServer = async () => {
  try {
    await connectDB();
    logger.info('Database connected');

    await seedDepartments().catch(err => console.warn('Department seeding failed:', err.message));
    await seedSuperAdmin().catch(err => console.warn('Super Admin seeding failed:', err.message));

    if (process.env.NODE_ENV !== 'production') {
      app.listen(PORT, '0.0.0.0', () => {
        logger.info(`Server running on port ${PORT}`);
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📄 API Docs: http://localhost:${PORT}/api-docs`);
      });
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

module.exports = app;
module.exports.startServer = startServer;

// Production startup
if (process.env.NODE_ENV === 'production') {
  connectDB().then(async () => {
    console.log('✅ DB connected');
    await seedDepartments().catch(() => { });
    await seedSuperAdmin().catch(() => { });
  }).catch(err => console.error('❌ DB connection failed:', err));
}