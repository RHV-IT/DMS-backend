/**
 * FRONTEND AUTH UTILITIES - CORS COMPATIBLE
 * Includes x-browser header for complete CORS compatibility
 */

import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_API_URL ||
                    process.env.VUE_APP_API_URL ||
                    process.env.NEXT_PUBLIC_API_URL ||
                    process.env.API_BASE_URL ||
                    "";

// Create axios instance with CORS compatibility
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // CRITICAL: Sends cookies cross-origin
  headers: {
    "Content-Type": "application/json",
    "x-browser": "chrome", // REQUIRED: This header must be allowed by CORS
  },
});

// Auth state management
let authState = {
  token: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  failedRequests: 0,
  maxFailures: 5,
};

// Token management
function getStoredToken() {
  try {
    return sessionStorage.getItem("token") || localStorage.getItem("token");
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

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const payload = JSON.parse(atob(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    return payload.exp - now < 60;
  } catch {
    return true;
  }
}

// Request interceptor - attach token
api.interceptors.request.use(
  async (config) => {
    if (config.url?.includes("/auth/refresh")) return config;

    const token = getStoredToken();
    if (token && !isTokenExpired(token)) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle 401 and token refresh
api.interceptors.response.use(
  (response) => {
    authState.failedRequests = 0;
    return response;
  },
  async (error) => {
    const { config, response } = error;
    const status = response?.status;

    if (status === 401 && !config._retry) {
      config._retry = true;
      authState.failedRequests++;

      if (authState.failedRequests >= authState.maxFailures) {
        console.warn("[Auth] Max failures reached, forcing logout");
        forceLogout();
        return Promise.reject(error);
      }

      try {
        const refreshResponse = await api.post("/api/v1/auth/refresh");
        if (refreshResponse.data.success) {
          const newToken = refreshResponse.data.data.accessToken;
          authState.token = newToken;
          authState.isAuthenticated = true;
          authState.failedRequests = 0;

          const wasRememberMe = !!localStorage.getItem("token");
          setStoredToken(newToken, wasRememberMe);

          config.headers.Authorization = `Bearer ${newToken}`;
          return api(config);
        }
      } catch (refreshError) {
        forceLogout();
        return Promise.reject(refreshError);
      }
    }

    if (status && status < 500) authState.failedRequests = 0;
    return Promise.reject(error);
  }
);

// Auth functions
export async function login(email, password, rememberMe = false) {
  try {
    const response = await api.post("/api/v1/auth/login", {
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

      return { success: true, user };
    }

    return { success: false, message: response.data.message || "Login failed" };
  } catch (error) {
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
  try {
    await api.post("/api/v1/auth/logout");
  } catch (error) {
    console.warn("[Auth] Logout API failed (non-critical):", error.message);
  }
  forceLogout();
}

export function forceLogout() {
  try {
    ["token", "refreshToken", "tokenTimestamp", "refreshTokenTimestamp", "user"].forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch (e) {}

  // Clear cookies
  try {
    document.cookie.split(";").forEach(cookie => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax;`;
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=None;Secure;`;
    });
  } catch (e) {}

  authState.token = null;
  authState.refreshToken = null;
  authState.user = null;
  authState.isAuthenticated = false;
  authState.failedRequests = 0;
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

export { api as default, api };