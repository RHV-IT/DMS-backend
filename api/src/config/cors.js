const cors = require('cors');

// Dynamic CORS configuration for Socket.IO compatibility
// Define allowed origins for the application
const ALLOWED_ORIGINS = [
  "https://rhv-dms.vercel.app", // Production frontend
  "http://192.168.0.153:3000", // Local network frontend
  "http://192.168.0.153", // Local network frontend
  "http://docmanager.rhv",      // Internal network alias
  "http://localhost:3000"       // Local development
];

// Create a lowercase version for case-insensitive comparison
const ALLOWED_ORIGINS_LOWER = ALLOWED_ORIGINS.map(origin => origin.toLowerCase());

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, Postman)
    if (!origin) {
      callback(null, true);
      return;
    }

    const originLower = origin.toLowerCase();

    // Check if origin is in allowed list (case-insensitive)
    if (ALLOWED_ORIGINS_LOWER.includes(originLower)) {
      callback(null, true);
    } else {
      console.log(`CORS blocked for origin: ${origin}`);
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true, // Enable cookies and Authorization headers in cross-origin requests
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], // Allowed HTTP methods
  allowedHeaders: [ // Allowed request headers
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'x-browser',
    'x-device',
    'x-client-type',
    'x-platform'
  ],
  optionsSuccessStatus: 200 // Status for successful OPTIONS requests
};

// Create and export the CORS middleware
module.exports = cors(corsOptions);