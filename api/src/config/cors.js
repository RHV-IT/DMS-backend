// Dynamic CORS configuration for Socket.IO compatibility
const ALLOWED_ORIGINS = [
  "https://rhv-dms.vercel.app",
  "http://192.168.0.153:3000",
  "http://docmanager.rhv",
  "http://localhost:3000"
];

// Validation function for Socket.IO CORS
function validateOrigin(origin, callback) {
  // Allow requests with no origin (like mobile apps, curl requests, Postman)
  if (!origin) {
    callback(null, true);
    return;
  }

  // Check if origin is in allowed list
  if (ALLOWED_ORIGINS.includes(origin)) {
    callback(null, true);
  } else {
    console.log(`CORS blocked for origin: ${origin}`);
    callback(new Error(`CORS blocked for origin: ${origin}`), false);
  }
}

module.exports = {
  ALLOWED_ORIGINS,
  validateOrigin
};