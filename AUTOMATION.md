# ThinkNet Automation System Documentation

## Overview

The ThinkNet platform provides two main automation workflows accessible through the React frontend:

- **Templates.jsx** - Configuration template deployment system
- **Validation.jsx** - JSNAPy test validation system

Both components follow the same architectural patterns and integrate with the backend services through WebSocket real-time communication.

## Architecture Overview

```
Frontend (React)          Backend Services                Docker Volumes
┌─────────────────┐       ┌─────────────────────┐       ┌─────────────────────┐
│   Templates.jsx │ ──►   │   API Gateway       │ ──►   │ /shared/templates/   │
│   Validation.jsx│       │   (FastAPI)         │       │ /shared/jsnapy/     │
│                 │       │                     │       │                     │
│ WebSocket Client│ ◄───  │   Worker Service    │ ◄───  │ /app/py_scripts/    │
└─────────────────┘       │   (Background)      │       └─────────────────────┘
                          │                     │
                          │   Rust WebSocket    │
                          │   Hub               │
                          └─────────────────────┘
                                    ▲
                                    │
                          ┌─────────────────────┐
                          │  Redis Message      │
                          │  Broker             │
                          └─────────────────────┘
```

## Templates.jsx - Configuration Deployment System

### Purpose
Deploy network configuration templates to devices with real-time progress tracking and rollback capabilities.

### Key Features
- **Step-based wizard UI** with 4-step workflow
- **Template discovery** from `/shared/templates/` directory
- **Device authentication** with credential management
- **Real-time deployment** via WebSocket communication
- **Rollback functionality** for failed deployments
- **Modern deployment report** with detailed step tracking

### File Dependencies

#### Frontend Components
```
frontend/src/pages/Automation/
├── Templates.jsx                 # Main component (4-step wizard)
├── TemplatesReport.jsx           # Deployment results display
└── ../shared/
    ├── DeviceAuthFields.jsx      # Device authentication form
    ├── NavigationStepper.jsx     # Step navigation component
    └── ui/                       # Reusable UI components
        ├── card.jsx
        ├── button.jsx
        ├── progress.jsx
        ├── badge.jsx
        └── scroll-area.jsx
```

#### Backend Services
```
app_gateway/
├── api/routers/
│   ├── automation.py             # Template deployment API endpoints
│   └── operations.py             # Common operations endpoints
├── services/
│   ├── websocket.py              # WebSocket communication
│   └── job_processor.py          # Background job processing
└── py_scripts/scripts/
    └── template_deployer/        # Template deployment scripts
        ├── run_template_deploy.py
        └── device_config.py
```

#### Volume Mounts
```
shared/
├── templates/                    # Jinja2 configuration templates
│   ├── interface_config.j2
│   ├── bgp_config.j2
│   └── system_config.j2
└── device_configs/              # Generated configurations
```

### End-to-End Workflow

#### 1. Template Discovery
```bash
# API endpoint: GET /api/templates
curl -X GET "http://localhost:8000/api/templates" \
  -H "accept: application/json"
```

**Backend Process:**
- Scans `/shared/templates/` directory for `.j2` files
- Extracts template metadata (description, parameters, device types)
- Returns structured template list to frontend

#### 2. Device Configuration
```bash
# API endpoint: POST /api/operations/template/deploy/configure
curl -X POST "http://localhost:8000/api/operations/template/deploy/configure" \
  -H "Content-Type: application/json" \
  -d '{
    "template_name": "interface_config.j2",
    "device_hostname": "192.168.1.100",
    "credentials": {
      "username": "admin",
      "password": "password123"
    },
    "template_variables": {
      "interface_name": "ge-0/0/0",
      "ip_address": "192.168.1.1/24"
    }
  }'
```

#### 3. Template Deployment
```bash
# API endpoint: POST /api/operations/template/deploy/execute
curl -X POST "http://localhost:8000/api/operations/template/deploy/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "unique-job-uuid",
    "template_name": "interface_config.j2",
    "device_hostname": "192.168.1.100",
    "credentials": {
      "username": "admin",
      "password": "password123"
    },
    "template_variables": {
      "interface_name": "ge-0/0/0",
      "ip_address": "192.168.1.1/24"
    },
    "rollback_enabled": true
  }'
```

**Backend Process:**
1. Queues background job to Redis
2. Worker process picks up job
3. Executes template deployment script:
   ```bash
   python /app/app_gateway/py_scripts/scripts/template_deployer/run_template_deploy.py \
     --hostname 192.168.1.100 \
     --username admin \
     --password password123 \
     --template interface_config.j2 \
     --variables '{"interface_name": "ge-0/0/0", "ip_address": "192.168.1.1/24"}' \
     --rollback
   ```
4. Publishes real-time progress via WebSocket
5. Generates deployment report

#### 4. Real-time Communication
```javascript
// Frontend WebSocket subscription
const ws_channel = `job:${jobId}`;
const subscriptionMessage = {
    type: 'SUBSCRIBE',
    channel: ws_channel
};
sendMessage(subscriptionMessage);

// Progress events received:
{
  "type": "progress",
  "event_type": "STEP_START",
  "message": "Template deployment started",
  "data": {"step": "template_rendering", "progress": 0}
}

{
  "type": "progress",
  "event_type": "OPERATION_COMPLETE",
  "message": "Template deployed successfully",
  "data": {"success": true, "config_applied": true}
}
```

### Template File Format
```jinja2
{# shared/templates/interface_config.j2 #}
interfaces {
    {{ interface_name }} {
        description "{{ interface_description | default('Management Interface') }}";
        unit 0 {
            family inet {
                address {{ ip_address }};
            }
        }
    }
}
```

## Validation.jsx - JSNAPy Test Validation System

### Purpose
Execute JSNAPy validation tests against network devices with real-time progress tracking and detailed test results.

### Key Features
- **Step-based wizard UI** with 4-step workflow
- **Test discovery** from `/shared/jsnapy/testfiles/` directory
- **Multi-test execution** with individual test case results
- **Device authentication** and connectivity validation
- **Real-time test execution** via WebSocket communication
- **Modern validation report** with collapsible test data
- **Fallback simulation mode** when JSNAPy libraries unavailable

### File Dependencies

#### Frontend Components
```
frontend/src/pages/Automation/
├── Validation.jsx                # Main component (4-step wizard)
├── ValidationReport.jsx          # Test results display
├── hooks/
│   ├── useJobWebSocket.js       # WebSocket job management
│   └── useTestDiscovery.js      # Test discovery functionality
└── ../shared/
    ├── DeviceAuthFields.jsx     # Device authentication form
    ├── NavigationStepper.jsx    # Step navigation component
    └── ui/                       # Reusable UI components
```

#### Backend Services
```
app_gateway/
├── api/routers/
│   ├── jsnapy.py                 # JSNAPy validation API endpoints
│   └── operations.py             # Common operations endpoints
├── data_access/
│   └── test_reader.py            # JSNAPy test file discovery
├── services/
│   ├── websocket.py              # WebSocket communication
│   └── jsnapy_service_v2.py      # JSNAPy test execution service
└── py_scripts/scripts/
    └── jsnapy_runner/
        └── run_jsnapy_module.py  # JSNAPy test execution script
```

#### Volume Mounts
```
shared/jsnapy/
├── testfiles/                    # JSNAPy test definition files
│   ├── test_version.yml
│   ├── test_bgp_summary.yml
│   ├── test_ospf.yml
│   └── test_storage_check.yml
├── config/                       # JSNAPy configuration
│   └── logging.yml
├── snapshots/                    # Test snapshots
└── logs/                         # JSNAPy execution logs
```

### End-to-End Workflow

#### 1. Test Discovery
```bash
# API endpoint: GET /api/tests
curl -X GET "http://localhost:8000/api/tests" \
  -H "accept: application/json"

# Response:
{
  "tests": [
    {
      "name": "test_version.yml",
      "path": "testfiles/test_version.yml",
      "size_kb": 1.2,
      "metadata": {
        "description": "Validates device version information",
        "category": "System"
      }
    }
  ]
}
```

**Backend Process:**
- Scans `/shared/jsnapy/testfiles/` directory for `.yml` files
- Extracts test metadata from YAML content
- Returns structured test list to frontend

#### 2. Device Configuration
```bash
# API endpoint: POST /api/operations/validation/configure
curl -X POST "http://localhost:8000/api/operations/validation/configure" \
  -H "Content-Type: application/json" \
  -d '{
    "selected_tests": ["test_version.yml", "test_bgp_summary.yml"],
    "device_hostname": "192.168.1.100",
    "credentials": {
      "username": "admin",
      "password": "password123"
    }
  }'
```

#### 3. Test Execution
```bash
# API endpoint: POST /api/operations/validation/execute
curl -X POST "http://localhost:8000/api/operations/validation/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "unique-job-uuid",
    "selected_tests": ["test_version.yml"],
    "device_hostname": "192.168.1.100",
    "credentials": {
      "username": "admin",
      "password": "password123"
    }
  }'
```

**Backend Process:**
1. Queues validation job to Redis
2. Worker process executes JSNAPy runner:
   ```bash
   python /app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py \
     --hostname 192.168.1.100 \
     --username admin \
     --password password123 \
     --tests "test_version.yml" \
     --mode check \
     --tag validation
   ```
3. JSNAPy Runner behavior:
   - **Full JSNAPy Mode:** Executes real JSNAPy tests if libraries available
   - **Device Simulation Mode:** Connects to device, simulates test execution
   - **Offline Simulation Mode:** Pure simulation without device connection
4. Publishes real-time progress via WebSocket
5. Returns individual test case results

#### 4. Real-time Communication
```javascript
// Frontend WebSocket subscription
const ws_channel = `job:${jobId}`;
sendMessage({
    type: 'SUBSCRIBE',
    channel: ws_channel
});

// Test execution events:
{
  "type": "progress",
  "event_type": "STEP_START",
  "message": "Starting JSNAPy validation for 1 test(s): test_version.yml"
}

{
  "type": "progress",
  "event_type": "STEP_PROGRESS",
  "message": "Executing JSNAPy test: test_version"
}

{
  "type": "result",
  "event_type": "PRE_CHECK_COMPLETE",
  "message": "JSNAPy Test Results: 1/1 passed",
  "data": {
    "validation_passed": true,
    "total_tests": 1,
    "passed_tests": 1,
    "failed_tests": 0,
    "results_by_host": [
      {
        "hostname": "192.168.1.100",
        "test_results": [
          {
            "test_name": "test_version",
            "title": "test_version - check_device_model_exists",
            "status": "passed",
            "message": "✅ Test validation passed",
            "data": {
              "simulation_mode": true,
              "rpc_command": "get-software-information"
            }
          }
        ]
      }
    ]
  }
}
```

### JSNAPy Test File Formats

#### Format 1: tests_include Format (Recommended)
```yaml
# shared/jsnapy/testfiles/test_version.yml
tests_include:
  - check_device_model_exists

check_device_model_exists:
  - rpc: get-software-information
  - iterate:
      xpath: //software-information
      id: product-model, junos-version
      tests:
        - is-not-empty: product-model
          err: "❌ Device product model string is empty!"
          info: "✅ Test Passed. Device model is '{{post['product-model']}}' and Software Version is '{{post['junos-version']}}'."
```

#### Format 2: Direct Test Definition
```yaml
# shared/jsnapy/testfiles/test_bgp_summary.yml
test_metadata:
  description: "Validates BGP neighbor state"
  category: "Routing"

check_bgp_summary:
  - rpc: get-bgp-summary-information
  - iterate:
      xpath: '//bgp-peer'
      tests:
        - is-equal: peer-state, Established
          err: "❌ BGP peer {{post['peer-address']}} is NOT Established"
          info: "✅ BGP peer {{post['peer-address']}} is Established."
```

## Development Commands

### Starting the System
```bash
# Start all services
docker-compose up -d

# Start individual services
docker-compose up -d redis_broker
docker-compose up -d rust_backend
docker-compose up -d fastapi_gateway
docker-compose up -d fastapi_worker

# Frontend development
cd frontend
npm run dev
```

### Testing Components

#### Templates.jsx Testing
```bash
# Test template discovery
curl -X GET "http://localhost:8000/api/templates" | jq

# Test template deployment (with rollback)
curl -X POST "http://localhost:8000/api/operations/template/deploy/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "test-template-'$(date +%s)'",
    "template_name": "interface_config.j2",
    "device_hostname": "192.168.100.4",
    "credentials": {"username": "admin", "password": "password123"},
    "template_variables": {
      "interface_name": "ge-0/0/1",
      "ip_address": "10.1.1.1/24"
    },
    "rollback_enabled": true
  }'
```

#### Validation.jsx Testing
```bash
# Test discovery
curl -X GET "http://localhost:8000/api/tests" | jq

# Test JSNAPy validation
curl -X POST "http://localhost:8000/api/operations/validation/execute" \
  -H "Content-Type: application/json" \
  -d '{
    "job_id": "test-validation-'$(date +%s)'",
    "selected_tests": ["test_version.yml", "test_bgp_summary.yml"],
    "device_hostname": "192.168.100.4",
    "credentials": {"username": "admin", "password": "password123"}
  }'
```

### Monitoring & Debugging

#### View Real-time Logs
```bash
# Follow API Gateway logs
docker compose logs -f fastapi_gateway

# Follow Worker logs
docker compose logs -f fastapi_worker

# Follow Rust WebSocket Hub logs
docker compose logs -f rust_backend

# Follow Redis logs
docker compose logs -f redis_broker
```

#### Monitor WebSocket Messages
```bash
# Monitor Redis pub/sub channels (requires redis-cli)
docker compose exec redis_broker redis-cli
> PSUBSCRIBE 'ws_channel:*'
```

#### Test JSNAPy Runner Directly
```bash
docker compose exec fastapi_worker python /app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py \
  --hostname 192.168.100.4 \
  --username admin \
  --password password123 \
  --tests "test_version.yml" \
  --mode check
```

## Troubleshooting Guide

### Common Issues

1. **Templates Not Loading**
   - Check volume mount: `ls -la shared/templates/`
   - Verify file permissions: `chmod 644 shared/templates/*.j2`
   - Check API Gateway logs for template discovery errors

2. **JSNAPy Tests Not Found**
   - Verify test files: `ls -la shared/jsnapy/testfiles/`
   - Check test file format and YAML syntax
   - Examine worker logs for path resolution issues

3. **WebSocket Connection Issues**
   - Verify Rust backend is running: `docker compose ps rust_backend`
   - Check Redis connectivity: `docker compose exec redis_broker redis-cli ping`
   - Monitor WebSocket channel subscription in browser dev tools

4. **Job Execution Failures**
   - Check worker logs: `docker compose logs fastapi_worker`
   - Verify device connectivity and credentials
   - Check script permissions in container

5. **Statistics Calculation Issues**
   - Verify selected tests count vs results count
   - Check validation report logic for file vs test case counting
   - Monitor browser console for JavaScript errors

### Performance Optimization

1. **Template Rendering**
   - Cache compiled templates in memory
   - Use Jinja2 environment with optimized loaders
   - Pre-validate template syntax

2. **JSNAPy Test Execution**
   - Batch multiple test files in single device connection
   - Cache device connections for concurrent tests
   - Use connection pooling for multiple validations

3. **WebSocket Scaling**
   - Implement message batching for high-frequency updates
   - Use Redis streams for better message ordering
   - Add WebSocket connection health monitoring

## Session Continuity

### Resuming from Another Computer

The ThinkNet system is **stateless** and can be resumed from any computer with the following steps:

#### 1. Git Repository Setup
```bash
# Clone the repository on the new computer
git clone <your-git-repo-url> thinknet
cd thinknet

# Install dependencies
cd frontend && npm install
cd ../app_gateway && pip install -r requirements.txt
cd ../backend && cargo build
```

#### 2. Docker Environment Setup
```bash
# Copy environment files from original computer
scp user@original-computer:thinknet/.env* .
scp user@original-computer:thinknet/docker-compose.yml .

# Start services
docker-compose up -d
```

#### 3. Volume Data Persistence
All important data is persisted in Docker volumes:
- **shared/templates/** - Template files persist across restarts
- **shared/jsnapy/** - Test files and snapshots persist
- **temp_upload_storage/** - Temporary files persist
- **Redis data** - Job queues and session state persist

#### 4. Current Session Recovery
Since the system uses real-time WebSocket communication:
- **Previous jobs** are visible in logs but not actively running
- **New sessions** start fresh with clean state
- **Historical data** is preserved in logs and Redis

#### 5. Configuration Transfer
```bash
# Export current configurations (if needed)
docker compose exec redis_broker redis-cli --rdb backup-$(date +%Y%m%d).rdb

# Transfer to new computer
scp backup-*.rdb user@new-computer:/thinknet/
docker compose exec redis_broker redis-cli --rdb backup-*.rdb
```

### Key Points for Session Continuity

✅ **Stateless Design:** No session state is stored in the frontend
✅ **Docker Volumes:** All data persists in named volumes
✅ **Git Repository:** Code and configuration tracked in version control
✅ **Environment Files:** Docker configuration can be copied
✅ **Redis Persistence:** Job queues and some state persist in Redis
✅ **Log Files:** Complete execution history available in container logs

The system will resume exactly where you left off, with all templates, test files, and configurations intact.

---

## Conclusion

The ThinkNet Automation System provides a robust, scalable platform for network configuration deployment and validation. Both Templates.jsx and Validation.jsx follow consistent patterns:

- **4-step wizard UI** for guided user experience
- **Real-time WebSocket communication** for live progress tracking
- **Comprehensive error handling** with detailed reporting
- **Fallback mechanisms** for resilient operation
- **Modern React architecture** with reusable components

The system is designed for production use with proper error handling, logging, monitoring, and session continuity across different development environments.