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
const corsConfig = require("./src/config/cors");
//routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const userRoutes = require("./routes/user.routes");
//database connection
const db = require("./database/documentRepository.db");

const app = express();

// Middleware to ensure database connection
app.use(async (req, res, next) => {
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

// Setup CORS middleware at the top
app.use(corsConfig);
app.options('*', corsConfig);

// middleware to parse incoming request bodies
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