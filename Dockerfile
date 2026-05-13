# ============================================================
# Dockerfile - Multi-stage build for the DMS API service
# ============================================================

# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY package.json package-lock.json* ./
COPY api/package.json api/package-lock.json* ./api/

# Install root dependencies
RUN npm ci --ignore-scripts

# Install API dependencies
RUN cd /app/api && npm ci --ignore-scripts

# Copy source code
COPY . .

# Production Stage ----
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 -G nodejs

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy installed dependencies from builder
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/api/node_modules ./api/node_modules

# Copy application source
COPY --chown=nextjs:nodejs . .

# Create required directories
RUN mkdir -p /app/uploads /app/pending-uploads && \
    chown -R nextjs:nodejs /app/uploads /app/pending-uploads

# Switch to non-root user
USER nextjs

# Expose the API port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Start the application
CMD ["node", "--no-deprecation", "index.js"]