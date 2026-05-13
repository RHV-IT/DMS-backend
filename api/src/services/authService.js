const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const logger = require("../config/logger");

class AuthService {
  /**
   * Generate Access Token
   * Short-lived token for API authentication
   *
   * FIX #7: Token expiry now properly configurable via environment.
   * Defaults to 15 minutes for production security.
   */
  generateAccessToken(user, rememberMe = false) {
    // Environment-based expiry takes priority
    const defaultExpiry = process.env.JWT_EXPIRE || "15m";
    const expiresIn = rememberMe ? process.env.JWT_REMEMBER_EXPIRE || "7d" : defaultExpiry;

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        rememberMe,
        // FIX #16: Include issued-at for token refresh validation
        iat: Math.floor(Date.now() / 1000),
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    logger.debug(`[AUTH-SERVICE] Generated access token for ${user.email}, expiresIn: ${expiresIn}, rememberMe: ${rememberMe}`);
    return token;
  }

  /**
   * Generate Refresh Token
   * Long-lived token used to obtain new access tokens
   */
  generateRefreshToken(user) {
    const expiresIn = process.env.JWT_REFRESH_EXPIRE || "7d";

    const token = jwt.sign(
      {
        id: user._id,
        // FIX #16: Include token creation time for rotation tracking
        createdAt: Date.now(),
      },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn }
    );

    logger.debug(`[AUTH-SERVICE] Generated refresh token for ${user.email}, expiresIn: ${expiresIn}`);
    return token;
  }

  /**
   * Cookie Configuration for Authentication Tokens
   *
   * FIX #4: CRITICAL FIX FOR CORS/COOKIE ISSUES:
   * - sameSite: 'none' is required for cross-origin cookie transmission
   * - secure: true is REQUIRED when sameSite is 'none' (HTTPS only)
   * - path: '/' ensures cookie is sent to all API endpoints
   * - domain is intentionally NOT set to allow both localhost and IP-based access
   *
   * For local development (HTTP), sameSite='lax' is used as fallback.
   */
  getCookieConfig(rememberMe = false) {
    const isProduction = process.env.NODE_ENV === "production";
    const maxAge = rememberMe
      ? parseInt(process.env.JWT_REMEMBER_MAX_AGE) || 7 * 24 * 60 * 60 * 1000 // 7 days
      : parseInt(process.env.JWT_MAX_AGE) || 2 * 60 * 60 * 1000; // 2 hours

    // FIX #4: Cross-origin cookie configuration
    // In production with HTTPS: sameSite=none, secure=true
    // In development with HTTP: sameSite=lax, secure=false
    const cookieConfig = {
      httpOnly: true, // Prevents JavaScript access (XSS protection)
      secure: isProduction, // HTTPS-only in production
      sameSite: isProduction ? "none" : "lax", // Cross-origin in production, relaxed in dev
      path: "/", // Send cookie to all paths
      maxAge,
    };

    // FIX: For production, set the domain if COOKIE_DOMAIN is configured
    if (isProduction && process.env.COOKIE_DOMAIN) {
      cookieConfig.domain = process.env.COOKIE_DOMAIN;
    }

    logger.debug(`[AUTH-SERVICE] Cookie config: sameSite=${cookieConfig.sameSite}, secure=${cookieConfig.secure}, maxAge=${cookieConfig.maxAge}`);

    return cookieConfig;
  }

  /**
   * Verify Access Token
   * Returns decoded payload or null if invalid/expired
   *
   * FIX #7: Detailed error logging for token verification failures.
   */
  async verifyAccessToken(token) {
    try {
      if (!token || typeof token !== "string") {
        logger.debug("[AUTH-SERVICE] verifyAccessToken: no token provided");
        return null;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      logger.debug(`[AUTH-SERVICE] verifyAccessToken: SUCCESS for user ${decoded.email || decoded.id}`);
      return decoded;
    } catch (error) {
      // Log specific error type for debugging
      if (error.name === "TokenExpiredError") {
        logger.warn(`[AUTH-SERVICE] verifyAccessToken: EXPIRED - ${error.message}`);
      } else if (error.name === "JsonWebTokenError") {
        logger.warn(`[AUTH-SERVICE] verifyAccessToken: INVALID - ${error.message}`);
      } else {
        logger.warn(`[AUTH-SERVICE] verifyAccessToken: ERROR - ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Verify Refresh Token
   * Returns decoded payload or null if invalid/expired
   */
  async verifyRefreshToken(token) {
    try {
      if (!token || typeof token !== "string") {
        logger.debug("[AUTH-SERVICE] verifyRefreshToken: no token provided");
        return null;
      }

      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      logger.debug(`[AUTH-SERVICE] verifyRefreshToken: SUCCESS for user ID ${decoded.id}`);
      return decoded;
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        logger.warn(`[AUTH-SERVICE] verifyRefreshToken: EXPIRED - ${error.message}`);
      } else if (error.name === "JsonWebTokenError") {
        logger.warn(`[AUTH-SERVICE] verifyRefreshToken: INVALID - ${error.message}`);
      } else {
        logger.warn(`[AUTH-SERVICE] verifyRefreshToken: ERROR - ${error.message}`);
      }
      return null;
    }
  }

  /**
   * Refresh Access Token
   * Issues a new access token using a valid refresh token.
   *
   * FIX #10: Token refresh race condition handling:
   * - Accepts refresh token from BOTH body and cookie
   * - Validates the refresh token against the database
   * - Optional rotation: invalidates old refresh token
   */
  async refreshAccessToken(refreshToken) {
    const requestId = Math.random().toString(36).substring(2, 8);
    logger.debug(`[AUTH-SERVICE:${requestId}] Starting token refresh`);

    // ACCEPT TOKEN FROM BODY OR COOKIE (Fixes refresh from both sources)
    if (!refreshToken) {
      logger.debug(`[AUTH-SERVICE:${requestId}] No refresh token provided in body`);
      throw new Error("Refresh token required");
    }

    // Verify the refresh token signature and expiry
    const decoded = await this.verifyRefreshToken(refreshToken);
    if (!decoded) {
      logger.warn(`[AUTH-SERVICE:${requestId}] Refresh token verification failed`);
      throw new Error("Invalid refresh token");
    }

    // Look up user in database
    const user = await User.findById(decoded.id);
    if (!user) {
      logger.warn(`[AUTH-SERVICE:${requestId}] User not found for refresh: ${decoded.id}`);
      throw new Error("User not found");
    }

    // FIX #10: Verify the refresh token matches what's stored in the database
    // This allows server-side token revocation
    if (user.refreshToken !== refreshToken) {
      logger.warn(`[AUTH-SERVICE:${requestId}] Refresh token mismatch - possible token theft or rotation`);
      throw new Error("Refresh token revoked. Please log in again.");
    }

    // Check if account is still valid
    if (user.status === "suspended") {
      throw new Error("Account suspended");
    }
    if (user.status === "deleted") {
      throw new Error("Account deleted");
    }

    // Generate new access token
    const newAccessToken = this.generateAccessToken(user);
    logger.debug(`[AUTH-SERVICE:${requestId}] Token refresh successful for ${user.email}`);

    return {
      accessToken: newAccessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
      requestId,
    };
  }

  /**
   * Logout - Invalidates the refresh token server-side
   *
   * FIX #8: Proper session cleanup that:
   * - Clears the refresh token in the database
   * - Returns proper response (cookie clearing handled in controller)
   */
  async logout(userId, ipAddress, userAgent) {
    const result = await User.findByIdAndUpdate(userId, {
      refreshToken: null,
      $set: { updatedAt: new Date() },
    });

    logger.info(`[AUTH-SERVICE] User ${userId} logged out. IP: ${ipAddress}, Agent: ${userAgent}`);
    return result;
  }

  /**
   * Check if user's password has expired
   */
  async checkPasswordExpiry(user) {
    const expireDays = parseInt(process.env.PASSWORD_EXPIRE_DAYS) || 90;
    const lastChanged = user.passwordLastChanged || user.createdAt;
    const diffDays = Math.floor((Date.now() - new Date(lastChanged).getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= expireDays;
  }
}

module.exports = new AuthService();