const { Server } = require("socket.io");
const logger = require("./logger");
const { validateOrigin, ALLOWED_ORIGINS } = require("./cors");

/**
 * PRODUCTION-GRADE SOCKET.IO CONFIGURATION
 *
 * Guarantees WebSocket connections work from the allowed origins:
 * - http://192.168.0.153:3000
 * - http://docmanager.rhv
 * - http://localhost:3000
 * - https://rhv-dms.vercel.app
 */

function createSocketIOServer(server) {
  const io = new Server(server, {
    // CORS configuration - MUST match the HTTP CORS config exactly
    cors: {
      origin: (origin, callback) => {
        // Use the same origin validation as HTTP requests
        validateOrigin(origin, (error, allowed) => {
          if (error) {
            logger.warn(`[SOCKET.IO] Origin rejected: ${origin} - ${error.message}`);
            return callback(new Error("CORS not allowed"));
          }

          if (allowed) {
            logger.info(`[SOCKET.IO] Origin allowed: ${origin || 'no-origin'}`);
            callback(null, true);
          } else {
            logger.warn(`[SOCKET.IO] Origin blocked: ${origin}`);
            callback(new Error("CORS not allowed"));
          }
        });
      },

      // CRITICAL: Must be true for auth headers and cookies
      credentials: true,

      // All methods Socket.IO needs
      methods: ["GET", "POST", "OPTIONS"],

      // Headers Socket.IO uses
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
        "Origin",
      ],
    },

    // Transport configuration
    transports: ["websocket", "polling"],

    // Security settings
    allowEIO3: true, // Support older Socket.IO clients

    // Connection settings
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds

    // Reconnection settings for stability
    maxReconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  // AUTHENTICATION MIDDLEWARE
  io.use(async (socket, next) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    const origin = socket.handshake.headers.origin;
    const authHeader = socket.handshake.headers.authorization;

    logger.info(`[SOCKET.IO:${requestId}] Connection attempt from: ${origin || 'unknown'}`);

    try {
      // Extract token from Authorization header
      let token = null;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }

      if (token) {
        // Verify the JWT token
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded) {
          // Attach user info to socket
          socket.userId = decoded.id;
          socket.userEmail = decoded.email;
          socket.token = token;

          logger.info(`[SOCKET.IO:${requestId}] Auth successful: ${decoded.email}`);
          next();
        } else {
          logger.warn(`[SOCKET.IO:${requestId}] Invalid token`);
          next(new Error("Authentication error"));
        }
      } else {
        logger.warn(`[SOCKET.IO:${requestId}] No token provided`);
        next(new Error("Authentication required"));
      }
    } catch (error) {
      logger.error(`[SOCKET.IO:${requestId}] Auth error: ${error.message}`);
      next(new Error("Authentication failed"));
    }
  });

  // CONNECTION EVENT HANDLING
  io.on("connection", (socket) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    const origin = socket.handshake.headers.origin;

    logger.info(`[SOCKET.IO:${requestId}] Client connected: ${socket.userEmail} from ${origin}`);

    // Join user-specific room for targeted messages
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
    }

    // Handle disconnection
    socket.on("disconnect", (reason) => {
      logger.info(`[SOCKET.IO:${requestId}] Client disconnected: ${socket.userEmail} - ${reason}`);
    });

    // Handle custom events here
    socket.on("ping", () => {
      socket.emit("pong");
    });

    // Example: File upload progress
    socket.on("upload-progress", (data) => {
      // Broadcast progress to admin users
      socket.to("admin_room").emit("upload-progress", {
        userId: socket.userId,
        ...data,
      });
    });
  });

  // ERROR HANDLING
  io.on("connection_error", (error) => {
    logger.error(`[SOCKET.IO] Connection error:`, error);
  });

  // GRACEFUL SHUTDOWN
  process.on("SIGTERM", () => {
    logger.info("[SOCKET.IO] Shutting down gracefully...");
    io.close(() => {
      logger.info("[SOCKET.IO] Server closed");
      process.exit(0);
    });
  });

  logger.info("[SOCKET.IO] Server initialized with CORS support");
  return io;
}

module.exports = createSocketIOServer;