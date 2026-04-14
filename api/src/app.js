require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

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

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

if (process.env.ENABLE_SWAGGER !== 'false') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get('/api-docs.json', (req, res) => {
    res.json(swaggerSpec);
  });
}

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/logs', logRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'DMS Server is running' });
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

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

startServer();

module.exports = app;