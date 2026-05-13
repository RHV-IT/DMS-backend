const cors = require("cors");

console.log("🔧 Loading CORS configuration...");

// Get all allowed origins with comprehensive local network support
const getAllowedOrigins = () => {
  const origins = new Set();

  // Add from ALLOWED_ORIGINS environment variable (highest priority)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',')
      .map(o => o.trim())
      .filter(Boolean)
      .forEach(origin => origins.add(origin));
  }

  // Add FRONTEND_URL and CLIENT_URL from environment
  if (process.env.FRONTEND_URL) origins.add(process.env.FRONTEND_URL);
  if (process.env.CLIENT_URL) origins.add(process.env.CLIENT_URL);

  // Comprehensive list of allowed origins for local development and production
  const defaults = [
    // Local development
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',

    // Local network IPs (common ranges)
    'http://192.168.0.153:3000',    // User's specific IP
    'http://192.168.8.216:3000',    // Previously configured
    'http://192.168.1.100:3000',    // Common local IP
    'http://192.168.0.100:3000',    // Common local IP
    'http://10.0.0.100:3000',       // Common local IP range

    // Production and staging
    'https://rhv-dms.vercel.app',
    'https://rhv-dms-backend.vercel.app',
    'https://staging-rhv.vercel.app',
    'https://rhv-dms.com'
  ];

  defaults.forEach(origin => origins.add(origin));

  console.log("📋 Allowed CORS origins:", Array.from(origins));
  return Array.from(origins);
};

const allowedOrigins = getAllowedOrigins();

// Dynamic origin validation with comprehensive logging
const validateOrigin = (origin, callback) => {
  console.log("🔍 CORS Request Details:");
  console.log("  Origin:", origin);
  console.log("  Method:", "unknown (preflight)");
  console.log("  Headers:", "checking...");

  // Always allow requests with no origin (Postman, mobile apps, curl, etc.)
  if (!origin) {
    console.log("✅ CORS allowed: no origin (Postman/mobile/curl)");
    return callback(null, true);
  }

  // Check exact matches first
  if (allowedOrigins.includes(origin)) {
    console.log("✅ CORS allowed: exact match -", origin);
    return callback(null, true);
  }

  // Development: Allow any localhost or local network IPs
  if (process.env.NODE_ENV !== 'production') {
    const localPatterns = [
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,      // localhost
      /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/,            // 192.168.x.x
      /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,             // 10.x.x.x
      /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+(:\d+)?$/  // 172.16-31.x.x
    ];

    for (const pattern of localPatterns) {
      if (pattern.test(origin)) {
        console.log("✅ CORS allowed: local network pattern -", origin);
        return callback(null, true);
      }
    }
  }

  // Production: Allow Vercel domains
  if (process.env.NODE_ENV === 'production') {
    if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin)) {
      console.log("✅ CORS allowed: Vercel domain -", origin);
      return callback(null, true);
    }
  }

  // Log rejection with details
  console.error("❌ CORS blocked origin:", origin);
  console.error("❌ Allowed origins:", allowedOrigins);
  return callback(new Error(`CORS blocked: ${origin} not in allowed list`));
};

// Main CORS configuration for authenticated routes
const corsWithCredentials = cors({
  origin: validateOrigin,
  credentials: true,  // Enable credentials for authentication
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
    "X-Source"
  ],
  exposedHeaders: ["Content-Length", "X-Total-Count", "X-File-Size"],
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400  // Cache preflight for 24 hours
});

// CORS configuration for public routes (no credentials)
const corsNoCredentials = cors({
  origin: validateOrigin,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept", "Origin"],
  optionsSuccessStatus: 200,
  maxAge: 86400
});

// Export both configurations
module.exports = corsWithCredentials;
module.exports.noCredentials = corsNoCredentials;
module.exports.allowedOrigins = allowedOrigins;