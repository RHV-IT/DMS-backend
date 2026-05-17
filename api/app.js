require('dotenv').config();

// Global error logging for unhandled rejections and exceptions
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED PROMISE REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

// dependencies
const express = require("express");
//routes from api/src/routes/ (the complete implementation)
const srcAuthRoutes = require("./src/routes/auth.routes");
const srcUserRoutes = require("./src/routes/user.routes");
const srcFileRoutes = require("./src/routes/file.routes");
const srcLogRoutes = require("./src/routes/log.routes");
const srcDashboardRoutes = require("./src/routes/dashboard.routes");
const srcNotificationRoutes = require("./src/routes/notification.routes");
const srcScannerRoutes = require("./src/routes/scanner.routes");
const srcAgentRoutes = require("./src/routes/agent.routes");
const srcPermissionRoutes = require("./src/routes/permission.routes");
const srcSettingsRoutes = require("./src/routes/settings.routes");
const srcPendingScanRoutes = require("./src/routes/pendingScan.routes");
const srcConfigRoutes = require("./src/routes/config.routes");
//database connection - using Mongoose for consistency with models
const connectDB = require("./src/config/database");

// DEBUGGING: Verify routes are loaded
console.log("Auth routes loaded:", typeof srcAuthRoutes);
console.log("User routes loaded:", typeof srcUserRoutes);
console.log("File routes loaded:", typeof srcFileRoutes);
console.log("Log routes loaded:", typeof srcLogRoutes);
console.log("Dashboard routes loaded:", typeof srcDashboardRoutes);
console.log("Notification routes loaded:", typeof srcNotificationRoutes);
console.log("Scanner routes loaded:", typeof srcScannerRoutes);
console.log("Agent routes loaded:", typeof srcAgentRoutes);
console.log("Permission routes loaded:", typeof srcPermissionRoutes);
console.log("Settings routes loaded:", typeof srcSettingsRoutes);
console.log("PendingScan routes loaded:", typeof srcPendingScanRoutes);
console.log("Config routes loaded:", typeof srcConfigRoutes);

const app = express();

// DYNAMIC CORS MIDDLEWARE - accepts ANY requested headers automatically
const allowedOrigins = [
  "https://rhv-dms.vercel.app",
  "http://192.168.0.153:3000",
  "http://docmanager.rhv",
  "http://localhost:3000"
];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "*"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  res.header("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Middleware to ensure database connection (AFTER CORS)
app.use(async (req, res, next) => {
  // Skip database connection for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({
      success: false,
      message: "Database connection failed"
    });
  }
});

// middleware to parse incoming request bodies (AFTER CORS and DB)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false }));

// MOUNT ALL SRC ROUTES (these have their own auth middleware built-in)
console.log("Mounted auth routes");
app.use('/api/v1/auth', srcAuthRoutes);

console.log("Mounted users routes");
app.use('/api/v1/users', srcUserRoutes);

console.log("Mounted files routes");
app.use('/api/v1/files', srcFileRoutes);

console.log("Mounted logs routes");
app.use('/api/v1/logs', srcLogRoutes);

console.log("Mounted dashboard routes");
app.use('/api/v1/dashboard', srcDashboardRoutes);

console.log("Mounted notifications routes");
app.use('/api/v1/notifications', srcNotificationRoutes);

// TEMP TEST ROUTE
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
app.post('/api/v1/test-upload', upload.single('installer'), (req, res) => {
  console.log('TEST UPLOAD - File received:', req.file);
  res.json({
    success: true,
    file: req.file,
    message: 'Test upload successful'
  });
});

console.log("Mounted scanner routes");
app.use('/api/v1/scanner', srcScannerRoutes);

console.log("Mounted pending scans under scanner routes");
app.use('/api/v1/scanner', srcPendingScanRoutes);

console.log("Mounted agents routes");
app.use('/api/v1/agents', srcAgentRoutes);

console.log("Mounted permissions routes");
app.use('/api/v1/permissions', srcPermissionRoutes);

console.log("Mounted settings routes");
app.use('/api/v1/settings', srcSettingsRoutes);

console.log("Mounted config routes");
app.use('/api/v1/config', srcConfigRoutes);

// TEST ROUTE for debugging
app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Test route working",
    timestamp: new Date().toISOString()
  });
});

// Catch-all 404 handler - MUST BE LAST
app.use((req, res) => {
  console.log("404 - Route not found:", req.method, req.path);
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 Server Error:", err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error"
  });
});

module.exports = app;