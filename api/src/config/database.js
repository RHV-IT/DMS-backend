const mongoose = require('mongoose');

// For serverless environments, disable buffering to ensure connections are ready
const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL || !!process.env.LAMBDA_TASK_ROOT;
mongoose.set('bufferCommands', !isServerless);

// Global connection variable to reuse connections
let cachedConnection = null;
let isConnecting = false;

const connectDB = async () => {
  // If already connected, return cached connection
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    console.log('Connection attempt already in progress, waiting...');
    // Wait for existing connection attempt
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (cachedConnection && mongoose.connection.readyState === 1) {
      return cachedConnection;
    }
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  isConnecting = true;

  try {
    console.log('Establishing MongoDB connection...');

    const options = {
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      maxPoolSize: isServerless ? 1 : 10, // Limit pool size in serverless
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      family: 4, // Use IPv4, skip trying IPv6
      // Additional serverless optimizations
      ...(isServerless && {
        bufferCommands: false,
        bufferMaxEntries: 0,
      }),
    };

    cachedConnection = await mongoose.connect(mongoUri, options);
    console.log('MongoDB connected successfully');
    return cachedConnection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    cachedConnection = null;
    throw error;
  } finally {
    isConnecting = false;
  }
};

// Initialize connection immediately for serverless environments
if (isServerless) {
  console.log('Serverless environment detected, initializing database connection...');
  connectDB().catch(err => {
    console.error('Failed to initialize database connection:', err.message);
    // Don't exit in serverless, let the function handle the error
  });
}

// Connection event listeners
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
  cachedConnection = null;
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
  cachedConnection = null;
});

// Middleware to ensure database connection for each request
const ensureConnected = async (req, res, next) => {
  try {
    // In serverless environments, connection should already be established
    if (isServerless) {
      // Wait for connection to be ready or establish if needed
      let attempts = 0;
      while (mongoose.connection.readyState !== 1 && attempts < 50) { // 5 seconds max wait
        if (!isConnecting) {
          await connectDB();
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database connection timeout');
      }
    } else {
      // For regular environments, connect if needed
      if (mongoose.connection.readyState !== 1) {
        console.log('Database not connected, establishing connection...');
        await connectDB();
      }
    }
    next();
  } catch (error) {
    console.error('Failed to ensure database connection:', error.message);
    return res.status(503).json({
      success: false,
      message: 'Database connection failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Service temporarily unavailable'
    });
  }
};

module.exports = connectDB;
module.exports.ensureConnected = ensureConnected;