#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PORT=${PORT:-3001}

echo -e "${BLUE}╔══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       FlexDocs Docker Deployment      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════╝${NC}"
echo ""

# Step 1: Generate .env if missing
if [ ! -f .env ]; then
    echo -e "${YELLOW}→ Generating .env with random secrets...${NC}"
    ENCRYPTION_KEY=$(openssl rand -hex 32)
    NEXTAUTH_SECRET=$(openssl rand -hex 32)
    cat > .env <<EOF
DATABASE_URL="postgresql://flexdocs:flexdocs@db:5432/flexdocs"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:${PORT}"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
REDIS_URL="redis://redis:6379"
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="FlexDocs <noreply@flexdocs.local>"
SMTP_SECURE=false
LOG_LEVEL="info"
BACKUP_DIR="./backups"
BACKUP_RETENTION_DAYS=30
DB_PASSWORD="flexdocs"
EOF
    echo -e "${GREEN}  ✓ .env created${NC}"
else
    echo -e "${GREEN}  ✓ .env already exists${NC}"
fi

# Step 2: Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found. Install Docker Desktop first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}✗ docker-compose not found.${NC}"
    exit 1
fi

# Use docker-compose v1 or v2
DC="docker-compose"
if ! command -v docker-compose &> /dev/null; then
    DC="docker compose"
fi

# Step 3: Stop existing containers (keep volumes)
echo -e "${YELLOW}→ Stopping existing containers...${NC}"
$DC down 2>/dev/null || true

# Step 4: Build
echo -e "${YELLOW}→ Building Docker images...${NC}"
$DC build --no-cache 2>&1 | tail -5

# Step 5: Start
echo -e "${YELLOW}→ Starting services...${NC}"
$DC up -d

# Step 6: Wait for init
echo -e "${YELLOW}→ Waiting for database initialization...${NC}"
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if $DC logs init 2>&1 | grep -q "Seed completed\|Already up to date"; then
        break
    fi
    if [ $ELAPSED -gt 10 ] && $DC logs init 2>&1 | grep -q "error\|Error"; then
        echo -e "${RED}  ✗ Init failed. Check: $DC logs init${NC}"
        exit 1
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    echo -ne "  Waiting... (${ELAPSED}s)\r"
done
echo ""

# Step 7: Wait for app
echo -e "${YELLOW}→ Waiting for app to start...${NC}"
MAX_WAIT=30
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -sf http://localhost:${PORT}/api/health > /dev/null 2>&1; then
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

# Step 8: Verify
echo ""
if curl -sf http://localhost:${PORT}/api/health > /dev/null 2>&1; then
    HEALTH=$(curl -sf http://localhost:${PORT}/api/health)
    echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Deployment Successful!        ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${BLUE}URL:      ${NC}http://localhost:${PORT}"
    echo -e "  ${BLUE}Dashboard:${NC}http://localhost:${PORT}/dashboard"
    echo -e "  ${BLUE}Login:    ${NC}admin@flexdocs.io / admin123"
    echo -e "  ${BLUE}Health:   ${NC}${HEALTH}"
    echo ""
    echo -e "  ${YELLOW}Commands:${NC}"
    echo -e "  make logs       # Follow app logs"
    echo -e "  make stop       # Stop everything"
    echo -e "  make restart    # Restart app only"
    echo -e "  make rebuild    # Full rebuild"
    echo -e "  make backup     # Backup database"
    echo -e "  make status     # Check status"
else
    echo -e "${RED}╔══════════════════════════════════════╗${NC}"
    echo -e "${RED}║        Deployment Incomplete          ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  App not responding on port ${PORT}"
    echo -e "  Check logs: ${DC} logs app"
fi
