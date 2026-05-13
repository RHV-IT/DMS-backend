#!/bin/bash
# ============================================================
# monitor.sh - Health Monitoring Script for DMS Backend
# ============================================================

# Configuration
API_URL="http://localhost:5000"
REDIS_HOST="localhost"
REDIS_PORT="6379"
LOG_FILE="./logs/monitor.log"
ALERT_EMAIL=""  # Set your email for alerts

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Create logs directory
mkdir -p ./logs

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

alert() {
    log "🚨 ALERT: $1"
    if [ -n "$ALERT_EMAIL" ]; then
        echo "DMS Alert: $1" | mail -s "DMS System Alert" "$ALERT_EMAIL"
    fi
}

# Check API health
check_api() {
    if curl -f -s "$API_URL/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ API${NC}"
        return 0
    else
        echo -e "${RED}✗ API${NC}"
        return 1
    fi
}

# Check Redis
check_redis() {
    if redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Redis${NC}"
        return 0
    else
        echo -e "${RED}✗ Redis${NC}"
        return 1
    fi
}

# Check MongoDB
check_mongodb() {
    if command -v mongosh >/dev/null 2>&1; then
        if mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
            echo -e "${GREEN}✓ MongoDB${NC}"
            return 0
        fi
    fi
    echo -e "${YELLOW}? MongoDB${NC} (mongosh not available)"
    return 2
}

# Check disk usage
check_disk() {
    local usage
    usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

    if [ "$usage" -gt 90 ]; then
        echo -e "${RED}✗ Disk ($usage%)${NC}"
        return 1
    elif [ "$usage" -gt 80 ]; then
        echo -e "${YELLOW}⚠ Disk ($usage%)${NC}"
        return 0
    else
        echo -e "${GREEN}✓ Disk ($usage%)${NC}"
        return 0
    fi
}

# Check memory usage
check_memory() {
    local usage
    usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')

    if [ "$usage" -gt 90 ]; then
        echo -e "${RED}✗ Memory ($usage%)${NC}"
        return 1
    elif [ "$usage" -gt 80 ]; then
        echo -e "${YELLOW}⚠ Memory ($usage%)${NC}"
        return 0
    else
        echo -e "${GREEN}✓ Memory ($usage%)${NC}"
        return 0
    fi
}

# Check services
check_services() {
    local failed=0

    echo "Checking services:"
    check_api || failed=1
    check_redis || failed=1
    check_mongodb || failed=1
    echo ""

    echo "Checking system resources:"
    check_disk || failed=1
    check_memory || failed=1
    echo ""

    if [ $failed -eq 1 ]; then
        alert "Service health check failed"
        return 1
    else
        log "All services healthy"
        return 0
    fi
}

# Show detailed status
show_status() {
    echo "=== DMS Backend Status ==="
    echo ""

    # Docker containers
    echo "Docker Containers:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || echo "Docker not available"

    echo ""
    echo "Service Health:"
    check_services
}

# Show logs
show_logs() {
    local service="${1:-api}"
    local lines="${2:-50}"

    echo "=== Last $lines lines of $service logs ==="
    docker-compose logs --tail="$lines" -f "$service" 2>/dev/null || echo "Could not retrieve logs"
}

# Performance metrics
show_metrics() {
    echo "=== Performance Metrics ==="
    echo ""

    # CPU usage
    echo "CPU Usage:"
    top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}' || echo "N/A"

    echo ""
    echo "Memory Usage:"
    free -h | grep "^Mem:" || echo "N/A"

    echo ""
    echo "Disk Usage:"
    df -h / | tail -1 || echo "N/A"

    echo ""
    echo "Network Connections:"
    netstat -tln | grep LISTEN | wc -l | awk '{print $1 " listening ports"}' || echo "N/A"
}

# Main function
main() {
    case "${1:-status}" in
        status)
            show_status
            ;;
        logs)
            show_logs "${2:-api}" "${3:-50}"
            ;;
        metrics)
            show_metrics
            ;;
        health)
            check_services && echo "All systems healthy" || echo "Health check failed"
            ;;
        watch)
            echo "Monitoring services (Ctrl+C to stop)..."
            while true; do
                check_services > /dev/null
                sleep 60
            done
            ;;
        *)
            echo "Usage: $0 {status|logs|metrics|health|watch} [service] [lines]"
            echo ""
            echo "Commands:"
            echo "  status     Show overall system status"
            echo "  logs       Show logs for a service (default: api)"
            echo "  metrics    Show performance metrics"
            echo "  health     Quick health check"
            echo "  watch      Continuously monitor services"
            exit 1
            ;;
    esac
}

main "$@"