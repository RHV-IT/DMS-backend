# 🚀 DMS Backend - Production Deployment Guide

**Complete CORS + Authentication Fix + Production Deployment**

## 📋 Overview

This repository now includes a **production-ready deployment setup** with:
- ✅ **Bulletproof CORS** - Works 100% for specified origins
- ✅ **Stable Authentication** - No more repeated login failures
- ✅ **WebSocket Support** - Real-time communication
- ✅ **Docker Deployment** - Professional containerization
- ✅ **CI/CD Pipeline** - Automated testing and deployment
- ✅ **Monitoring & Backup** - Production-grade operations

---

## 🔧 Quick Start

### 1. Environment Setup
```bash
# Clone repository
git clone <your-repo-url>
cd dms-backend

# Copy environment template
cp .env.example .env

# Edit with your values
nano .env
```

### 2. Development Deployment
```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Check health
./monitor.sh status
```

### 3. Production Deployment
```bash
# Deploy with backup
./deploy.sh

# Or deploy without backup
SKIP_BACKUP=1 ./deploy.sh
```

---

## 🔐 Environment Configuration

### Required Variables (.env)

```bash
# Application
NODE_ENV=production
API_PORT=5000

# CORS (Exact origins that work 100%)
ALLOWED_ORIGINS=http://192.168.0.153:3000,http://docmanager.rhv,http://localhost:3000,https://rhv-dms.vercel.app

# Authentication (Generate strong secrets)
JWT_SECRET=your-64-character-secret-here
JWT_REFRESH_SECRET=your-64-character-refresh-secret-here

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dms

# Redis (Sessions)
REDIS_PASSWORD=your-secure-redis-password

# PostgreSQL (Optional)
POSTGRES_PASSWORD=your-secure-postgres-password
```

### GitHub Secrets (for CI/CD)

Set these in your GitHub repository settings:

- `DOCKERHUB_USERNAME` - Docker Hub username
- `DOCKERHUB_TOKEN` - Docker Hub access token
- `DEPLOY_HOST` - Server IP for SSH deployment
- `DEPLOY_USER` - SSH username
- `DEPLOY_SSH_KEY` - Private SSH key
- `DEPLOY_WEBHOOK_URL` - Deployment webhook URL

---

## 🐳 Docker Services

### Core Services
- **api** - Main Express.js application
- **redis** - Session storage and caching
- **postgres** - Relational data (future use)
- **watcher** - File system monitoring
- **scanner-agent** - Document scanning service
- **nginx** - Reverse proxy (production only)

### Data Volumes
- `uploads_data` - User uploaded files
- `pending_data` - Processing queue
- `agent_config` - Scanner configuration
- `redis_data` - Redis persistence
- `postgres_data` - Database files

---

## 🚀 Deployment Options

### Option 1: Direct Docker Compose
```bash
# Production deployment
docker compose up -d

# Development with hot reload
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

### Option 2: Automated Script
```bash
# Full deployment with backup
./deploy.sh

# Quick deployment (no backup)
SKIP_BACKUP=1 ./deploy.sh

# Rollback to previous version
ROLLBACK_TAG=v1.0.0 ./deploy.sh
```

### Option 3: GitHub Actions
Push to `main` branch to trigger automatic deployment via GitHub Actions.

---

## 📊 Monitoring & Maintenance

### Health Checks
```bash
# System status
./monitor.sh status

# Service health
./monitor.sh health

# Performance metrics
./monitor.sh metrics

# Continuous monitoring
./monitor.sh watch
```

### Logs
```bash
# View all logs
docker compose logs -f

# API logs only
docker compose logs -f api

# Last 100 lines
docker compose logs --tail=100 api
```

### Backups
```bash
# Create backup
./backup.sh

# Automated backup (cron)
0 2 * * * /path/to/dms-backend/backup.sh
```

---

## 🔧 CORS Configuration

The system is configured to work **100%** with these origins:
- `http://192.168.0.153:3000`
- `http://docmanager.rhv`
- `http://localhost:3000`
- `https://rhv-dms.vercel.app`

### CORS Features
- ✅ **Exact origin matching** - No false positives
- ✅ **Credentials support** - Cookies work across origins
- ✅ **Preflight handling** - OPTIONS requests processed correctly
- ✅ **Error response CORS** - Even 401/403 responses include headers
- ✅ **WebSocket CORS** - Socket.IO connections work

---

## 🔒 Security Features

### Authentication
- JWT tokens with refresh mechanism
- HTTP-only cookies for security
- Cross-origin cookie support
- Automatic token refresh
- Secure logout with cleanup

### Infrastructure
- Non-root Docker containers
- Secrets management via environment
- Network isolation
- Resource limits
- Health checks

### Monitoring
- Comprehensive logging
- Automated health checks
- Backup encryption
- Intrusion detection via logs

---

## 🧪 Testing

### CORS Testing
```bash
# Test API access
curl -H "Origin: http://192.168.0.153:3000" \
     -H "Access-Control-Request-Method: GET" \
     -X OPTIONS http://localhost:5000/api/v1/files

# Should return 200 with CORS headers
```

### Authentication Testing
```bash
# Login test
curl -X POST http://localhost:5000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}'

# Should return tokens and set cookies
```

### WebSocket Testing
```bash
# Connect to WebSocket
wscat -c ws://localhost:5000/socket.io/\?EIO=4&transport=websocket
```

---

## 🚨 Troubleshooting

### CORS Issues
```bash
# Check CORS logs
docker compose logs api | grep CORS

# Test specific origin
curl -H "Origin: YOUR_ORIGIN" -v http://localhost:5000/health
```

### Authentication Issues
```bash
# Check JWT logs
docker compose logs api | grep AUTH

# Verify token
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/v1/auth/me
```

### Deployment Issues
```bash
# Check container status
docker compose ps

# View detailed logs
docker compose logs --tail=100

# Restart services
docker compose restart
```

---

## 📚 File Structure

```
dms-backend/
├── api/                    # Main application
│   ├── src/
│   │   ├── config/
│   │   │   ├── cors.js     # CORS configuration
│   │   │   ├── socket.js   # WebSocket setup
│   │   ├── middlewares/
│   │   │   ├── authMiddleware.js
│   │   │   ├── errorMiddleware.js
│   │   └── controllers/
│   └── package.json
├── docker-compose.yml      # Production services
├── docker-compose.override.yml  # Development overrides
├── Dockerfile             # Production container
├── Dockerfile.dev         # Development container
├── nginx/
│   └── nginx.conf         # Reverse proxy config
├── .env.example           # Environment template
├── deploy.sh             # Deployment script
├── monitor.sh            # Monitoring script
├── backup.sh             # Backup script
└── .github/
    └── workflows/
        └── build-and-deploy.yml  # CI/CD pipeline
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow
- **Lint & Test** - ESLint and unit tests
- **Build** - Docker image creation
- **Security Scan** - Vulnerability checking
- **Deploy** - Automated deployment to production

### Deployment Triggers
- Push to `main` branch → Production deployment
- Pull requests → Testing only
- Manual dispatch → Custom deployment

---

## 🎯 Success Metrics

After deployment, verify these work perfectly:

- [ ] **CORS**: All specified origins work without errors
- [ ] **Login**: Works on first attempt, stays logged in
- [ ] **API**: All endpoints respond correctly
- [ ] **WebSocket**: Real-time features work
- [ ] **Uploads**: File uploads work reliably
- [ ] **Performance**: <2s response times
- [ ] **Reliability**: No restarts needed

---

## 📞 Support

### Logs Location
- Application logs: `./logs/`
- Docker logs: `docker compose logs`
- Nginx logs: `./logs/nginx/`

### Common Issues
- **CORS errors**: Check ALLOWED_ORIGINS in .env
- **Auth failures**: Verify JWT secrets
- **Connection issues**: Check Docker networking
- **Performance**: Monitor with `./monitor.sh metrics`

### Emergency Commands
```bash
# Stop all services
docker compose down

# Full reset
docker compose down -v
docker system prune -f

# Emergency restart
docker compose up -d --force-recreate
```

---

**🎉 Your DMS backend is now production-ready with bulletproof CORS and authentication!**