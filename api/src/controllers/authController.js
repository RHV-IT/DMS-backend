const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const DeviceInfoExtractor = require("../utils/deviceInfo");
const authService = require("../services/authService");
const { validationResult } = require("express-validator");
const { createAuditLog } = require("../middlewares/auditMiddleware");
const { userOperations } = require("../utils/databaseUtils");
const logger = require("../config/logger");

const authController = {
  /**
   * User Registration
   * Creates a new user account and returns tokens
   */
  register: async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { name, email, password, department } = req.body;

      const existingUser = await userOperations.findOne({ email });

      if (existingUser) {
        if (existingUser.status === "deleted") {
          return res.status(400).json({
            success: false,
            message: "This account was deleted. Please contact administrator to restore.",
          });
        }
        return res.status(400).json({ success: false, message: "User already exists" });
      }

      const user = await User.create({
        name,
        email,
        password,
        department,
        role: "user",
        confidentialityLevels: ["public", "internal"],
        passwordLastChanged: new Date(),
      });

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      // Store refresh token in database
      user.refreshToken = refreshToken;
      await user.save();

      await user.addToPasswordHistory();

      const deviceInfo = req.deviceInfo || DeviceInfoExtractor.extractFromRequest(req);
      const summary = `${user.name} registered from ${deviceInfo.machine?.machineName || deviceInfo.device?.deviceName || "Unknown Device"}`;

      await AuditLog.create({
        ...deviceInfo,
        userId: user._id,
        userEmail: user.email,
        action: "login",
        resource: "auth",
        details: { method: "registration" },
        summary,
      });

      const cookieConfig = authService.getCookieConfig();

      // FIX: Set cookie using the SAME config as the cookie parser expects
      res.cookie("token", accessToken, cookieConfig);

      logger.info(`[AUTH:REGISTER] New user registered: ${email}`);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            loginCount: user.loginCount,
          },
          accessToken,
          refreshToken,
          rememberMe: false,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * User Login
   * Authenticates user and returns tokens
   *
   * FIX #3: Proper credential handling and cookie management.
   * FIX #9: Login failure logging for repeated login attempt detection.
   */
  login: async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(2, 8);

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { email, password, rememberMe } = req.body;

      logger.info(`[AUTH:LOGIN:${requestId}] Login attempt for: ${email} from origin: ${req.headers.origin || "unknown"}`);

      const user = await userOperations.findOne({ email });

      // Account deleted check
      if (!user) {
        await AuditLog.create({
          userId: null,
          userEmail: email,
          action: "failed_login",
          resource: "auth",
          details: { method: "password", success: false, reason: "user_not_found", rememberMe },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        logger.warn(`[AUTH:LOGIN:${requestId}] User not found: ${email}`);
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      // Deleted account
      if (user.status === "deleted") {
        const deviceInfo = req.deviceInfo || DeviceInfoExtractor.extractFromRequest(req);
        const summary = `${email} attempted login from ${deviceInfo.machine?.machineName || "Unknown Device"} (Account Deleted)`;

        await AuditLog.create({
          ...deviceInfo,
          userId: user._id,
          userEmail: user.email,
          action: "failed_login",
          resource: "auth",
          details: { method: "password", success: false, reason: "account_deleted", rememberMe },
        });

        return res.status(403).json({
          success: false,
          message: "This account has been deleted. Please contact your administrator.",
        });
      }

      // Suspended account
      if (user.status === "suspended") {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: "login",
          resource: "auth",
          details: { method: "password", success: false, reason: "account_suspended", rememberMe },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        return res.status(403).json({
          success: false,
          message: "Your account has been suspended. Please contact your administrator.",
        });
      }

      // Password verification
      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        await AuditLog.create({
          userId: user._id,
          userEmail: user.email,
          action: "login",
          resource: "auth",
          details: { method: "password", success: false, rememberMe },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        });

        logger.warn(`[AUTH:LOGIN:${requestId}] Invalid password for: ${email}`);
        return res.status(401).json({ success: false, message: "Invalid email or password" });
      }

      // Generate tokens
      const accessToken = authService.generateAccessToken(user, rememberMe);
      const refreshToken = authService.generateRefreshToken(user);

      // Store refresh token in database (this invalidates any previous refresh tokens)
      user.refreshToken = refreshToken;
      user.loginCount = (user.loginCount || 0) + 1;
      user.rememberMe = rememberMe;
      await user.save();

      // Check password expiry
      const passwordExpired = await authService.checkPasswordExpiry(user);

      await createAuditLog(req, user, "login", "auth", null, { method: "password", success: true, rememberMe });

      logger.info(`[AUTH:LOGIN:${requestId}] Successful login: ${email} (login #${user.loginCount})`);

      // FIX #4: Cookie configuration with proper CORS support
      const cookieConfig = authService.getCookieConfig(rememberMe);

      // FIX #12: Clear any existing cookie before setting new one
      // This prevents stale cookie conflicts
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        path: "/",
      });

      // Set the new token cookie
      res.cookie("token", accessToken, cookieConfig);

      const isFirstLogin = user.loginCount === 1;
      const agentRequired = true; // Scanner agent is always required for this system
      const agentConnected = user.agentConnected || false;
      const mustDownloadAgent = !agentConnected; // If not connected, must download

      res.json({
        success: true,
        data: {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            loginCount: user.loginCount,
            passwordExpired,
          },
          accessToken,
          refreshToken,
          rememberMe,
        },
        loginCount: user.loginCount,
        isFirstLogin,
        agentRequired,
        agentConnected,
        mustDownloadAgent,
      });
    } catch (error) {
      logger.error(`[AUTH:LOGIN:${requestId}] Error: ${error.message}`, { stack: error.stack });
      next(error);
    }
  },

  /**
   * User Logout
   * Clears server-side session and cookie
   *
   * FIX #8: Proper logout that clears:
   * 1. Refresh token in database (immediate invalidation)
   * 2. Cookie on client side
   * 3. All token references
   */
  logout: async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    const isProduction = process.env.NODE_ENV === "production";

    try {
      // Invalidate refresh token server-side
      if (req.user) {
        await authService.logout(req.user._id, req.ip, req.get("user-agent"));
        await createAuditLog(req, req.user, "logout", "auth", null, { method: "logout" });
        logger.info(`[AUTH:LOGOUT:${requestId}] User ${req.user.email} logged out`);
      }

      // Clear cookie with EXACT same config used to set it
      // Using the same options ensures the browser can find and remove the cookie
      res.clearCookie("token", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
        // Don't set domain - let it default to current domain
      });

      // Also clear any alternate cookie names that might exist
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
      });

      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      logger.error(`[AUTH:LOGOUT:${requestId}] Error: ${error.message}`, { stack: error.stack });
      next(error);
    }
  },

  /**
   * Token Refresh
   *
   * FIX #10: Accepts refresh token from MULTIPLE sources:
   * 1. Request body (traditional: { refreshToken: "..." })
   * 2. Cookie (automatic refresh: req.cookies.refreshToken)
   * 3. Authorization header (Bearer refreshToken)
   *
   * This enables the frontend to refresh tokens without
   * exposing the refresh token in request bodies.
   */
  refreshToken: async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(2, 8);

    try {
      logger.debug(`[AUTH:REFRESH:${requestId}] Token refresh requested from origin: ${req.headers.origin}`);

      // Get refresh token from body, cookie, or header
      let refreshToken = req.body?.refreshToken;

      if (!refreshToken && req.cookies?.refreshToken) {
        refreshToken = req.cookies.refreshToken;
        logger.debug(`[AUTH:REFRESH:${requestId}] Using refresh token from cookie`);
      }

      if (!refreshToken && req.headers.authorization?.startsWith("Bearer ")) {
        // Some clients send refresh token in Authorization header
        // Distinguish from access token by length/prefix
        refreshToken = req.headers.authorization.split(" ")[1];
        logger.debug(`[AUTH:REFRESH:${requestId}] Using refresh token from Authorization header`);
      }

      if (!refreshToken) {
        logger.warn(`[AUTH:REFRESH:${requestId}] No refresh token provided`);
        return res.status(400).json({ success: false, message: "Refresh token required" });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      // Set new access token as cookie
      const cookieConfig = authService.getCookieConfig();
      res.cookie("token", result.accessToken, cookieConfig);

      logger.info(`[AUTH:REFRESH:${requestId}] Token refreshed successfully for user: ${result.user.email}`);

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
          user: result.user,
          refreshToken: result.refreshToken || refreshToken, // Keep same refresh token (rotation optional)
        },
      });
    } catch (error) {
      logger.warn(`[AUTH:REFRESH:${requestId}] Token refresh failed: ${error.message}`);

      // On refresh failure, clear corrupted cookies
      const isProduction = process.env.NODE_ENV === "production";
      res.clearCookie("token", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
      });
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
      });

      return res.status(401).json({
        success: false,
        message: error.message || "Session expired. Please log in again.",
        errorType: "REFRESH_FAILED",
        requestId,
      });
    }
  },

  /**
   * Change Password
   */
  changePassword: async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(2, 8);

    try {
      const { currentPassword, newPassword } = req.body;
      const user = req.user;

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        logger.warn(`[AUTH:CHANGE-PASS:${requestId}] Current password incorrect for user: ${user.email}`);
        return res.status(401).json({ success: false, message: "Current password is incorrect" });
      }

      if (await user.isPasswordUsedBefore(newPassword)) {
        return res.status(400).json({
          success: false,
          message: "Cannot reuse any of your last passwords",
        });
      }

      user.password = newPassword;
      await user.addToPasswordHistory();
      await user.save();

      await AuditLog.create({
        userId: user._id,
        userEmail: user.email,
        action: "user_update",
        resource: "password",
        details: { action: "password_change" },
      });

      logger.info(`[AUTH:CHANGE-PASS:${requestId}] Password changed successfully for user: ${user.email}`);

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get User Profile
   */
  getProfile: async (req, res, next) => {
    try {
      const user = await User.findById(req.user._id).select("-password -passwordHistory -refreshToken");
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update User Profile
   */
  updateProfile: async (req, res, next) => {
    try {
      const { name, department } = req.body;
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { name, department, updatedAt: new Date() },
        { new: true }
      ).select("-password -passwordHistory -refreshToken");

      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = authController;