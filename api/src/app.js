require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const path = require("path");
const fs = require("fs");

const connectDB = require("./config/database");
const { ensureConnected } = require("./config/database");
const logger = require("./config/logger");
const { seedDepartments, seedSuperAdmin } = require("./utils/seed");
const mongoose = require("mongoose");
const adminController = require("./controllers/adminController");
const corsConfig = require("./config/cors");
const { ensureCorsHeaders } = require("./config/cors");

const app = express();

// ============================================================
// PRODUCTION-GRADE MIDDLEWARE ORDER
// This order is CRITICAL for CORS + Auth stability
// ============================================================

// [1] GLOBAL CORS MIDDLEWARE - FIRST AND MOST IMPORTANT
// Handles ALL preflight OPTIONS requests and sets CORS headers for ALL responses
// This guarantees the allowed origins work 100% of the time
app.use(corsConfig);

// [2] EXPLICIT OPTIONS HANDLER - SAFETY NET
// Ensures preflight requests are ALWAYS handled with CORS
app.options("*", cors(corsConfig.corsOptions));

// [3] COOKIE PARSER - Must come before auth middleware
app.use(cookieParser());

// [4] BODY PARSERS - For JSON and URL-encoded requests
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// [5] REQUEST LOGGING - Comprehensive logging for debugging
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substring(2, 8);
  const origin = req.headers.origin || 'none';

  logger.info(`[${req.method}:${requestId}] ${req.path} - Origin: ${origin}`);

  // CORS DEBUG LOGGING - Show all request details
  console.log("Origin:", req.headers.origin);
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);

  // Log auth-related headers for debugging
  if (req.headers.authorization) {
    logger.debug(`[AUTH:${requestId}] Bearer token: ${req.headers.authorization.substring(0, 20)}...`);
  }
  if (req.headers.cookie) {
    logger.debug(`[COOKIE:${requestId}] Cookie header present`);
  }
  if (req.method === 'OPTIONS') {
    logger.debug(`[PREFLIGHT:${requestId}] ${origin} requesting: ${req.headers['access-control-request-method']} with headers: ${req.headers['access-control-request-headers']}`);
  }

  // Store request ID for response correlation
  req.requestId = requestId;
  next();
});

// [6] CORS SAFETY NET - REMOVED: Main CORS middleware now handles everything properly

// [7] Database connection middleware - ensures DB is connected for API routes
app.use("/api", ensureConnected);

// [8] Audit enhancement middleware - attaches device info to requests
const { enhanceAuditLog } = require("./middlewares/auditEnhancementMiddleware");
app.use(enhanceAuditLog);

// [9] Swagger documentation (optional)
if (process.env.ENABLE_SWAGGER !== "false") {
  const swaggerSpec = require("./utils/swagger");
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
}

// ============================================================
// ROUTES
// Auth middleware is applied PER-ROUTE inside each router file,
// NOT globally here. This is intentional:
// - /api/v1/auth/* routes have their own auth rules
// - /api/v1/auth/* routes apply auth ONLY to protected sub-routes
// - Public routes (health, cors-test) have NO auth
// ============================================================

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const fileRoutes = require("./routes/file.routes");
const permissionRoutes = require("./routes/permission.routes");
const notificationRoutes = require("./routes/notification.routes");
const logRoutes = require("./routes/log.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const settingsRoutes = require("./routes/settings.routes");
const scannerRoutes = require("./routes/scanner.routes");
const pendingScanRoutes = require("./routes/pendingScan.routes");
const agentRoutes = require("./routes/agent.routes");

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/files", fileRoutes);
app.use("/api/v1/permissions", permissionRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/logs", logRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/settings", settingsRoutes);
app.use("/api/v1/scanner", scannerRoutes);
app.use("/api/v1/scanner", pendingScanRoutes);
app.use("/api/v1/agent", agentRoutes);

// Login tracking endpoint (no auth needed, used by scanner agent)
app.post("/api/v1/auth/track-login", (req, res) => {
  logger.info(`[TRACK-LOGIN] Login tracked from: ${req.headers.origin || "unknown"}`);
  res.json({ success: true, message: "Login tracked" });
});

// ============================================================
// PUBLIC ENDPOINTS (no auth, but CORS applied via global middleware)
// ============================================================

app.get("/health", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.json({
    success: dbStatus === "connected",
    database: dbStatus,
    message: dbStatus === "connected" ? "DMS Server is running" : "Database connection issue",
    timestamp: new Date().toISOString(),
  });
});

app.get("/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS test successful",
    origin: req.headers.origin,
    userAgent: req.headers["user-agent"],
    cookiesPresent: !!req.headers.cookie,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/v1/cors-test", (req, res) => {
  res.json({
    success: true,
    message: "CORS is working!",
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    allowedOrigins: corsConfig.allowedOrigins || [],
  });
});

app.get("/api/v1/config/confidentiality-levels", (req, res) => {
  res.json({
    success: true,
    data: [
      { label: "Public", value: "public" },
      { label: "Internal", value: "internal" },
      { label: "Confidential", value: "confidential" },
      { label: "Highly Confidential", value: "highly_confidential" },
    ],
  });
});

app.get("/scanner", (req, res) => {
  const filePath = path.join(__dirname, "../public/scanner-download.html");
  fs.existsSync(filePath) ? res.sendFile(filePath) : res.status(404).json({ success: false, message: "Page not found" });
});

app.get("/", (req, res) => {
  res.json({ success: true, message: "DMS API running", docs: "/api-docs" });
});

app.get("/favicon.ico", (req, res) => res.status(204).end());

// ============================================================
// ERROR HANDLERS - MUST BE LAST IN MIDDLEWARE CHAIN
// These catch any errors not caught by route handlers.
// The errorHandler includes CORS headers via ensureCorsHeaders,
// but we also set them here as an additional safety measure.
// ============================================================

const { errorHandler, notFound } = require("./middlewares/errorMiddleware");

// 404 handler - catches any routes that don't exist
app.use(notFound);

// Global error handler - catches all thrown errors
app.use(errorHandler);

// ============================================================
// SERVER STARTUP
// ============================================================

const PORT = process.env.PORT || 5000;

// Socket.IO Server (for WebSocket support)
let io = null;

const startServer = async (retryCount = 0) => {
  const maxRetries = 3;
  try {
    await connectDB();
    logger.info("✅ Database connected");

    await seedDepartments().catch(() => {});
    await seedSuperAdmin().catch(() => {});

    if (process.env.NODE_ENV !== "production") {
      // Create HTTP server
      const server = app.listen(PORT, "0.0.0.0", () => {
        logger.info(`🚀 Server running on port ${PORT}`);
        console.log(`📄 Docs: http://localhost:${PORT}/api-docs`);
        console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
      });

      // Initialize Socket.IO with CORS support
      const createSocketIOServer = require("./config/socket");
      io = createSocketIOServer(server);
      logger.info("🔌 Socket.IO server initialized");
    }
  } catch (error) {
    logger.error("💥 Failed to start server:", error.message);

    if (retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      logger.info(`🔄 Retrying database connection in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);
      setTimeout(() => startServer(retryCount + 1), delay);
    } else {
      logger.error("❌ Failed to connect to database after maximum attempts");
      process.exit(1);
    }
  }
};

// Initialize database connection for all environments
const initializeApp = async () => {
  try {
    await connectDB();
    console.log("✅ Database connected during app initialization");

    if (process.env.NODE_ENV === "development" || process.env.SEED_DATA === "true") {
      await seedDepartments().catch(() => {});
      await seedSuperAdmin().catch(() => {});
    }
  } catch (err) {
    console.error("❌ DB connection failed during initialization:", err.message);
    if (process.env.NODE_ENV === "development") {
      process.exit(1);
    }
  }
};

// Start server if run directly (not imported as module)
if (require.main === module) {
  initializeApp().then(() => {
    startServer();
  });
}

module.exports = app;
module.exports.startServer = startServer;
module.exports.initializeApp = initializeApp;

// Global error handlers for uncaught exceptions
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection:", { reason: reason?.message || reason, promise });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", { message: error.message, stack: error.stack });
  process.exit(1);
});