const cors = require("cors");
const logger = require("./logger");

console.log("🔧 Loading CORS configuration...");

/**
 * EXACTLY ALLOWED ORIGINS - NO EXCEPTIONS
 * These origins MUST work 100% of the time
 */
const ALLOWED_ORIGINS = [
  // User's specific requirements - MUST work perfectly
  "http://192.168.0.153:3000",  // Primary user origin
  "http://docmanager.rhv",       // Domain origin
  "http://localhost:3000",      // Local dev
  "https://rhv-dms.vercel.app",  // Production

  // Additional safe origins for development/testing
  "http://localhost:5173",      // Vite default
  "http://127.0.0.1:3000",      // Alternative localhost
  "http://127.0.0.1:5173",      // Alternative localhost
];

/**
 * DYNAMIC ORIGIN VALIDATION
 * This is the heart of the CORS system - it MUST always allow the allowed origins
 */
const validateOrigin = (origin, callback) => {
  const requestId = Math.random().toString(36).substring(2, 8);

  // Log EVERY origin validation for debugging
  logger.info(`[CORS:${requestId}] Validating origin: "${origin || 'none'}"`);

  // Requests without Origin header (Postman, curl, mobile apps) - ALWAYS ALLOW
  if (!origin) {
    logger.debug(`[CORS:${requestId}] ✅ ALLOWED: No origin header (non-browser client)`);
    return callback(null, true);
  }

  // EXACT MATCH CHECK - This is the most reliable way to check origins
  if (ALLOWED_ORIGINS.includes(origin)) {
    logger.info(`[CORS:${requestId}] ✅ ALLOWED: Exact match - ${origin}`);
    return callback(null, true);
  }

  // DEVELOPMENT ONLY: Allow localhost variations and local network
  if (process.env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;

      // Allow any localhost/127.0.0.1 on any port
      if (hostname === "localhost" || hostname === "127.0.0.1") {
        logger.debug(`[CORS:${requestId}] ✅ ALLOWED: Localhost variation - ${origin}`);
        return callback(null, true);
      }

      // Allow local network IPs (192.168.x.x range)
      if (/^192\.168\.\d+\.\d+$/.test(hostname)) {
        logger.debug(`[CORS:${requestId}] ✅ ALLOWED: Local network IP - ${origin}`);
        return callback(null, true);
      }

      // Allow .rhv domains
      if (hostname.endsWith(".rhv") || hostname === "rhv") {
        logger.debug(`[CORS:${requestId}] ✅ ALLOWED: .rhv domain - ${origin}`);
        return callback(null, true);
      }
    } catch (e) {
      // Invalid URL format - log but allow in dev
      logger.warn(`[CORS:${requestId}] ⚠️ Invalid URL format: ${origin} - allowing in dev mode`);
      return callback(null, true);
    }
  }

  // PRODUCTION ONLY: Allow Vercel deployments
  if (process.env.NODE_ENV === "production") {
    try {
      const url = new URL(origin);
      if (url.hostname.endsWith(".vercel.app")) {
        logger.debug(`[CORS:${requestId}] ✅ ALLOWED: Vercel deployment - ${origin}`);
        return callback(null, true);
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  }

  // ORIGIN NOT IN ALLOWLIST - LOG AND DECIDE
  logger.warn(`[CORS:${requestId}] ❌ Origin not in allowlist: ${origin}`);
  logger.warn(`[CORS:${requestId}] Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);

  // IN PRODUCTION: BLOCK unknown origins to prevent security issues
  // IN DEVELOPMENT: ALLOW to prevent debugging hell
  if (process.env.NODE_ENV === "production") {
    logger.error(`[CORS:${requestId}] 🚫 BLOCKED: Unknown origin in production - ${origin}`);
    return callback(new Error(`CORS not allowed: ${origin}`));
  } else {
    // Development: Allow unknown origins but log the issue
    logger.warn(`[CORS:${requestId}] 🟡 ALLOWED: Unknown origin in development - ${origin}`);
    return callback(null, true);
  }
};

/**
 * PRODUCTION-GRADE CORS CONFIGURATION
 *
 * This configuration guarantees the following origins work 100% of the time:
 * - http://192.168.0.153:3000
 * - http://docmanager.rhv
 * - http://localhost:3000
 * - https://rhv-dms.vercel.app
 */

// ============================================================
// GLOBAL CORS MIDDLEWARE - APPLIES TO ALL REQUESTS
// This is the ONLY CORS configuration used in the entire app
// ============================================================
const corsWithCredentials = cors({
  origin: validateOrigin,

  // CRITICAL: Must be true for cookies and Authorization headers
  credentials: true,

  // All HTTP methods your API supports
  methods: [
    "GET", "POST", "PUT", "PATCH", "DELETE",
    "OPTIONS", "HEAD", "CONNECT", "TRACE"
  ],

  // All headers your API accepts (including auth headers)
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
    "X-Client-Type",
    "X-Machine-Id",
    "X-Machine-Name",
    "X-Hostname",
    "X-Platform",
    "X-Source",
    "X-Device-Name",
    "X-Screen-Resolution",
    "Cache-Control",
    "Pragma",
    "If-None-Match",
    "If-Match",
    "Accept-Encoding",
    "Accept-Language",
    "User-Agent",
    "Referer",
  ],

  // Headers the frontend can access from responses
  exposedHeaders: [
    "Content-Length",
    "X-Total-Count",
    "X-File-Size",
    "X-Auth-Token",
    "X-Request-Id",
    "Retry-After",
    "Set-Cookie",
    "Date",
    "ETag",
    "Last-Modified",
  ],

  // Use 200 for preflight responses (more compatible)
  optionsSuccessStatus: 200,

  // Let cors middleware handle preflight completely
  preflightContinue: false,

  // Cache preflight for 10 minutes (not too long, not too short)
  maxAge: 600,
});

// ============================================================
// SAFETY NET: Ensures CORS headers are ALWAYS present
// This catches any response that might not have CORS headers
// ============================================================
const ensureCorsHeaders = (req, res, next) => {
  const origin = req.headers.origin;
  const requestId = Math.random().toString(36).substring(2, 8);

  logger.debug(`[CORS-SAFETY:${requestId}] Ensuring CORS headers for: ${origin || 'none'}`);

  // Override response methods to inject CORS headers
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  const originalEnd = res.end.bind(res);

  const injectCorsHeaders = () => {
    if (res.headersSent) return;

    // Always set Vary: Origin for proper caching
    res.setHeader("Vary", "Origin");

    if (origin) {
      // Set the specific origin (NEVER use "*" with credentials)
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD");
      res.setHeader("Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Client-Type, X-Machine-Id, X-Machine-Name, X-Hostname, X-Platform, X-Source"
      );
      res.setHeader("Access-Control-Expose-Headers", "Content-Length, X-Total-Count, X-File-Size, X-Auth-Token, X-Request-Id");
      res.setHeader("Access-Control-Max-Age", "600");
    }

    logger.debug(`[CORS-SAFETY:${requestId}] CORS headers injected for: ${origin || 'none'}`);
  };

  // Intercept response methods
  res.json = (body) => {
    injectCorsHeaders();
    return originalJson(body);
  };

  res.send = (body) => {
    injectCorsHeaders();
    return originalSend(body);
  };

  res.end = (body) => {
    injectCorsHeaders();
    return originalEnd(body);
  };

  next();
};

// ============================================================
// EXPORTS
// ============================================================

// Main CORS middleware (used globally)
module.exports = corsWithCredentials;

// Export helpers for testing/debugging
module.exports.validateOrigin = validateOrigin;
module.exports.ALLOWED_ORIGINS = ALLOWED_ORIGINS;
module.exports.ensureCorsHeaders = ensureCorsHeaders;