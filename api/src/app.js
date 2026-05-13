require("dotenv").config();
const express = require("express");
const cors = require("cors");
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

const app = express();

/*
========================================
CORS MUST BE FIRST MIDDLEWARE
========================================
*/

const allowedOrigins = [
  "https://rhv-dms.vercel.app",
  "http://192.168.0.153:3000",
  "http://localhost:3000",
  "http://docmanager.rhv",
];

const corsOptions = {
  origin: (origin, callback) => {
    console.log("Incoming Origin:", origin);

    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "x-browser",
    "x-device",
    "x-client-type",
  ],

  exposedHeaders: [
    "Authorization",
    "Content-Length",
    "Content-Type",
  ],

  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

app.options("*", cors(corsOptions));

/*
========================================
DEBUG LOGGER
========================================
*/

app.use((req, res, next) => {
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("HEADERS:", req.headers);
  next();
});

// [6] CORS SAFETY NET - REMOVED: Main CORS middleware now handles everything properly
=======
  console.log("METHOD:", req.method);
  console.log("URL:", req.url);
  console.log("HEADERS:", req.headers);
  next();
});

/*
========================================
COOKIE PARSER
========================================
*/
>>>>>>> 325cd05 (🚀 VERCEL DEPLOYMENT FIX - CORS Headers on All Responses)

app.use(cookieParser());

/*
========================================
BODY PARSERS
========================================
*/

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

/*
========================================
DATABASE CONNECTION
========================================
*/

// IMPORTANT: Database connection middleware must come AFTER CORS
// to ensure CORS headers are set even if DB connection fails
app.use("/api", ensureConnected);

/*
========================================
AUDIT LOGGING
========================================
*/

const { enhanceAuditLog } = require("./middlewares/auditEnhancementMiddleware");
app.use(enhanceAuditLog);

/*
========================================
ROUTES
========================================
*/

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

// Swagger documentation
if (process.env.ENABLE_SWAGGER !== "false") {
  const swaggerSpec = require("./utils/swagger");
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
}

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

// Login tracking endpoint
app.post("/api/v1/auth/track-login", (req, res) => {
  res.json({ success: true, message: "Login tracked" });
});

/*
========================================
PUBLIC ENDPOINTS
========================================
*/

// Simple health check (no database dependency)
app.get("/ping", (req, res) => {
  res.json({
    success: true,
    message: "Pong",
    timestamp: new Date().toISOString(),
  });
});

// Health check with database status
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

/*
========================================
GLOBAL ERROR HANDLER
========================================
*/

app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);

  res.header(
    "Access-Control-Allow-Origin",
    req.headers.origin || "*"
  );

  res.header(
    "Access-Control-Allow-Credentials",
    "true"
  );

  res.status(500).json({
    success: false,
    message: err.message,
  });
});

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

/*
========================================
VERCEL ERROR HANDLING
========================================
*/

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

module.exports = app;

// For Vercel serverless functions
if (process.env.VERCEL) {
  module.exports = (req, res) => {
    console.log("VERCEL REQUEST:", req.method, req.url);
    console.log("VERCEL ORIGIN:", req.headers.origin);

    return app(req, res);
  };
}