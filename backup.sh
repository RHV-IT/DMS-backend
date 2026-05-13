#!/bin/bash
# ============================================================
# backup.sh - Backup Script for DMS Backend
# ============================================================

set -e

# Configuration
BACKUP_DIR="./backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="dms_backup_$TIMESTAMP"
LOG_FILE="./logs/backup.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create directories
mkdir -p "$BACKUP_DIR" ./logs

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}ERROR: $1${NC}" >&2 | tee -a "$LOG_FILE"
    exit 1
}

# Create database backup
backup_database() {
    log "Creating database backup..."

    # MongoDB backup
    if command -v mongodump >/dev/null 2>&1; then
        mongodump --out "$BACKUP_DIR/$BACKUP_NAME/mongodb" --db dms 2>>"$LOG_FILE"
        log "MongoDB backup created"
    else
        warning "mongodump not found, skipping MongoDB backup"
    fi

    # PostgreSQL backup (if configured)
    if command -v pg_dump >/dev/null 2>&1 && [ -n "$POSTGRES_PASSWORD" ]; then
        PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U dms_user -d dms > "$BACKUP_DIR/$BACKUP_NAME/postgres.sql" 2>>"$LOG_FILE"
        log "PostgreSQL backup created"
    fi
}

# Create file backup
backup_files() {
    log "Creating file backup..."

    # Backup uploads and configuration
    tar -czf "$BACKUP_DIR/$BACKUP_NAME/files.tar.gz" \
        ./data/uploads \
        ./data/agent-config \
        ./.env \
        ./docker-compose.yml \
        ./nginx/nginx.conf \
        2>>"$LOG_FILE"

    log "File backup created"
}

# Create Docker volume backup
backup_volumes() {
    log "Creating Docker volume backup..."

    # Stop containers temporarily for consistent backup
    docker-compose stop 2>>"$LOG_FILE"

    # Backup volumes
    docker run --rm \
        -v dms-backend_uploads_data:/source \
        -v "$(pwd)/$BACKUP_DIR/$BACKUP_NAME":/backup \
        alpine tar czf /backup/volumes.tar.gz -C / source 2>>"$LOG_FILE"

    # Restart containers
    docker-compose start 2>>"$LOG_FILE"

    log "Volume backup created"
}

# Compress final backup
compress_backup() {
    log "Compressing backup..."

    cd "$BACKUP_DIR"
    tar -czf "${BACKUP_NAME}.tar.gz" "$BACKUP_NAME" 2>>"$LOG_FILE"
    rm -rf "$BACKUP_NAME"

    log "Backup compressed: ${BACKUP_NAME}.tar.gz"
}

# Clean old backups
cleanup_old() {
    log "Cleaning up old backups..."

    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>>"$LOG_FILE"

    local count
    count=$(find "$BACKUP_DIR" -name "*.tar.gz" | wc -l)
    log "Cleanup completed. $count backups retained."
}

# Upload to cloud (optional)
upload_backup() {
    if command -v aws >/dev/null 2>&1 && [ -n "$AWS_S3_BUCKET" ]; then
        log "Uploading backup to S3..."
        aws s3 cp "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" "s3://$AWS_S3_BUCKET/backups/" 2>>"$LOG_FILE"
        log "Backup uploaded to S3"
    elif command -v az >/dev/null 2>&1 && [ -n "$AZURE_STORAGE_CONTAINER" ]; then
        log "Uploading backup to Azure..."
        az storage blob upload \
            --account-name "$AZURE_STORAGE_ACCOUNT" \
            --container-name "$AZURE_STORAGE_CONTAINER" \
            --name "${BACKUP_NAME}.tar.gz" \
            --file "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" 2>>"$LOG_FILE"
        log "Backup uploaded to Azure"
    fi
}

# Main backup process
main() {
    log "Starting DMS backup: $BACKUP_NAME"

    # Create backup directory
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

    # Run backup steps
    backup_database
    backup_files
    backup_volumes
    compress_backup

    # Optional cloud upload
    upload_backup

    # Cleanup
    cleanup_old

    # Show backup info
    local size
    size=$(du -sh "$BACKUP_DIR/${BACKUP_NAME}.tar.gz" | cut -f1)
    log "Backup completed successfully!"
    log "Location: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    log "Size: $size"

    echo ""
    echo "Backup Summary:"
    echo "==============="
    echo "Name: $BACKUP_NAME"
    echo "Location: $BACKUP_DIR/${BACKUP_NAME}.tar.gz"
    echo "Size: $size"
    echo "Retention: $RETENTION_DAYS days"
}

# Run main function
main "$@"