const cors = require("cors");

console.log("🔧 Loading CORS configuration...");

const getAllowedOrigins = () => {
  const origins = new Set();

  // Add from ALLOWED_ORIGINS (highest priority)
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',')
      .map(o => o.trim())
      .filter(Boolean)
      .forEach(origin => origins.add(origin));
  }

  // Add FRONTEND_URL and CLIENT_URL
  if (process.env.FRONTEND_URL) origins.add(process.env.FRONTEND_URL);
  if (process.env.CLIENT_URL) origins.add(process.env.CLIENT_URL);

  // Default fallbacks
  const defaults = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'https://rhv-dms.vercel.app',
    'https://rhv-dms-backend.vercel.app'
  ];

  defaults.forEach(origin => origins.add(origin));

  return Array.from(origins);
};

const allowedOrigins = getAllowedOrigins();

const dynamicOrigin = (origin, callback) => {
  // Log all incoming origins for debugging
  console.log("🔍 CORS check for origin:", origin);

  // Allow requests with no origin (mobile apps, Postman, etc.)
  if (!origin) {
    console.log("✅ CORS allowed: no origin (mobile/Postman)");
    return callback(null, true);
  }

  // ALWAYS allow these specific origins regardless of environment
  const alwaysAllowed = [
    'https://rhv-dms.vercel.app',      // Production frontend
    'http://localhost:3000',           // Local development frontend
    'http://127.0.0.1:3000'            // Alternative local
  ];

  if (alwaysAllowed.includes(origin)) {
    console.log("✅ CORS allowed: always-allowed origin:", origin);
    return callback(null, true);
  }

  // Check against configured allowed origins
  if (allowedOrigins.includes(origin)) {
    console.log("✅ CORS allowed: configured origin:", origin);
    return callback(null, true);
  }

  // Development: Allow any localhost/network addresses
  if (process.env.NODE_ENV === 'development') {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
        /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin)) {
      console.log("✅ CORS allowed: development pattern:", origin);
      return callback(null, true);
    }
  }

  // Production: Allow Vercel domains and specific patterns
  if (process.env.NODE_ENV === 'production') {
    if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/.test(origin) ||
        /^https?:\/\/([a-zA-Z0-9-]+\.)*epilux\.com\.ng$/.test(origin)) {
      console.log("✅ CORS allowed: production pattern:", origin);
      return callback(null, true);
    }
  }

  console.error("❌ CORS blocked origin:", origin);
  return callback(new Error('Not allowed by CORS'));
};

module.exports = cors({
  origin: dynamicOrigin,
  credentials: true, // Allow credentials when sent
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  exposedHeaders: ["Content-Length", "X-Total-Count"],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
});

// Alternative: Create a no-credentials CORS config for public endpoints
const corsNoCredentials = cors({
  origin: dynamicOrigin,
  credentials: false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin"
  ],
  exposedHeaders: ["Content-Length", "X-Total-Count"],
  optionsSuccessStatus: 200
});

module.exports.noCredentials = corsNoCredentials;