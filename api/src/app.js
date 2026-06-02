require("dotenv").config();
const express = require("express");
// const cors = require("cors"); // MOVED TO cors.js: Commented out to prevent conflict
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

// Import your custom cors middleware which now includes 'x-platform'
const corsMiddleware = require("./config/cors");

const connectDB = require("./config/database");
const { ensureConnected } = require("./config/database");
const logger = require("./config/logger");
const { seedDepartments, seedSuperAdmin } = require("./utils/seed");

const app = express();

/* REMOVED INLINE CORS SETTINGS: 
   All origins and headers are now managed in ./config/cors.js 
*/
// const allowedOrigins = [ ... ];
// const corsOptions = { ... };

// APPLY THE MIDDLEWARE
app.use(corsMiddleware);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// --- Static Files & Routes ---
// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Your existing API routes should follow here...
// Example:
// app.use("/api/v1/auth", authRoutes);
// app.use("/api/v1/dashboard", dashboardRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async (retryCount = 0) => {
  const maxRetries = 3;
  try {
    await connectDB();
    logger.info("Database connected");

    // Seed departments and super admin (ignore errors to allow startup)
    await seedDepartments().catch(() => { });
    await seedSuperAdmin().catch(() => { });

    // For Vercel/Production, the server is handled by the platform
    if (process.env.NODE_ENV !== "production") {
      const server = app.listen(PORT, "0.0.0.0", () => {
        logger.info(`Server running on port ${PORT}`);
      });

      // Initialize Socket.IO server if needed
      const createSocketIOServer = require("./config/socket");
      const io = createSocketIOServer(server);
    }
  } catch (error) {
    logger.error("Failed to start server:", error.message);
    if (retryCount < maxRetries) {
      // Retry after 2 seconds
      setTimeout(() => startServer(retryCount + 1), 2000);
    }
  }
};

module.exports = app;