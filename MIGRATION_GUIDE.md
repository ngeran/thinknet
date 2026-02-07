# ThinkNet Repository Migration Guide

**Version:** 1.0.0
**Last Updated:** 2025-02-07
**Purpose:** Step-by-step guide for moving ThinkNet from one computer to another

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites on New Computer](#prerequisites-on-new-computer)
3. [Migration Steps](#migration-steps)
4. [Post-Migration Verification](#post-migration-verification)
5. [Common Issues and Solutions](#common-issues-and-solutions)
6. [Configuration Customization](#configuration-customization)

---

## Overview

ThinkNet consists of multiple microservices that work together. When migrating to a new computer, you need to:

1. Clone the repository
2. Install dependencies (Docker, Node.js, Python, Rust - depending on your workflow)
3. Create required Docker networks
4. Configure environment-specific settings
5. Start all services
6. Verify connectivity

---

## Prerequisites on New Computer

### Required Software

#### For Docker Deployment (Recommended)
- **Docker** - Version 24.0 or later
  ```bash
  docker --version
  ```
- **Docker Compose** - Version 2.20 or later
  ```bash
  docker compose version
  ```

#### For Local Development (Optional)
- **Node.js** - Version 20 or later (for frontend)
  ```bash
  node --version
  npm --version
  ```
- **Python** - Version 3.10 or later (for backend)
  ```bash
  python --version
  pip --version
  ```
- **Rust/Cargo** - Latest stable (for Rust backend)
  ```bash
  cargo --version
  rustc --version
  ```
- **Git** - For cloning the repository
  ```bash
  git --version
  ```

### System Requirements

- **RAM:** Minimum 4GB (8GB recommended)
- **Disk Space:** 5GB free space minimum
- **Operating System:** Linux, macOS, or Windows with WSL2
- **Network:** Ports 5173, 8000, 3100, 6379 must be available

---

## Migration Steps

### Step 1: Clone the Repository

```bash
# Navigate to your desired workspace directory
cd ~/github/ngeran  # or your preferred location

# Clone the repository
git clone <repository-url> thinknet
cd thinknet
```

**Note:** If moving from a private GitHub repository, ensure you have SSH keys or access tokens configured.

---

### Step 2: Create Docker Networks

The application requires two Docker networks:

```bash
# Create the external network for device communication
docker network create crpd-net

# Verify the network was created
docker network ls | grep crpd-net
```

**Expected output:**
```
crpd-net    bridge    local
```

---

### Step 3: Configure Environment Settings

#### 3.1 Check for Environment-Specific Configuration

Review these files for any hardcoded IPs or hostnames that may need updating:

```bash
# Check inventory files for device IP addresses
cat shared/data/inventories/inventory.yaml

# Check navigation configuration
cat shared/data/navigation.yaml

# Check docker-compose for port mappings
cat docker-compose.yml
```

#### 3.2 Update Inventory (If Needed)

If your network devices have different IP addresses on the new computer:

```bash
# Edit the inventory file
nano shared/data/inventories/inventory.yaml
```

Update device IP addresses to match your new environment.

#### 3.3 Verify JSNAPy Directories

Ensure required directories exist:

```bash
mkdir -p shared/jsnapy/config
mkdir -p shared/jsnapy/snapshots
mkdir -p shared/jsnapy/logs
mkdir -p shared/jsnapy/testfiles
```

---

### Step 4: Build and Start Services

#### Option A: Docker Deployment (Recommended)

```bash
# Build and start all services
docker compose up -d --build

# View service status
docker compose ps
```

**Expected output:**
```
NAME                IMAGE                      STATUS         PORTS
fastapi_gateway     thinknet-fastapi          running        0.0.0.0:8000->8000/tcp
fastapi_worker      thinknet-fastapi          running
frontend_app        thinknet-frontend         running        0.0.0.0:5173->5173/tcp
redis_broker        redis:7.2-alpine          running        6379/tcp
rust_ws_hub         thinknet-rust             running        0.0.0.0:3100->3100/tcp
```

#### Option B: Local Development

If you prefer running services natively (not in Docker):

```bash
# Terminal 1: Start Redis
docker compose up -d redis_broker

# Terminal 2: Start Rust Backend
cd backend
cargo run

# Terminal 3: Start API Gateway
cd app_gateway
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 4: Start Worker
cd app_gateway
source venv/bin/activate
python fastapi_worker.py

# Terminal 5: Start Frontend
cd frontend
npm install
npm run dev
```

---

### Step 5: Verify Service Startup

Check that all services are running correctly:

```bash
# Check all containers
docker compose ps

# Check logs for any errors
docker compose logs --tail=50
```

---

## Post-Migration Verification

### 1. Frontend Access

Open your browser and navigate to:

```
http://localhost:5173
```

**Expected:** You should see the ThinkNet application with:
- Management menu (Image Uploads, Code Upgrades)
- Automation menu (Configuration Templates, Validation)
- Reporting menu (Device Reports)
- Operations menu (Backups)

### 2. API Documentation

Access the FastAPI Swagger documentation:

```
http://localhost:8000/docs
```

**Expected:** You should see all available API endpoints including:
- `/api/automation/*` - Network automation tasks
- `/api/inventory/*` - Device inventory
- `/api/jsnapy/*` - JSNAPy validation
- `/api/operations/*` - Backup/restore operations
- `/api/navigation/*` - Navigation configuration

### 3. WebSocket Connection

Open browser Developer Tools (F12) → Network tab → WS filter

**Expected:** You should see a WebSocket connection to:
```
ws://localhost:3100/ws
```

Connection status should show `101 Switching Protocols`

### 4. Redis Connection Test

```bash
# Connect to Redis container
docker exec -it redis_broker redis-cli

# Test connection
PING
```

**Expected:** `PONG`

### 5. Rust Backend Health Check

```bash
# Check Rust backend logs
docker compose logs rust_backend | tail -20
```

**Expected:** Logs showing WebSocket server started on port 3100

---

## Common Issues and Solutions

### Issue 1: Port Already in Use

**Symptom:** Error message like `Bind for 0.0.0.0:8000 failed: port is already allocated`

**Solution:**
```bash
# Find what's using the port
sudo lsof -i :8000  # Linux/macOS
netstat -ano | findstr :8000  # Windows

# Kill the process or change the port in docker-compose.yml
```

### Issue 2: crpd-net Network Not Found

**Symptom:** `ERROR: Network crpd-net declared as external, but could not be found`

**Solution:**
```bash
docker network create crpd-net
docker compose up -d
```

### Issue 3: Frontend Cannot Connect to Backend

**Symptom:** Browser console shows connection refused errors

**Solution:**
1. Verify API Gateway is running: `docker compose ps`
2. Check environment variables in `docker-compose.yml`:
   ```yaml
   VITE_API_GATEWAY_URL: http://localhost:8000
   VITE_RUST_WS_URL: ws://localhost:3100/ws
   ```
3. If using a different host (not localhost), update these values

### Issue 4: Worker Not Processing Jobs

**Symptom:** Jobs are queued but never complete

**Solution:**
```bash
# Check worker logs
docker compose logs fastapi_worker -f

# Verify Redis connection
docker exec -it fastapi_worker python -c "import redis; r=redis.Redis(host='redis_broker'); print(r.ping())"
```

### Issue 5: JSNAPy Tests Failing

**Symptom:** JSNAPy validation tests fail with file not found errors

**Solution:**
```bash
# Verify JSNAPy directories exist and are mounted
ls -la shared/jsnapy/config/
ls -la shared/jsnapy/testfiles/

# Check container mounts
docker inspect fastapi_worker | grep -A 10 jsnapy
```

### Issue 6: Permission Denied on Volume Mounts

**Symptom:** Container exits with permission errors

**Solution:**
```bash
# Fix directory permissions
chmod -R 755 shared/
chmod -R 755 frontend/py_scripts/

# On Linux, you may need to adjust UID/GID
sudo chown -R $USER:$USER shared/
```

### Issue 7: git clone Fails with SSH Permission Denied

**Symptom:** `Permission denied (publickey)` when cloning

**Solution:**
```bash
# Setup SSH keys for GitHub
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub

# Add the SSH key to your GitHub account
# Then clone using SSH: git clone git@github.com:username/thinknet.git
```

### Issue 8: Navigation Menu Shows Error "Unexpected token '<', "<!doctype "... is not valid JSON"

**Symptom:** Browser console shows error when loading navigation menu

**Cause:** Environment variable mismatch between `VITE_API_GATEWAY_URL` (set in docker-compose.yml) and `VITE_API_BASE_URL` (used in some frontend files)

**Solution:**
```bash
# The files should use VITE_API_GATEWAY_URL consistently
# If you see this error, verify environment variable names match:

# 1. Check docker-compose.yml has:
# VITE_API_GATEWAY_URL: http://localhost:8000

# 2. Check frontend files use the same variable:
grep -r "VITE_API_BASE_URL" frontend/src/

# 3. If found, restart frontend after code changes:
docker compose restart frontend
```

---

## Configuration Customization

### Changing Default Ports

If default ports conflict with other services:

Edit `docker-compose.yml`:

```yaml
services:
  rust_backend:
    ports:
      - "3101:3100"  # Change host port to 3101

  fastapi_automation:
    ports:
      - "8001:8000"  # Change host port to 8001

  frontend:
    ports:
      - "3000:5173"  # Change host port to 3000
```

Then update frontend environment variables:
```yaml
  frontend:
    environment:
      VITE_API_GATEWAY_URL: http://localhost:8001
      VITE_RUST_WS_URL: ws://localhost:3101/ws
```

### Accessing from Remote Computers

To access ThinkNet from other computers on your network:

1. Find your host computer's IP address:
   ```bash
   ip addr show  # Linux
   ipconfig getifaddr en0  # macOS
   ipconfig  # Windows
   ```

2. Edit `docker-compose.yml` - update frontend environment:
   ```yaml
   VITE_API_GATEWAY_URL: http://192.168.1.100:8000  # Use your IP
   VITE_RUST_WS_URL: ws://192.168.1.100:3100/ws
   ```

3. Restart services:
   ```bash
   docker compose down
   docker compose up -d
   ```

4. Access from remote browser: `http://192.168.1.100:5173`

### Custom Inventory Location

To store inventories elsewhere:

```bash
# Create a symlink
ln -s /path/to/your/inventories shared/data/inventories
```

---

## Quick Reference Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View logs
docker compose logs -f

# Restart a specific service
docker compose restart fastapi_automation

# Rebuild after code changes
docker compose up -d --build

# Check service status
docker compose ps

# Access container shell
docker exec -it fastapi_gateway bash

# View Redis messages
docker exec -it redis_broker redis-cli MONITOR

# Clean rebuild (remove volumes)
docker compose down -v
docker compose up -d --build
```

---

## Support and Troubleshooting

If you encounter issues not covered in this guide:

1. Check container logs: `docker compose logs -f <service-name>`
2. Review the [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
3. Check [CLAUDE.md](CLAUDE.md) for architecture details
4. Review individual service logs in the container:
   ```bash
   docker exec -it fastapi_gateway cat /var/log/jsnapy/
   ```

---

## Appendix: Service Dependencies

```
                    ┌─────────────┐
                    │   Frontend  │
                    │   (5173)    │
                    └──────┬──────┘
                           │
            ┌──────────────┴──────────────┐
            │                             │
    ┌───────▼────────┐          ┌────────▼────────┐
    │  FastAPI       │          │  Rust WS Hub    │
    │  Gateway       │◄─────────┤  (3100)         │
    │  (8000)        │  WS      │                 │
    └───────┬────────┘          └────────┬────────┘
            │                             │
            │                             │
    ┌───────▼────────┐          ┌────────▼────────┐
    │  FastAPI       │          │     Redis       │
    │  Worker        │◄─────────┤   Broker        │
    │                │  Queue   │   (6379)        │
    └────────────────┘          └─────────────────┘
```

**Flow:**
1. Frontend sends HTTP requests to FastAPI Gateway
2. Frontend connects to Rust WS Hub for real-time updates
3. FastAPI Gateway queues jobs to Redis
4. Worker polls Redis for jobs and executes them
5. Worker publishes status updates via Redis → Rust WS Hub → Frontend

---

**End of Migration Guide**
