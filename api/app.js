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
const checkAuth = require("./middlewares/cheackAuth");
//routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const userRoutes = require("./routes/user.routes");
//database connection
const db = require("./database/documentRepository.db");

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
    await db.ensureConnected();
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

// routes (prefixed with /api to match Vercel rewrite)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', checkAuth, userRoutes);
app.use("/api/v1/admin", checkAuth, adminRoutes);

// Fallback route for debugging
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
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