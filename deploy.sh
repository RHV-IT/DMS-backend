#!/bin/bash
# ============================================================
# deploy.sh - Production Deployment Script for DMS Backend
# ============================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="dms-backend"
DOCKER_COMPOSE_FILE="docker-compose.yml"
BACKUP_DIR="./backups"
LOG_FILE="./logs/deploy.log"

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2 | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}SUCCESS: $1${NC}" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

# Pre-deployment checks
pre_deploy_checks() {
    log "Running pre-deployment checks..."

    # Check if .env file exists
    if [ ! -f ".env" ]; then
        error ".env file not found. Please copy .env.example to .env and configure your values."
    fi

    # Check required environment variables
    required_vars=("MONGODB_URI" "JWT_SECRET" "JWT_REFRESH_SECRET")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" .env; then
            error "Required environment variable ${var} not found in .env"
        fi
    done

    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        error "Docker is not running. Please start Docker first."
    fi

    # Check if docker-compose is available
    if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
        error "docker-compose is not installed"
    fi

    success "Pre-deployment checks passed"
}

# Create backup
create_backup() {
    log "Creating backup..."

    # Create backup directory
    mkdir -p "$BACKUP_DIR"

    # Backup current deployment
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"

    # Backup volumes and configuration
    if [ -d "./data" ]; then
        tar -czf "$BACKUP_FILE" ./data ./logs ./.env 2>/dev/null || warning "Some files could not be backed up"
        success "Backup created: $BACKUP_FILE"
    else
        warning "No data directory found, skipping backup"
    fi
}

# Pull latest changes
pull_changes() {
    log "Pulling latest changes from git..."

    if [ -d ".git" ]; then
        git pull origin main
        success "Git pull completed"
    else
        warning "Not a git repository, skipping pull"
    fi
}

# Build and deploy
deploy() {
    log "Starting deployment..."

    # Stop existing containers
    log "Stopping existing containers..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" down || warning "Could not stop containers gracefully"

    # Remove old images (optional, uncomment if needed)
    # log "Cleaning up old images..."
    # docker image prune -f

    # Build and start services
    log "Building and starting services..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --build

    # Wait for services to be healthy
    log "Waiting for services to be healthy..."
    sleep 30

    # Check service health
    check_health
}

# Check service health
check_health() {
    log "Checking service health..."

    # Check API health
    if curl -f http://localhost:5000/health >/dev/null 2>&1; then
        success "API service is healthy"
    else
        error "API service failed health check"
    fi

    # Check other services
    services=("redis" "postgres")
    for service in "${services[@]}"; do
        if docker-compose ps "$service" | grep -q "Up"; then
            success "$service service is running"
        else
            warning "$service service is not running (may be optional)"
        fi
    done
}

# Post-deployment cleanup
cleanup() {
    log "Running post-deployment cleanup..."

    # Remove dangling images
    docker image prune -f >/dev/null 2>&1 || true

    # Remove unused volumes (optional)
    # docker volume prune -f >/dev/null 2>&1 || true

    success "Cleanup completed"
}

# Rollback function
rollback() {
    log "Rolling back to previous deployment..."

    if [ -n "$ROLLBACK_TAG" ]; then
        log "Rolling back to tag: $ROLLBACK_TAG"
        git checkout "$ROLLBACK_TAG"
        deploy
    else
        log "Attempting to restart previous containers..."
        docker-compose -f "$DOCKER_COMPOSE_FILE" down
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    fi
}

# Show usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  --no-backup          Skip backup creation"
    echo "  --rollback TAG       Rollback to specific git tag"
    echo "  --logs               Show deployment logs"
    echo ""
    echo "Environment Variables:"
    echo "  SKIP_BACKUP=1        Skip backup creation"
    echo "  ROLLBACK_TAG=tag     Rollback to specific tag"
}

# Parse command line arguments
SKIP_BACKUP=false
SHOW_LOGS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        --no-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --rollback)
            ROLLBACK_TAG="$2"
            shift 2
            ;;
        --logs)
            SHOW_LOGS=true
            shift
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Main deployment process
main() {
    log "Starting DMS Backend deployment"

    # Handle rollback
    if [ -n "$ROLLBACK_TAG" ]; then
        rollback
        exit 0
    fi

    # Run deployment steps
    pre_deploy_checks

    if [ "$SKIP_BACKUP" != "true" ] && [ "${SKIP_BACKUP:-0}" != "1" ]; then
        create_backup
    fi

    pull_changes
    deploy
    cleanup

    success "Deployment completed successfully!"

    # Show logs if requested
    if [ "$SHOW_LOGS" = "true" ]; then
        log "Showing service logs..."
        docker-compose logs -f --tail=50
    else
        echo ""
        echo "To view logs: docker-compose logs -f"
        echo "To check status: docker-compose ps"
        echo "To stop services: docker-compose down"
    fi
}

# Run main function
main "$@"