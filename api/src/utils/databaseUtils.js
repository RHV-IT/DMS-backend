const mongoose = require('mongoose');
const connectDB = require('../config/database');

// Ensure database connection for serverless environments
const ensureConnection = async () => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectDB();
    } catch (error) {
      console.error('Failed to establish database connection:', error.message);
      throw error;
    }
  }
};

/**
 * Execute a database operation with retry logic for connection issues
 * @param {Function} operation - The async database operation to execute
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} baseDelay - Base delay in ms between retries (default: 1000)
 * @returns {Promise} - Result of the operation
 */
const withRetry = async (operation, maxRetries = 3, baseDelay = 1000) => {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure connection is ready
      await ensureConnection();

      // Execute the operation
      const result = await operation();
      return result;
    } catch (error) {
      lastError = error;
      console.error(`Database operation failed on attempt ${attempt + 1}:`, error.message);

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        break;
      }

      // Check if it's a connection-related error that we should retry
      const isRetryableError = (
        error.message.includes('buffering timed out') ||
        error.message.includes('connection timed out') ||
        error.message.includes('server selection timed out') ||
        error.name === 'MongooseError' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND'
      );

      if (!isRetryableError) {
        // Not a retryable error, throw immediately
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Retrying database operation in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
};

/**
 * Wrapper for User model operations with built-in retry logic
 */
const userOperations = {
  findOne: (query) => withRetry(() => require('../models/User').findOne(query)),
  findById: (id) => withRetry(() => require('../models/User').findById(id)),
  create: (data) => withRetry(() => require('../models/User').create(data)),
  findOneAndUpdate: (query, update, options = {}) => withRetry(() => require('../models/User').findOneAndUpdate(query, update, options)),
  findByIdAndUpdate: (id, update, options = {}) => withRetry(() => require('../models/User').findByIdAndUpdate(id, update, options)),
};

module.exports = {
  withRetry,
  userOperations,
};