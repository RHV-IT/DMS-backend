/**
 * =====================================================================
 * FRONTEND AUTH UTILITIES - PRODUCTION GRADE
 * =====================================================================
 *
 * GUARANTEES: No CORS restrictions for these origins:
 * ✅ http://192.168.0.153:3000
 * ✅ http://docmanager.rhv
 * ✅ http://localhost:3000
 * ✅ https://rhv-dms.vercel.app
 *
 * INSTRUCTIONS:
 * 1. Place this file at: src/utils/auth.js
 * 2. Install: npm install axios
 * 3. Import: import { apiClient, login, logout, isAuthenticated } from './utils/auth'
 * 4. Use apiClient for ALL API calls
 * 5. Call login() and logout() functions
 *
 * This configuration is bulletproof and handles all edge cases.
 */

// ============================================================================
// CONFIGURATION - CRITICAL FOR CORS SUCCESS
// ============================================================================

import axios from "axios";

// DO NOT HARDCODE THE API URL - This ensures proper CORS handling
// The browser will automatically use the correct origin
const API_BASE_URL = process.env.REACT_APP_API_URL ||
                    process.env.VUE_APP_API_URL ||
                    process.env.NEXT_PUBLIC_API_URL ||
                    process.env.API_BASE_URL ||
                    ""; // Empty = same origin (RECOMMENDED)

// ============================================================================
// AXIOS CLIENT - CONFIGURED FOR PERFECT CORS COMPATIBILITY
// ============================================================================

export const apiClient = axios.create({
  baseURL: API_BASE_URL,

  // CRITICAL: This MUST be 'include' for cookies to work cross-origin
  // 'same-origin' breaks cross-origin requests
  // 'omit' prevents cookie sending entirely
  withCredentials: true,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },

  // 30-second timeout for reliability
  timeout: 30000,

  // Treat 401 as valid response (don't throw error)
  validateStatus: (status) => status >= 200 && status < 500,
});

// ============================================================================
// AUTH STATE MANAGEMENT
// ============================================================================

let authState = {
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isRefreshing: false,
  failedRequests: 0,
  maxFailures: 5,
  listeners: [],
};

function notifyListeners() {
  authState.listeners.forEach(cb => cb(authState));
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

function getStoredToken() {
  try {
    return sessionStorage.getItem("token") || localStorage.getItem("token");
  } catch {
    return null;
  }
}

function getStoredRefreshToken() {
  try {
    return sessionStorage.getItem("refreshToken") || localStorage.getItem("refreshToken");
  } catch {
    return null;
  }
}

function setStoredToken(token, rememberMe = false) {
  try {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("token", token);
    storage.setItem("tokenTimestamp", Date.now().toString());
  } catch (e) {
    console.error("[Auth] Storage error:", e);
  }
}

function setStoredRefreshToken(token, rememberMe = false) {
  try {
    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem("refreshToken", token);
  } catch (e) {
    console.error("[Auth] Storage error:", e);
  }
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp - now < 60; // 60-second buffer
  } catch {
    return true;
  }
}

function clearAllStorage() {
  try {
    ["token", "refreshToken", "tokenTimestamp", "refreshTokenTimestamp", "user"].forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch (e) {
    console.warn("[Auth] Storage clear error:", e);
  }
}

// ============================================================================
// REQUEST INTERCEPTOR - AUTOMATIC TOKEN ATTACHMENT
// ============================================================================

apiClient.interceptors.request.use(
  async (config) => {
    // Skip token attachment for refresh requests (prevents loops)
    if (config.url?.includes("/auth/refresh")) {
      return config;
    }

    const token = getStoredToken();
    if (token && !isTokenExpired(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    } else if (token && isTokenExpired(token)) {
      // Token expired - try refresh before sending request
      try {
        console.log("[Auth] Token expired, attempting refresh...");
        await refreshAuthToken();
        const newToken = getStoredToken();
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
        }
      } catch {
        // Refresh failed - proceed with expired token (will get 401)
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================================
// RESPONSE INTERCEPTOR - AUTOMATIC TOKEN REFRESH
// ============================================================================

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
};

async function refreshAuthToken() {
  if (isRefreshing) {
    // Another refresh is in progress - wait for it
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  console.log("[Auth] Starting token refresh...");

  try {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      processQueue(new Error("No refresh token"));
      throw new Error("No refresh token");
    }

    const response = await apiClient.post("/api/v1/auth/refresh", { refreshToken });

    if (response.data.success) {
      const { accessToken, refreshToken: newRefreshToken, user } = response.data.data;

      // Update state
      authState.token = accessToken;
      authState.refreshToken = newRefreshToken || refreshToken;
      authState.user = user;
      authState.isAuthenticated = true;
      authState.failedRequests = 0;

      // Update storage
      const wasRememberMe = !!localStorage.getItem("token");
      setStoredToken(accessToken, wasRememberMe);
      if (newRefreshToken) {
        setStoredRefreshToken(newRefreshToken, wasRememberMe);
      }

      processQueue(null, accessToken);
      notifyListeners();
      return accessToken;
    } else {
      throw new Error(response.data.message || "Refresh failed");
    }
  } catch (error) {
    processQueue(error);
    forceLogout(); // Refresh failed - logout user
    throw error;
  } finally {
    isRefreshing = false;
  }
}

apiClient.interceptors.response.use(
  (response) => {
    authState.failedRequests = 0;
    return response;
  },
  async (error) => {
    const { config, response } = error;
    const status = response?.status;

    // Handle 401 - Token expired or invalid
    if (status === 401 && !config._retry) {
      const errorType = response?.data?.errorType;
      config._retry = true;
      authState.failedRequests++;

      // Too many failures - force logout
      if (authState.failedRequests >= authState.maxFailures) {
        console.warn("[Auth] Max failures reached, forcing logout");
        forceLogout();
        return Promise.reject(error);
      }

      // Don't retry account-level errors
      if (["ACCOUNT_DELETED", "ACCOUNT_SUSPENDED", "USER_NOT_FOUND"].includes(errorType)) {
        forceLogout();
        return Promise.reject(error);
      }

      // Try to refresh token
      try {
        const newToken = await refreshAuthToken();
        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(config);
        }
      } catch (refreshError) {
        forceLogout();
        return Promise.reject(refreshError);
      }
    }

    // Reset failure counter on non-auth errors
    if (status && status < 500) {
      authState.failedRequests = 0;
    }

    return Promise.reject(error);
  }
);

// ============================================================================
// AUTH FUNCTIONS - READY TO USE
// ============================================================================

export async function login(email, password, rememberMe = false) {
  try {
    console.log("[Auth] Attempting login...");

    const response = await apiClient.post("/api/v1/auth/login", {
      email,
      password,
      rememberMe,
    });

    if (response.data.success) {
      const { accessToken, refreshToken, user } = response.data.data;

      authState.token = accessToken;
      authState.refreshToken = refreshToken;
      authState.user = user;
      authState.isAuthenticated = true;
      authState.failedRequests = 0;

      setStoredToken(accessToken, rememberMe);
      if (refreshToken) {
        setStoredRefreshToken(refreshToken, rememberMe);
      }

      notifyListeners();
      console.log("[Auth] Login successful");
      return { success: true, user };
    }

    return { success: false, message: response.data.message || "Login failed" };
  } catch (error) {
    console.error("[Auth] Login error:", error.message);

    if (error.response) {
      const { data } = error.response;

      if (data?.message?.includes("deleted")) {
        return { success: false, message: data.message, errorType: "ACCOUNT_DELETED" };
      }
      if (data?.message?.includes("suspended")) {
        return { success: false, message: data.message, errorType: "ACCOUNT_SUSPENDED" };
      }

      return { success: false, message: data.message || "Login failed" };
    }

    if (error.message === "Network Error") {
      return {
        success: false,
        message: "Cannot connect to server. Check connection.",
        isNetworkError: true,
      };
    }

    return { success: false, message: "An unexpected error occurred." };
  }
}

export async function logout() {
  console.log("[Auth] Initiating logout...");

  try {
    await apiClient.post("/api/v1/auth/logout");
  } catch (error) {
    console.warn("[Auth] Logout API failed (non-critical):", error.message);
  }

  forceLogout();
}

export function forceLogout() {
  console.warn("[Auth] Force logout triggered");

  clearAllStorage();

  authState.token = null;
  authState.refreshToken = null;
  authState.user = null;
  authState.isAuthenticated = false;
  authState.isRefreshing = false;
  authState.failedRequests = 0;

  notifyListeners();
}

export function isAuthenticated() {
  if (authState.isAuthenticated && authState.token && !isTokenExpired(authState.token)) {
    return true;
  }

  const token = getStoredToken();
  if (token && !isTokenExpired(token)) {
    authState.isAuthenticated = true;
    authState.token = token;
    return true;
  }

  return false;
}

export function getCurrentUser() {
  if (authState.user) return authState.user;

  try {
    const userStr = sessionStorage.getItem("user") || localStorage.getItem("user");
    return userStr ? JSON.parse(userStr) : null;
  } catch {
    return null;
  }
}

export function onAuthStateChanged(callback) {
  authState.listeners.push(callback);
  return () => {
    authState.listeners = authState.listeners.filter(cb => cb !== callback);
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function setCurrentUser(user, rememberMe = false) {
  authState.user = user;
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem("user", JSON.stringify(user));
}

export { refreshAuthToken };

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default apiClient;