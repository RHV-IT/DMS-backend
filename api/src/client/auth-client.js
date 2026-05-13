/**
 * AUTH CLIENT - For Node.js services (watcher, scanner-agent, etc.)
 * Pre-configured axios instance with retry-safe auth handling
 */

const axios = require("axios");

const apiClient = axios.create({
  baseURL: process.env.API_BASE_URL || "http://localhost:5000",
  timeout: 30000,
  headers: {
    common: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  },
});

// Track failed requests to prevent infinite retry loops
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.request.use(
  async (config) => {
    if (config.url?.includes("/auth/refresh")) {
      return config;
    }

    const token = process.env.API_TOKEN;
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => {
    consecutiveFailures = 0;
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;
      consecutiveFailures++;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`[Auth:CLIENT] Max consecutive failures (${MAX_CONSECUTIVE_FAILURES}). Stopping retries.`);
        return Promise.reject(error);
      }

      try {
        const refreshToken = process.env.API_REFRESH_TOKEN;
        if (!refreshToken) {
          console.error("[Auth:CLIENT] No refresh token configured in environment");
          return Promise.reject(error);
        }

        const refreshResponse = await axios.post(
          `${process.env.API_BASE_URL || "http://localhost:5000"}/api/v1/auth/refresh`,
          { refreshToken },
          { timeout: 15000 }
        );

        if (refreshResponse.data.success) {
          const newToken = refreshResponse.data.data.accessToken;
          process.env.API_TOKEN = newToken;
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;

          // Retry all queued requests
          processQueue(null, newToken);

          // Retry the original request
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        console.error("[Auth:CLIENT] Token refresh failed:", refreshError.message);
        processQueue(refreshError, null);
        consecutiveFailures = MAX_CONSECUTIVE_FAILURES; // Force stop
        return Promise.reject(refreshError);
      }
    }

    // For 5xx errors, apply exponential backoff
    if (status >= 500 && !originalRequest?._retry) {
      originalRequest._retry = true;
      consecutiveFailures++;

      const delay = Math.min(1000 * Math.pow(2, consecutiveFailures - 1), 30000);
      console.warn(`[Auth:CLIENT] Server error (${status}), retrying in ${delay}ms... (attempt ${consecutiveFailures})`);

      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(originalRequest);
    }

    // Reset counter on successful-ish responses
    if (status && status < 500) {
      consecutiveFailures = 0;
    }

    return Promise.reject(error);
  }
);

module.exports = apiClient;