# CORS Configuration Guide for RHV DMS

## Frontend Configuration

### For Local Network Testing (http://192.168.0.153:3000)

#### Axios Configuration:
```javascript
import axios from 'axios';

// Create axios instance with proper CORS configuration
const api = axios.create({
  baseURL: 'http://your-backend-ip:port/api/v1', // Replace with actual backend IP/port
  withCredentials: true, // Important for authentication
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for debugging
api.interceptors.request.use(
  (config) => {
    console.log('🚀 API Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('✅ API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    if (error.response?.status === 0) {
      console.error('🚫 CORS/Network Error:', error.message);
      console.error('💡 Check if backend is running and CORS is configured');
    }
    return Promise.reject(error);
  }
);

export default api;
```

#### Fetch API Configuration:
```javascript
// For authentication requests
const fetchWithCORS = async (url, options = {}) => {
  const defaultOptions = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Important for cookies/auth
    mode: 'cors',
  };

  const finalOptions = { ...defaultOptions, ...options };

  // Merge headers properly
  if (options.headers) {
    finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
  }

  console.log('🚀 Fetch Request:', finalOptions.method, url);

  try {
    const response = await fetch(url, finalOptions);
    console.log('✅ Fetch Response:', response.status, url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'TypeError' && error.message.includes('CORS')) {
      console.error('🚫 CORS Error:', error.message);
      console.error('💡 Backend CORS configuration may be incorrect');
    }
    throw error;
  }
};

// Usage examples:
const login = (credentials) =>
  fetchWithCORS('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });

const getFiles = () =>
  fetchWithCORS('/api/v1/files');
```

#### React/Vue.js Setup:
```javascript
// For Vite-based frontend (localhost:3000)
const API_BASE_URL = import.meta.env.DEV
  ? 'http://your-backend-ip:port/api/v1'  // Replace with actual backend IP
  : 'https://your-production-api.com/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 10000,
});
```

## Testing CORS Configuration

### Test Commands:

```bash
# Test CORS endpoint
curl -H "Origin: http://192.168.0.153:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS \
     http://your-backend:port/api/v1/cors-test

# Test with authentication
curl -H "Origin: http://192.168.0.153:3000" \
     -H "Authorization: Bearer your-token" \
     http://your-backend:port/api/v1/files
```

### Browser Console Debugging:

Open browser dev tools and check:
1. Network tab for CORS-related errors
2. Console for CORS debug messages from backend
3. Response headers for CORS headers

### Common Issues & Solutions:

1. **"CORS error: No 'Access-Control-Allow-Origin' header"**
   - Backend not running or CORS middleware not applied
   - Check backend logs for CORS debug messages

2. **"CORS error: credentials mode is 'include' but... "**
   - Backend has `credentials: false` but frontend has `withCredentials: true`
   - Ensure both match

3. **"Preflight request failed"**
   - Missing OPTIONS handler or wrong allowed methods/headers
   - Check preflight request in network tab

4. **Local network issues**
   - Firewall blocking requests
   - Wrong IP address in allowed origins
   - Backend not accessible from local network

## Environment Variables

Add to your `.env` file:

```env
# CORS Configuration
ALLOWED_ORIGINS=https://rhv-dms.vercel.app,http://192.168.0.153:3000,http://localhost:3000
FRONTEND_URL=http://192.168.0.153:3000
NODE_ENV=development
```

## Production Deployment

For production, ensure:

1. `NODE_ENV=production`
2. Only allow HTTPS origins
3. Remove debug logging
4. Use proper domain names instead of IPs