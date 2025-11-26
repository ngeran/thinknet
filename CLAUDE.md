# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ThinkNet is a multi-service network automation platform with a microservices architecture:

- **Frontend**: React + Vite application (Port 5173)
- **API Gateway**: FastAPI application for REST APIs and automation (Port 8000)
- **WebSocket Hub**: Rust backend for real-time communication (Port 3100)
- **Message Broker**: Redis for job queuing and pub/sub
- **Worker Service**: Dedicated FastAPI worker for background job execution

## Development Commands

### Frontend (React + Vite)
```bash
cd frontend
npm run dev          # Start development server on port 5173
npm run build        # Build for production
npm run lint         # Run ESLint
npm run preview      # Preview production build
```

### Backend (Rust)
```bash
cd backend
cargo run            # Start Rust WebSocket server on port 3100
cargo build          # Build the project
cargo test           # Run tests
cargo check          # Check without building
```

### API Gateway (FastAPI)
```bash
cd app_gateway
uvicorn main:app --host 0.0.0.0 --port 8000 --reload    # Development with auto-reload
uvicorn main:app --host 0.0.0.0 --port 8000             # Production
```

### Docker Services
```bash
docker-compose up -d               # Start all services
docker-compose up -d redis_broker  # Start only Redis
docker-compose up -d rust_backend  # Start only Rust backend
docker-compose logs -f fastapi_automation  # Follow API Gateway logs
docker-compose restart fastapi_worker     # Restart worker service
```

## Architecture

### Service Communication
- **Frontend → API Gateway**: HTTP/REST APIs on port 8000
- **Frontend → Rust Hub**: WebSocket connection on port 3100
- **API Gateway → Rust Hub**: WebSocket client for real-time updates
- **All Services → Redis**: Pub/sub messaging and job queuing

### Key Components

#### Frontend Structure
- `src/App.jsx` - Main application with React Router setup
- `src/context/NavigationContext.jsx` - Dynamic navigation state management
- `src/layouts/AppLayout.jsx` - Main application layout with header/sidebar
- `src/pages/Operations/` - Static routes for backup/restore operations
- Dynamic routes are loaded from YAML configuration via Rust backend

#### Backend Structure (Rust)
- `src/main.rs` - Application entry point with Redis integration
- `src/api/state.rs` - Shared application state and connection management
- `src/routes/navigation.rs` - Navigation configuration endpoints
- `src/services/yaml_service.rs` - YAML file management service
- `src/services/redis_service.rs` - Redis pub/sub integration

#### API Gateway Structure (FastAPI)
- `main.py` - FastAPI application with router registration
- `api/routers/` - Organized by functional domain:
  - `automation.py` - Network automation tasks
  - `operations.py` - Backup/restore operations
  - `inventory.py` - Device inventory management
  - `proxy.py` - Proxy routes to Rust backend
  - `jsnapy.py` - JSNAPy validation (V2)
  - `upgrade.py` - Device software upgrades

### Data Flow
1. Frontend requests navigation config from `/api/navigation/*` (proxied to Rust)
2. Rust backend serves YAML files from `shared/data/` directory
3. Frontend dynamically creates routes based on configuration
4. Real-time updates flow through Redis → Rust backend → Frontend via WebSocket
5. Background jobs are queued to Redis and processed by FastAPI worker

## Important Configuration

### Environment Variables
- `RUST_WS_URL` - WebSocket connection URL for API Gateway
- `REDIS_HOST`, `REDIS_PORT` - Redis connection settings
- `VITE_API_GATEWAY_URL` - Frontend API URL
- `VITE_RUST_WS_URL` - Frontend WebSocket URL

### Volume Mounts (Docker)
- `./shared/data:/app/shared/data` - YAML configuration files
- `./shared/schemas:/app/shared/schemas` - JSON schemas for validation
- `./frontend/py_scripts:/app/app_gateway/py_scripts` - Python automation scripts
- `temp_upload_storage:/tmp/uploads` - Temporary file storage

## Key Development Notes

### Dynamic Navigation System
The application uses a dynamic navigation system where routes are defined in YAML files and loaded at runtime. Static routes (like Operations) are hard-coded in `App.jsx`, while dynamic routes are fetched from the Rust backend.

### WebSocket Integration
- Rust backend manages WebSocket connections and broadcasts messages
- Redis pub/sub enables real-time communication between all services
- Frontend connects to WebSocket for live updates

### Worker Pattern
Background jobs (network automation tasks) are handled by a dedicated FastAPI worker service that polls Redis for new tasks, ensuring the main API Gateway remains responsive.

### Multi-network Architecture
- `internal_net`: Internal service communication
- `crpd-net`: External network for device communication (cRPD lab integration)

### JSNAPy Integration
- JSNAPy configuration files stored in `shared/jsnapy/config/`
- Test snapshots saved to `shared/jsnapy/snapshots/`
- Debug logs available in `shared/jsnapy/logs/`

## Testing

### Frontend Tests
```bash
cd frontend
npm test          # Run tests if configured
```

### Backend Tests
```bash
cd backend
cargo test        # Run Rust tests
```

### API Testing
API documentation available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Debug routes: http://localhost:8000/debug/routes

## Common Issues

1. **Redis Connection**: Ensure Redis is running before starting other services
2. **WebSocket Fails**: Check Rust backend is accessible from API Gateway
3. **Dynamic Routes Not Loading**: Verify YAML files exist in `shared/data/`
4. **JSNAPy Failures**: Check mount permissions for jsnapy directories
5. **Permission Issues**: Ensure Docker volumes have proper read/write permissions