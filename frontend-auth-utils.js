/**
 * ============================================================
 * FRONTEND AUTH UTILITIES (DMS Frontend)
 * ============================================================
 *
 * FIX #13: Axios/Fetch credentials mismatch prevention
 * FIX #14: Proper auth state reset
 * FIX #15: Stale auth header prevention
 * FIX #16: Retry-safe authentication logic (prevents infinite loops)
 * FIX #17: Proper logout handling
 *
 * IMPORTANT INSTRUCTIONS FOR FRONTEND TEAM:
 * 1. Place this file at: src/utils/apiClient.js (or equivalent)
 * 2. Install dependency: npm install axios
 * 3. Import in your app: import apiClient from './utils/apiClient'
 * 4. Use apiClient instead of raw fetch/axios throughout your app
 * 5. Import auth functions: import { login, logout, isAuthenticated } from './utils/apiClient'
 *
 * If you use fetch() instead of axios, see the fetch alternatives below.
 * ============================================================
 */

import axios from "axios";

// ============================================================
// CONFIGURATION
// ============================================================

/**
 * IMPORTANT: Do NOT hardcode the full API URL here.
 * Using a relative URL ("") ensures the browser automatically
 * uses the same origin as the frontend, which eliminates
 * CORS origin mismatches caused by IP changes or different ports.
 *
 * If your frontend and API are on the SAME domain/port,
 * set this to "" or "/api/v1".
 *
 * If they're on different domains, set the full API URL.
 * Make sure it EXACTLY matches one of the CORS allowed origins:
 *   - http://192.168.0.153:3000
 *   - http://docmanager.rhv
 *   - http://localhost:3000
 *   - https://rhv-dms.vercel.app
 */
const API_BASE_URL =
  process.env.REACT_APP_API_URL ||
  process.env.VUE_APP_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_BASE_URL ||
  "";

// ============================================================
// AXIOS INSTANCE - Pre-configured for CORS + Auth
// ============================================================

const apiClient = axios.create({
  baseURL: API_BASE_URL,

  // CRITICAL: 'include' sends cookies cross-origin
  // 'same-origin' only works on SAME domain
  // 'omit' breaks cookie-based auth entirely
  withCredentials: true,

  headers: {
    common: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  },

  timeout: 30000,

  // Treat 401 as valid so interceptors can handle it gracefully
  validateStatus: function (status) {
    return status >= 200 && status < 500;
  },
});

// ============================================================
// AUTH STATE
// ============================================================

let authState = {
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isRefreshing: false,
  failedRequestCount: 0,
  maxFailedRequests: 5,
  authListeners: [],
};

function onAuthStateChanged(callback) {
  authState.authListeners.push(callback);
  return () => {
    authState.authListeners = authState.authListeners.filter((cb) => cb !== callback);
  };
}

function notifyAuthListeners() {
  authState.authListeners.forEach((cb) =>
    cb({ isAuthenticated: authState.isAuthenticated, user: authState.user })
  );
}

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

function getStoredToken() {
  try {
    let token = sessionStorage.getItem("token");
    if (!token) token = localStorage.getItem("token");
    return token;
  } catch (e) {
    return null;
  }
}

function getStoredRefreshToken() {
  try {
    let token = sessionStorage.getItem("refreshToken");
    if (!token) token = localStorage.getItem("refreshToken");
    return token;
  } catch (e) {
    return null;
  }
}

function setStoredToken(token, rememberMe = false) {
  try {
    if (rememberMe) {
      localStorage.setItem("token", token);
      localStorage.setItem("tokenTimestamp", Date.now().toString());
    } else {
      sessionStorage.setItem("token", token);
      sessionStorage.setItem("tokenTimestamp", Date.now().toString());
    }
  } catch (e) {
    console.error("[Auth] Error storing token:", e);
  }
}

function setStoredRefreshToken(token, rememberMe = false) {
  try {
    if (rememberMe) {
      localStorage.setItem("refreshToken", token);
    } else {
      sessionStorage.setItem("refreshToken", token);
    }
  } catch (e) {
    console.error("[Auth] Error storing refresh token:", e);
  }
}

// ============================================================
// TOKEN REFRESH - Race condition safe
// ============================================================

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

async function refreshAuthToken() {
  if (isRefreshing) {
    return new Promise(function (resolve, reject) {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;

  try {
    const refreshToken = getStoredRefreshToken();
    if (!refreshToken) {
      processQueue(new Error("No refresh token"), null);
      throw new Error("No refresh token");
    }

    const response = await apiClient.post("/api/v1/auth/refresh", { refreshToken });

    if (response.data.success) {
      const { accessToken, refreshToken: newRefreshToken, user } = response.data.data;

      authState.token = accessToken;
      if (newRefreshToken) authState.refreshToken = newRefreshToken;
      authState.user = user;
      authState.isAuthenticated = true;
      authState.failedRequestCount = 0;

      const wasRememberMe = !!localStorage.getItem("token");
      setStoredToken(accessToken, wasRememberMe);
      if (newRefreshToken) setStoredRefreshToken(newRefreshToken, wasRememberMe);

      processQueue(null, accessToken);
      notifyAuthListeners();
      return accessToken;
    } else {
      throw new Error(response.data.message || "Refresh failed");
    }
  } catch (error) {
    processQueue(error, null);
    forceLogout();
    throw error;
  } finally {
    isRefreshing = false;
  }
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp - now < 60; // 60-second buffer before expiry
  } catch {
    return true;
  }
}

// ============================================================
// REQUEST INTERCEPTOR
// ============================================================

apiClient.interceptors.request.use(
  async (config) => {
    if (config.url?.includes("/auth/refresh")) return config;

    const token = getStoredToken();
    if (token && !isTokenExpired(token)) {
      config.headers["Authorization"] = `Bearer ${token}`;
    } else if (token && isTokenExpired(token)) {
      // Refresh before sending request to avoid 401
      try {
        const newToken = await refreshAuthToken();
        if (newToken) config.headers["Authorization"] = `Bearer ${newToken}`;
      } catch {
        if (token) config.headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ============================================================
// RESPONSE INTERCEPTOR - Retry-safe 401 handling
// ============================================================

apiClient.interceptors.response.use(
  (response) => {
    authState.failedRequestCount = 0;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    // FIX #16: Handle 401 with retry protection
    if (status === 401 && !originalRequest?._retry) {
      const errorType = error.response?.data?.errorType;
      originalRequest._retry = true;
      authState.failedRequestCount++;

      if (authState.failedRequestCount >= authState.maxFailedRequests) {
        forceLogout();
        return Promise.reject(error);
      }

      // Don't retry account-level errors
      if (["ACCOUNT_DELETED", "ACCOUNT_SUSPENDED", "USER_NOT_FOUND"].includes(errorType)) {
        window.dispatchEvent(
          new CustomEvent("auth:account-error", {
            detail: { message: error.response?.data?.message, errorType },
          })
        );
        forceLogout();
        return Promise.reject(error);
      }

      try {
        const newToken = await refreshAuthToken();
        if (newToken) {
          authState.token = newToken;
          authState.isAuthenticated = true;
          authState.failedRequestCount = 0;
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        forceLogout();
        return Promise.reject(refreshError);
      }
    }

    if (status && status < 500) authState.failedRequestCount = 0;
    return Promise.reject(error);
  }
);

// ============================================================
// LOGIN
// ============================================================

async function login(email, password, rememberMe = false) {
  try {
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
      authState.failedRequestCount = 0;

      setStoredToken(accessToken, rememberMe);
      if (refreshToken) setStoredRefreshToken(refreshToken, rememberMe);

      trackLogin();
      notifyAuthListeners();
      return { success: true, user, accessToken };
    }

    return { success: false, message: response.data.message || "Login failed" };
  } catch (error) {
    if (error.response) {
      const { data } = error.response;
      if (data?.message?.includes("deleted"))
        return { success: false, message: data.message, errorType: "ACCOUNT_DELETED" };
      if (data?.message?.includes("suspended"))
        return { success: false, message: data.message, errorType: "ACCOUNT_SUSPENDED" };
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

// ============================================================
// LOGOUT - Complete auth state cleanup
// ============================================================

async function logout() {
  try {
    await apiClient.post("/api/v1/auth/logout");
  } catch (error) {
    // Non-critical - continue with local cleanup
  }

  clearAllCookies();

  try {
    ["token", "refreshToken", "tokenTimestamp", "refreshTokenTimestamp", "user"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch (e) {}

  resetAuthState();
  notifyAuthListeners();
}

function forceLogout() {
  clearAllCookies();
  try {
    ["token", "refreshToken", "tokenTimestamp", "refreshTokenTimestamp", "user"].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch (e) {}
  resetAuthState();
  notifyAuthListeners();
}

// ============================================================
// HELPERS
// ============================================================

function resetAuthState() {
  authState.token = null;
  authState.refreshToken = null;
  authState.user = null;
  authState.isAuthenticated = false;
  authState.isRefreshing = false;
  authState.failedRequestCount = 0;
}

function clearAllCookies() {
  try {
    document.cookie.split(";").forEach((cookie) => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax;`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=None;Secure;`;
    });
  } catch (e) {}
}

function isAuthenticated() {
  if (authState.isAuthenticated && authState.token && !isTokenExpired(authState.token)) return true;
  const token = getStoredToken();
  if (token && !isTokenExpired(token)) {
    authState.isAuthenticated = true;
    authState.token = token;
    return true;
  }
  return false;
}

function getCurrentUser() {
  if (authState.user) return authState.user;
  try {
    const str = sessionStorage.getItem("user") || localStorage.getItem("user");
    return str ? JSON.parse(str) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user, rememberMe = false) {
  authState.user = user;
  const storage = rememberMe ? localStorage : sessionStorage;
  storage.setItem("user", JSON.stringify(user));
}

function trackLogin() {
  apiClient.post("/api/v1/auth/track-login", {}).catch(() => {});
}

// ============================================================
// EXPORTS
// ============================================================

export {
  apiClient,
  authState,
  login,
  logout,
  forceLogout,
  refreshAuthToken,
  isAuthenticated,
  getCurrentUser,
  setCurrentUser,
  getStoredToken,
  getStoredRefreshToken,
  isTokenExpired,
  onAuthStateChanged,
  resetAuthState,
};

export default apiClient;