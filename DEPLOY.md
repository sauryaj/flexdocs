# FlexDocs — Docker Deployment Guide (Noob-Friendly)

A complete, step-by-step guide to deploy FlexDocs on your computer using Docker.

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Install Docker](#2-install-docker)
3. [Download FlexDocs](#3-download-flexdocs)
4. [Set Up Environment Variables](#4-set-up-environment-variables)
5. [Build and Start](#5-build-and-start)
6. [Access the App](#6-access-the-app)
7. [Common Commands](#7-common-commands)
8. [Troubleshooting](#8-troubleshooting)
9. [FAQ](#9-faq)

---

## 1. What You Need

| Requirement | Why |
|---|---|
| **macOS, Linux, or Windows** | The computer you're deploying on |
| **8 GB RAM minimum** | Docker + databases need memory |
| **20 GB free disk space** | For images, database, and uploads |
| **Internet connection** | To download Docker images and code |

---

## 2. Install Docker

### macOS (Apple Silicon M1/M2/M3/M4)

```bash
# Install Homebrew (if you don't have it)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Colima (lightweight Docker runtime)
brew install colima docker docker-compose

# Start Colima with 4 CPUs and 4GB RAM
colima start --cpu 4 --memory 4

# Verify it works
docker ps
```

### macOS (Intel)

Same as above — Colima works on both architectures.

### Windows

1. Download [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)
2. Run the installer
3. Restart your computer when prompted
4. Open Docker Desktop and wait for it to say "Docker Desktop is running"

### Linux (Ubuntu/Debian)

```bash
# Remove old versions
sudo apt remove docker docker-engine docker.io containerd runc 2>/dev/null

# Install Docker
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group (so you don't need sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker ps
```

### Verify Docker is Working

Run this command. You should see an empty table (or existing containers):

```bash
docker ps
```

If you see an error like `Cannot connect to the Docker daemon`, Docker isn't running. Start it:
- **macOS with Colima**: `colima start`
- **macOS with Docker Desktop**: Open Docker Desktop app
- **Windows**: Open Docker Desktop app
- **Linux**: `sudo systemctl start docker`

---

## 3. Download FlexDocs

### Option A: Clone from GitHub (Recommended)

```bash
# Install git (if you don't have it)
# macOS:
brew install git
# Ubuntu:
sudo apt install git

# Clone the repository
git clone https://github.com/sauryaj/flexdocs.git
cd flexdocs
```

### Option B: Download ZIP

1. Go to https://github.com/sauryaj/flexdocs
2. Click the green **Code** button
3. Click **Download ZIP**
4. Extract the ZIP file
5. Open Terminal and navigate to the extracted folder:
   ```bash
   cd ~/Downloads/flexdocs
   ```

---

## 4. Set Up Environment Variables

Create a `.env` file in the project root:

```bash
# Generate random secrets
NEXTAUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Create the .env file
cat > .env << EOF
DATABASE_URL="postgresql://flexdocs:flexdocs@localhost:5432/flexdocs"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3001"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
REDIS_URL="redis://redis:6379"
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="FlexDocs <noreply@flexdocs.local>"
SMTP_SECURE=false
LOG_LEVEL="info"
DB_PASSWORD="flexdocs"
EOF

# Verify the file was created
cat .env
```

> **What these mean:**
> - `NEXTAUTH_SECRET` — Random string for login session security
> - `ENCRYPTION_KEY` — Random string for encrypting passwords in the database
> - `DB_PASSWORD` — Password for the PostgreSQL database
> - Leave SMTP empty for now (email setup is optional)

---

## 5. Build and Start

```bash
# Build the Docker images (this takes 5-10 minutes first time)
docker-compose build

# Start all services
docker-compose up -d
```

**What's happening:**
- `flexdocs-init-1` — Runs database setup (creates tables, seeds data) then exits
- `flexdocs-db-1` — PostgreSQL database (runs forever)
- `flexdocs-redis-1` — Redis cache (runs forever)
- `flexdocs-app-1` — FlexDocs web app (runs forever)

### Watch the logs (optional)

```bash
# See real-time logs from all services
docker-compose logs -f

# Press Ctrl+C to stop watching (services keep running)
```

### Verify everything is running

```bash
docker ps
```

You should see:

```
NAMES              STATUS                    PORTS
flexdocs-app-1     Up X seconds              0.0.0.0:3001->3000/tcp
flexdocs-db-1      Up X seconds (healthy)    0.0.0.0:5432->5432/tcp
flexdocs-redis-1   Up X seconds (healthy)    6379/tcp
```

---

## 6. Access the App

Open your browser and go to:

```
http://localhost:3001
```

You should see the FlexDocs login page. The app auto-creates a default admin user — no login required in single-user mode.

**That's it! You're done!**

---

## 7. Common Commands

### Stop Everything

```bash
docker-compose down
```

### Start Everything

```bash
docker-compose up -d
```

### Rebuild After Code Changes

```bash
docker-compose build
docker-compose up -d
```

### View Logs

```bash
# All services
docker-compose logs -f

# Just the app
docker-compose logs -f app

# Just the database
docker-compose logs -f db
```

### Enter the App Container (for debugging)

```bash
docker exec -it flexdocs-app-1 sh
```

### Enter the Database

```bash
docker exec -it flexdocs-db-1 psql -U flexdocs -d flexdocs
```

### Delete Everything (Fresh Start)

```bash
# Stop and remove all containers, volumes, and data
docker-compose down -v

# Remove built images
docker rmi flexdocs-app flexdocs-init

# Start fresh
docker-compose build
docker-compose up -d
```

### Check Resource Usage

```bash
docker stats
```

---

## 8. Troubleshooting

### "Cannot connect to the Docker daemon"

**macOS with Colima:**
```bash
colima start
```

**macOS/Windows with Docker Desktop:**
- Open Docker Desktop app
- Wait for it to say "Docker Desktop is running"

**Linux:**
```bash
sudo systemctl start docker
```

### "Port 3001 already in use"

Something else is using port 3001. Either:
- Stop the other app, or
- Change the port in `docker-compose.yml`:
  ```yaml
  ports:
    - "3002:3000"  # Change 3001 to 3002
  ```
  Then access at `http://localhost:3002`

### "Port 5432 already in use"

PostgreSQL from a local install is using the port. Options:
- Stop your local PostgreSQL: `brew services stop postgresql` (macOS)
- Or change the port in `docker-compose.yml`:
  ```yaml
  ports:
    - "5433:5432"  # Change 5432 to 5433
  ```
  And update `DATABASE_URL` in `.env`:
  ```
  DATABASE_URL="postgresql://flexdocs:flexdocs@localhost:5433/flexdocs"
  ```

### "flexdocs-init-1" keeps failing

The init container runs database setup. Check its logs:
```bash
docker-compose logs init
```

Common fix — rebuild:
```bash
docker-compose build init
docker-compose up -d
```

### App shows "Internal Server Error"

Check the app logs:
```bash
docker-compose logs app
```

Usually means the database isn't ready. Wait 30 seconds and refresh.

### Docker is slow on macOS

This is normal — Docker on macOS runs in a VM. To improve performance:
```bash
# Give Colima more resources
colima stop
colima start --cpu 6 --memory 8 --disk 30
```

### How to completely reset

```bash
# Nuclear option — deletes all data
docker-compose down -v --rmi all
docker-compose build
docker-compose up -d
```

---

## 9. FAQ

### What ports are used?

| Port | Service |
|---|---|
| 3001 | FlexDocs web app |
| 5432 | PostgreSQL database |
| 6379 | Redis (internal only) |

### Where is my data stored?

- **Database**: Docker volume `flexdocs_postgres_data`
- **Redis**: Docker volume `flexdocs_redis_data`
- **File uploads**: Docker volume `flexdocs_uploads`

### How do I back up my data?

```bash
# Backup database
docker exec flexdocs-db-1 pg_dump -U flexdocs flexdocs > backup.sql

# Restore database
cat backup.sql | docker exec -i flexdocs-db-1 psql -U flexdocs -d flexdocs
```

### How do I update FlexDocs?

```bash
cd flexdocs
git pull
docker-compose build
docker-compose up -d
```

### Can I run this on a VPS/server?

Yes! Just make sure:
1. Docker is installed
2. Ports 3001 and 5432 are open in your firewall
3. Update `NEXTAUTH_URL` in `.env` to your server's domain:
   ```
   NEXTAUTH_URL="https://flexdocs.yourdomain.com"
   ```

### Do I need Redis?

Redis is used for rate limiting and caching. The app works without it (falls back to in-memory), but for production use keep it.

---

## Quick Start (TL;DR)

```bash
# Install Docker
brew install colima docker docker-compose  # macOS
colima start

# Get the code
git clone https://github.com/sauryaj/flexdocs.git
cd flexdocs

# Generate secrets and create .env
NEXTAUTH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
cat > .env << EOF
DATABASE_URL="postgresql://flexdocs:flexdocs@localhost:5432/flexdocs"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3001"
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
REDIS_URL="redis://redis:6379"
SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="FlexDocs <noreply@flexdocs.local>"
SMTP_SECURE=false
LOG_LEVEL="info"
DB_PASSWORD="flexdocs"
EOF

# Build and run
docker-compose build
docker-compose up -d

# Open http://localhost:3001
```
