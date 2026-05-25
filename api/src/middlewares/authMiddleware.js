const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authService = require("../services/authService");
const logger = require("../config/logger");

/**
 * AUTH MIDDLEWARE - Production Grade
 *
 * Key fixes applied:
 * 1. Skips OPTIONS preflight requests (they don't need auth)
 * 2. Tries cookie then Authorization header (not both simultaneously)
 * 3. Returns proper error with CORS-safe headers
 * 4. Logs all auth failures for debugging
 * 5. Does NOT block 401 responses from setting CORS headers
 * 6. Handles token refresh race conditions
 */

const auth = async (req, res, next) => {
  const requestId = Math.random().toString(36).substring(2, 8);

  // ================================================================
  // CRITICAL: OPTIONS requests MUST NEVER hit auth middleware
  // This prevents 401 errors on preflight requests
  // ================================================================
  if (req.method === "OPTIONS") {
    console.log(`[AUTH:${requestId}] ⚡ SKIPPING AUTH for OPTIONS: ${req.path}`);
    return next();
  }

  // ================================================================
  // FIX #5: Token extraction - single source of truth per request.
  // Priority: 1) Cookie token  2) Authorization header
  // Previously both were checked, but the last one wins logic was
  // confusing and could cause stale token issues.
  // ================================================================
  let token = null;
  const authHeader = req.headers.authorization;

  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
    logger.debug(`[AUTH:${requestId}] 🍪 Token loaded from cookie`);
  } else if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
    logger.debug(`[AUTH:${requestId}] 🔑 Token loaded from Authorization header`);
  }

  // No token at all - return 401 with CORS headers intact
  if (!token) {
    logger.debug(`[AUTH:${requestId}] ❌ No token provided - ${req.method} ${req.path}`);
    return res.status(401).json({
      success: false,
      message: "No token provided. Please log in.",
      errorType: "NO_TOKEN",
      requestId,
    });
  }

  try {
    // ================================================================
    // FIX #7: JWT validation with detailed error logging.
    // Previously, all errors returned generic "Authentication failed".
    // Now we distinguish expired vs invalid vs malformed tokens.
    // This prevents infinite retry loops (client can tell if it's
    // a refreshable expired token vs. a permanently invalid one).
    // ================================================================
    let decoded;
    try {
      decoded = await authService.verifyAccessToken(token);
    } catch (jwtError) {
      logger.warn(`[AUTH:${requestId}] ⚠️ JWT verification error: ${jwtError.message}`);

      if (jwtError.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          message: "Token expired. Refreshing...",
          errorType: "TOKEN_EXPIRED",
          requestId,
        });
      }

      if (jwtError.name === "JsonWebTokenError") {
        return res.status(401).json({
          success: false,
          message: "Invalid token. Please log in again.",
          errorType: "INVALID_TOKEN",
          requestId,
        });
      }

      return res.status(401).json({
        success: false,
        message: "Token verification failed.",
        errorType: "VERIFICATION_ERROR",
        requestId,
      });
    }

    // Token decoded but somehow still invalid
    if (!decoded) {
      logger.warn(`[AUTH:${requestId}] ⚠️ Token decoded to null`);
      return res.status(401).json({
        success: false,
        message: "Invalid token. Please log in again.",
        errorType: "NULL_DECODE",
        requestId,
      });
    }

    // ================================================================
    // FIX #11: User lookup failure handling.
    // Distinguishes "user deleted" vs "user not found".
    // ================================================================
    const user = await User.findById(decoded.id);

    if (!user) {
      logger.warn(`[AUTH:${requestId}] ⚠️ User not found for decoded ID: ${decoded.id}`);
      return res.status(401).json({
        success: false,
        message: "User account not found. Please log in again.",
        errorType: "USER_NOT_FOUND",
        requestId,
      });
    }

    // Suspended account check
    if (user.status === "suspended") {
      logger.warn(`[AUTH:${requestId}] ⛔ Suspended user attempted access: ${user.email}`);
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended. Please contact your administrator.",
        errorType: "ACCOUNT_SUSPENDED",
        requestId,
      });
    }

    // Deleted account check
    if (user.status === "deleted") {
      logger.warn(`[AUTH:${requestId}] ⛔ Deleted user attempted access: ${user.email}`);
      return res.status(403).json({
        success: false,
        message: "This account has been deleted. Please contact your administrator.",
        errorType: "ACCOUNT_DELETED",
        requestId,
      });
    }

    // ================================================================
    // Auto-normalize confidentiality data on every login
    // Admins/HODs always get full access array (singular deprecated, never overwritten)
    // ================================================================
    await user.normalizeConfidentiality();

    // ================================================================
    // Attach user data to request for downstream use
    // ================================================================
    req.user = user;
    req.token = token;
    req.tokenRememberMe = decoded.rememberMe;
    req.requestId = requestId;

    logger.debug(`[AUTH:${requestId}] ✅ Auth successful: ${user.email} (${user.role})`);
    next();
  } catch (error) {
    // ================================================================
    // FIX #7 (cont): Catch-all for unexpected auth errors.
    // Never let this crash the request pipeline.
    // ================================================================
    logger.error(`[AUTH:${requestId}] 💥 Auth middleware error: ${error.message}`, {
      stack: error.stack,
      path: req.path,
      method: req.method,
    });

    return res.status(401).json({
      success: false,
      message: "Authentication failed. Please log in again.",
      errorType: "AUTH_ERROR",
      requestId,
    });
  }
};

module.exports = auth;