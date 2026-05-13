const logger = require("../config/logger");
const multer = require("multer");

/**
 * ERROR MIDDLEWARE - Production Grade
 *
 * Key fixes applied:
 * 1. EVERY error response includes CORS headers to prevent
 *    the browser from blocking the response itself.
 * 2. Proper error typing for frontend handling
 * 3. Never leaks stack traces in production
 * 4. Handles multer upload errors gracefully
 * 5. OPTIONS preflight errors return 200 with CORS headers
 */

const errorHandler = (err, req, res, next) => {
  const requestId = Math.random().toString(36).substring(2, 8);
  let error = { ...err };
  error.message = err.message;

  // Log the error with full context
  logger.error(`[ERROR:${requestId}] 💥 ${err.message}`, {
    path: req.path,
    method: req.method,
    origin: req.headers.origin,
    stack: err.stack,
    body: req.body,
    query: req.query,
  });

  // Handle specific error types
  if (err.name === "CastError") {
    error.message = "Resource not found";
    error.statusCode = 404;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error.message = `Duplicate field value: ${field}`;
    error.statusCode = 400;
  }

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((val) => val.message);
    error.message = messages.join(", ");
    error.statusCode = 400;
  }

  // Handle multer upload errors gracefully
  if (err instanceof multer.MulterError) {
    error.statusCode = 400;
    if (err.code === "LIMIT_FILE_SIZE") {
      error.message = `File too large. Maximum size is ${parseInt(process.env.MAX_FILE_SIZE) / (1024 * 1024)}MB`;
    }
  }

  const statusCode = error.statusCode || 500;
  const isProduction = process.env.NODE_ENV === "production";

  // ================================================================
  // FIX #18: Set CORS headers on EVERY error response.
  // This is the most critical fix. Without this, when auth fails
  // or an error occurs, the browser blocks the response because
  // it lacks CORS headers, creating a cascading failure.
  // ================================================================
  const origin = req.headers.origin;

  if (origin) {
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Client-Type, X-Machine-Id, X-Machine-Name, X-Hostname, X-Platform, X-Source"
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Length, X-Total-Count, X-File-Size, X-Auth-Token, X-Request-Id");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  // Handle preflight error responses - MUST return 200
  if (req.method === "OPTIONS") {
    logger.debug(`[ERROR:${requestId}] ⚡ OPTIONS preflight error - returning 200 with CORS headers`);
    return res.status(200).setHeader("Access-Control-Max-Age", "600").end();
  }

  // Build the error response
  const response = {
    success: false,
    message: error.message || "Internal Server Error",
    ...(isProduction
      ? {}
      : {
          stack: err.stack,
          requestId,
        }),
    // Include error type for frontend handling
    ...(error.errorType ? { errorType: error.errorType } : {}),
    ...(error.details ? { details: error.details } : {}),
  };

  // Never expose raw error details in production for 500 errors
  if (statusCode === 500 && isProduction) {
    response.message = "Internal Server Error. Our team has been notified.";
  }

  res.status(statusCode).json(response);
};

const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  error.statusCode = 404;
  error.errorType = "NOT_FOUND";
  next(error);
};

module.exports = { errorHandler, notFound };