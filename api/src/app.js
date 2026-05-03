require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/database');
const logger = require('./config/logger');
const { errorHandler, notFound } = require('./middlewares/errorMiddleware');
const swaggerSpec = require('./utils/swagger');

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
const { enhanceAuditLog } = require('./middlewares/auditEnhancementMiddleware');

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://192.168.4.213:3000',
  'http://127.0.0.1:5173',
  'http://192.168.2.53:3000',
  '*'
];

const corsOptions = {
  origin: function (origin, callback) {
    try {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV === 'development') {
        if (
          /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
      }

      if (process.env.NODE_ENV === 'production') {
        if (/^https?:\/\/([a-zA-Z0-9-]+\.)*epilux\.com\.ng$/.test(origin)) {
          return callback(null, true);
        }
      }

      return callback(new Error('Not allowed by CORS'));
    } catch (err) {
      return callback(err);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));



app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Audit log enhancement middleware
app.use(enhanceAuditLog);

if (process.env.ENABLE_SWAGGER !== 'false') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
}

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
app.use('/api/v1/scanner', pendingScanRoutes);

// Config endpoint for confidentiality levels
app.get('/api/v1/config/confidentiality-levels', (req, res) => {
  res.json({
    success: true,
    data: [
      {
        label: "Public",
        value: "public"
      },
      {
        label: "Internal",
        value: "internal"
      },
      {
        label: "Confidential",
        value: "confidential"
      },
      {
        label: "Highly Confidential",
        value: "highly_confidential"
      }
    ]
  });
});

// Serve scanner download page
app.get('/scanner', (req, res) => {
  const filePath = path.join(__dirname, '../public/scanner-download.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).json({ success: false, message: 'Page not found' });
  }
});

// Manual token set endpoint for scanner agent authentication
app.post('/set-token', (req, res) => {
  const { token, userId, userEmail, userName } = req.body;

  if (!token || !userId || !userEmail) {
    return res.status(400).json({
      success: false,
      message: 'Token, userId, and userEmail are required'
    });
  }

  // Store token in memory (for demo purposes)
  // In production, use a proper session store or database
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

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'DMS Server is running' });
});

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the DMS API', docs: '/api-docs' });
});

// Favicon route
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();
    logger.info('Database connected');

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API Docs: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;