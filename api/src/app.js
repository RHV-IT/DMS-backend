require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");

const connectDB = require("./config/database");
const { ensureConnected } = require("./config/database");
const logger = require("./config/logger");
const { seedDepartments, seedSuperAdmin } = require("./utils/seed");

const app = express();

const allowedOrigins = [
  "https://rhv-dms.vercel.app",
  "http://192.168.0.153:3000",
  "http://localhost:3000",
  "http://docmanager.rhv",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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

app.use(cookieParser());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", ensureConnected);

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

if (process.env.ENABLE_SWAGGER !== "false") {
  const swaggerUi = require("swagger-ui-express");
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

app.post("/api/v1/auth/track-login", (req, res) => {
  res.json({ success: true, message: "Login tracked" });
});

app.get("/ping", (req, res) => {
  res.json({
    success: true,
    message: "Pong",
    timestamp: new Date().toISOString(),
  });
});

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

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    message: err.message,
  });
});

const PORT = process.env.PORT || 5000;

const startServer = async (retryCount = 0) => {
  const maxRetries = 3;
  try {
    await connectDB();
    logger.info("Database connected");

    await seedDepartments().catch(() => {});
    await seedSuperAdmin().catch(() => {});

    if (process.env.NODE_ENV !== "production") {
      const server = app.listen(PORT, "0.0.0.0", () => {
        logger.info(`Server running on port ${PORT}`);
        console.log(`Docs: http://localhost:${PORT}/api-docs`);
        console.log(`WebSocket: ws://localhost:${PORT}`);
      });

      const createSocketIOServer = require("./config/socket");
      const io = createSocketIOServer(server);
      logger.info("Socket.IO server initialized");
    }
  } catch (error) {
    logger.error("Failed to start server:", error.message);

    if (retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      logger.info(`Retrying in ${delay}ms...`);
      setTimeout(() => startServer(retryCount + 1), delay);
    } else {
      logger.error("Failed after max attempts");
      process.exit(1);
    }
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;

if (process.env.VERCEL) {
  module.exports = (req, res) => {
    console.log("VERCEL REQUEST:", req.method, req.url);
    console.log("VERCEL ORIGIN:", req.headers.origin);
    return app(req, res);
  };
}