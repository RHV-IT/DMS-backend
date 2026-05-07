require('dotenv').config();
const mongoose = require('mongoose');

module.exports = async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState;
    const isConnected = dbStatus === 1;

    if (!isConnected) {
      // Try to establish connection
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 10000,
          socketTimeoutMS: 15000,
          maxPoolSize: 1,
          maxIdleTimeMS: 10000,
        });
      } catch (connectError) {
        console.error('Health check - DB connection failed:', connectError.message);
      }
    }

    const finalDbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    res.status(finalDbStatus === 'connected' ? 200 : 503).json({
      success: finalDbStatus === 'connected',
      database: finalDbStatus,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      message: finalDbStatus === 'connected' ? 'Service is healthy' : 'Database connection issue'
    });

  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      success: false,
      database: 'error',
      timestamp: new Date().toISOString(),
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};