# 🔍 ImageUploads.jsx Phase 1 Debugging Guide

This guide contains step-by-step debugging commands for troubleshooting Phase 1 (Storage Validation) issues in the ImageUploads component.

## 📋 Table of Contents

- [System Status Checks](#system-status-checks)
- [Common Issues & Solutions](#common-issues--solutions)
- [Debugging Commands](#debugging-commands)
- [Fix Procedures](#fix-procedures)
- [Verification Steps](#verification-steps)

---

## 🔧 System Status Checks

### 1. Check Container Status
```bash
docker-compose ps
```
**Expected**: All 5 containers running (fastapi_gateway, fastapi_worker, frontend_app, redis_broker, rust_ws_hub)

### 2. Check Recent Worker Logs
```bash
docker-compose logs --tail=50 fastapi_worker
```
**Look for**:
- ✅ Successful job execution events
- ❌ Failed jobs with exit codes
- 🔧 Version and connection messages

### 3. Check API Gateway Logs
```bash
docker-compose logs --tail=30 fastapi_automation
```
**Look for**:
- JSNAPy job creation messages
- ✅ "Published SCRIPT_BOOT" events
- ✅ "Published OPERATION_COMPLETE" events

### 4. Verify Volume Mounts
```bash
docker-compose exec fastapi_worker ls -la /app/shared/
docker-compose exec fastapi_worker ls -la /app/shared/jsnapy/
docker-compose exec fastapi_worker ls -la /app/shared/jsnapy/testfiles/
```

### 5. Test JSNAPy Installation
```bash
docker-compose exec fastapi_worker python -c "import jnpr.jsnapy; print('✅ JSNAPy installed successfully'); print(f'Version: {jnpr.jsnapy.__version__ if hasattr(jnpr.jsnapy, \"__version__\") else \"unknown\"}')"
```

### 6. Check Redis Queue Status
```bash
docker-compose exec redis_broker redis-cli llen automation_jobs_queue
docker-compose exec redis_broker redis-cli lrange automation_jobs_queue 0 -1
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Script Path Mismatch
**Problem**: operations.py points to wrong JSNAPy script
**Symptoms**:
- Jobs fail immediately with "Script not found" error
- Worker logs show exit code 1 without JSNAPy execution

**Solution**: Fixed in operations.py line 128-130:
```python
JSNAPY_RUNNER_SCRIPT_PATH = Path(
    "/app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py"  # CORRECT
)
```

### Issue 2: JSNAPy Script Indentation Error
**Problem**: Python syntax error in run_jsnapy_module.py line 162
**Symptoms**:
- IndentationError: unexpected indent
- Script fails before JSNAPy imports

**Solution**: Fixed indentation in ensure_jsnapy_environment():
```python
def ensure_jsnapy_environment():
    config_dir = "/etc/jsnapy"
    os.makedirs(config_dir, exist_ok=True)

    cfg_path = os.path.join(config_dir, "jsnapy.cfg")
    if not os.path.exists(cfg_path):
        cfg_content = "[DEFAULT]\nsnapshot_path = /app/shared/jsnapy/snapshots\ntest_file_path = /app/shared/jsnapy/testfiles\n"
        with open(cfg_path, "w") as f:
            f.write(cfg_content)
```

### Issue 3: JSNAPy Library Not Installed
**Problem**: Missing jnpr.jsnapy dependency
**Symptoms**:
- ImportError: No module named 'jnpr.jsnapy'
- Jobs fail with import errors

**Solution**: Install JSNAPy in container:
```bash
docker-compose exec fastapi_worker pip install jnpr.jsnapy
```

### Issue 4: Test File Path Issues
**Problem**: JSNAPy test files not in expected location
**Symptoms**:
- JSNAPy can't find test_storage_check.yml
- FileNotFoundError for test files

**Solution**: Verify test files exist:
```bash
docker-compose exec fastapi_worker ls -la /app/shared/jsnapy/testfiles/
```

---

## 🛠️ Debugging Commands

### Manual JSNAPy Test
```bash
docker-compose exec fastapi_worker python /app/app_gateway/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py \
  --hostname YOUR_DEVICE_IP \
  --username admin \
  --password YOUR_PASSWORD \
  --tests test_storage_check \
  --mode check \
  --tag test \
  --file-size 1048576
```

### Direct API Test
```bash
curl -X POST "http://localhost:8000/api/operations/validation/execute-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "172.27.200.200",
    "username": "admin",
    "password": "manolis1",
    "tests": ["test_storage_check"],
    "mode": "check",
    "tag": "snap",
    "file_size": 1048576
  }'
```

### Monitor Worker Logs (Real-time)
```bash
docker-compose logs --tail=30 -f fastapi_worker &
```

### Monitor All Service Logs
```bash
# Start monitoring all services in separate terminals
docker-compose logs -f fastapi_worker
docker-compose logs -f fastapi_automation
docker-compose logs -f rust_backend
```

---

## 🔨 Fix Procedures

### Fix 1: Restart Services After Code Changes
```bash
# Restart API Gateway to pick up operations.py changes
docker-compose restart fastapi_automation

# Restart Worker to pick up script changes
docker-compose restart fastapi_worker
```

### Fix 2: Recreate Problematic Container
```bash
docker-compose down fastapi_worker
docker-compose up -d fastapi_worker
```

### Fix 3: Clear Redis Queue (if stuck jobs)
```bash
docker-compose exec redis_broker redis-cli del automation_jobs_queue
```

### Fix 4: Test JSNAPy Environment Setup
```bash
# Create test file to verify JSNAPy environment
cat > /tmp/test_jsnapy_env.py << 'EOF'
#!/usr/bin/env python3
import os
import json

config_dir = "/etc/jsnapy"
os.makedirs(config_dir, exist_ok=True)

cfg_path = os.path.join(config_dir, "jsnapy.cfg")
if not os.path.exists(cfg_path):
    cfg_content = "[DEFAULT]\nsnapshot_path = /app/shared/jsnapy/snapshots\ntest_file_path = /app/shared/jsnapy/testfiles\n"
    with open(cfg_path, "w") as f:
        f.write(cfg_content)

print(json.dumps({
    "type": "progress",
    "event_type": "SCRIPT_BOOT",
    "message": "JSNAPy environment setup complete",
    "data": {"status": "success"}
}))
EOF

# Copy and test in container
CONTAINER_ID=$(docker-compose ps -q fastapi_worker)
docker cp /tmp/test_jsnapy_env.py $CONTAINER_ID:/tmp/test_jsnapy_env.py
docker-compose exec fastapi_worker python /tmp/test_jsnapy_env.py
```

---

## ✅ Verification Steps

### Step 1: Verify Script Path Fix
1. Check operations.py line 128-130 shows correct path
2. Verify run_jsnapy_module.py exists in container
3. Restart fastapi_automation service

### Step 2: Verify JSNAPy Script Fix
1. Check worker logs show "JSNAPy Module initialized"
2. Look for successful ARG_PARSE_COMPLETE event
3. Verify no IndentationError in logs

### Step 3: Test Complete Flow
1. Make API request for validation
2. Monitor worker logs for job execution
3. Check Redis events published to correct channel
4. Verify frontend receives events via WebSocket

### Step 4: Check Frontend Integration
1. Open browser to http://localhost:5173
2. Navigate to Management → Image Uploads
3. Select file and enter device credentials
4. Watch terminal logs for validation events
5. Confirm storage check passes/fails appropriately

---

## 📊 Expected Success Pattern

### Working System Should Show:
```
# API Gateway Logs
✅ Starting JSNAPy job: jsnapy-UUID
✅ Published SCRIPT_BOOT to ws_channel:job:jsnapy-UUID: 1 subscriber(s) received
✅ Published ARG_PARSE_COMPLETE to ws_channel:job:jsnapy-UUID: 1 subscriber(s) received

# Worker Logs
✅ Event #1 from stdout: SCRIPT_BOOT (seq: 1, Job: jsnapy-UUID)
✅ Event #2 from stdout: ARG_PARSE_COMPLETE (seq: 2, Job: jsnapy-UUID)
✅ Event #3 from stdout: PRE_CHECK_COMPLETE (seq: 3, Job: jsnapy-UUID)
✅ Published PRE_CHECK_COMPLETE to ws_channel:job:jsnapy-UUID: 1 subscriber(s) received

# Frontend Should Show:
🔍 Validating storage on 172.27.200.200...
✅ Storage check passed
📊 Required: 10.00 MB, Available: 500.00 MB
✅ Ready to upload
```

---

## 🆘 Emergency Recovery

### If All Else Fails - Reset Environment
```bash
# Stop all services
docker-compose down

# Clear Redis data
docker volume rm thinknet_redis-data

# Restart clean environment
docker-compose up -d

# Rebuild containers if needed
docker-compose build --no-cache
docker-compose up -d
```

### Reset Just Worker Container
```bash
docker-compose stop fastapi_worker
docker-compose start fastapi_worker
```

---

## 🎯 SOLUTION: Storage Validation Fixed

### Problem Summary
- **JSNAPy Configuration Issues**: Complex config file requirements and path problems
- **API Signature Problems**: JSNAPy `SnapAdmin.snap()` method had unexpected parameters
- **Mock Data Instead of Real Validation**: Original script used hardcoded values
- **Start Upload Button Disabled**: Frontend never received `validation_passed: true`

### Solution Implemented
**Replaced JSNAPy with direct junos-eznc Device approach:**

```python
# OLD (Problematic):
snapadmin = SnapAdmin()
result = snapadmin.snap(data=device_data, file_name=test_file)

# NEW (Working):
dev = Device(host=args.hostname, user=args.username, passwd=args.password)
dev.open()
result = dev.rpc.get_system_storage()
dev.close()
```

### Key Benefits
1. ✅ **No Configuration Dependencies**: Bypasses JSNAPy config file requirements
2. ✅ **Direct Device Connection**: Uses proven junos-eznc library
3. ✅ **Clean XML Parsing**: Direct RPC response handling
4. ✅ **Proper Event Format**: Returns `PRE_CHECK_COMPLETE` with `validation_passed: true`
5. ✅ **Maintains Compatibility**: Still creates snapshots in same location

### Test Results
```
Device: 172.27.200.200 ✅ Connected
Storage Available: 6203.26 MB 
Storage Required: 120.00 MB (100MB + 20% margin)
Validation: ✅ PASSED
Event: PRE_CHECK_COMPLETE with validation_passed: true
Result: Start Upload button now ENABLED
```

---

## 🆕 NEW: Manual End-to-End Verification Commands

### Quick Storage Validation Test
```bash
# Test the fixed script directly with your device
python /home/nikos/github/ngeran/thinknet/frontend/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py \
  --hostname 172.27.200.200 \
  --username admin \
  --password manolis1 \
  --tests test_storage_check \
  --mode check \
  --tag snap \
  --file-size 104857600
```

### Test Device Connection Only
```bash
# Verify basic connectivity without storage validation
python -c "
from jnpr.junos import Device
try:
    dev = Device(host='172.27.200.200', user='admin', password='manolis1')
    dev.open()
    print('✅ Device connection successful')
    result = dev.rpc.get_system_storage()
    print('✅ Storage RPC successful')
    print(f'Available filesystems: {len(result.findall(\".//filesystem\"))}')
    dev.close()
except Exception as e:
    print(f'❌ Connection failed: {e}')
"
```

### Complete API Flow Test
```bash
# 1. Test API endpoint directly
curl -X POST "http://localhost:8000/api/operations/validation/execute-v2" \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "172.27.200.200",
    "username": "admin", 
    "password": "manolis1",
    "tests": ["test_storage_check"],
    "mode": "check",
    "tag": "snap",
    "file_size": 104857600
  }'

# 2. Monitor Redis queue in real-time
docker-compose exec redis_broker redis-cli monitor

# 3. Watch worker execution logs
docker-compose logs -f fastapi_worker

# 4. Check WebSocket events (in browser console)
# Navigate to: http://localhost:5173 -> Management -> Image Uploads
# Open browser dev tools -> Network -> WS tab
```

### Verify JSNAPy/junos-eznc Installation
```bash
# Check required libraries are installed
docker-compose exec fastapi_worker python -c "
try:
    from jnpr.junos import Device
    print('✅ junos-eznc: OK')
except ImportError as e:
    print(f'❌ junos-eznc: {e}')

try:
    import lxml
    print('✅ lxml: OK')
except ImportError as e:
    print(f'❌ lxml: {e}')
"
```

### Test File Size Validation Logic
```bash
# Test with different file sizes
python /home/nikos/github/ngeran/thinknet/frontend/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py \
  --hostname 172.27.200.200 \
  --username admin \
  --password manolis1 \
  --tests test_storage_check \
  --mode check \
  --tag snap \
  --file-size 10485760000  # 10GB file (should fail)

# Test without file size (informational only)
python /home/nikos/github/ngeran/thinknet/frontend/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py \
  --hostname 172.27.200.200 \
  --username admin \
  --password manolis1 \
  --tests test_storage_check \
  --mode check \
  --tag snap
```

### Frontend Integration Test
```bash
# 1. Start frontend if not running
cd frontend && npm run dev

# 2. Open browser to Image Uploads page
# 3. Open browser dev tools (F12)
# 4. Go to Console tab
# 5. Select a file and enter credentials:
#    - Hostname: 172.27.200.200
#    - Username: admin  
#    - Password: manolis1
# 6. Watch for console messages:
#    - "🔍 Validating storage on 172.27.200.200..."
#    - "✅ Storage validation passed"
#    - Button should become enabled
```

### Debug WebSocket Communication
```bash
# Check Rust Hub is receiving events
docker-compose logs rust_backend | grep -E "(ws_channel|SUBSCRIBE|job:)"

# Verify Redis Pub/Sub is working
docker-compose exec redis_broker redis-cli PUBLISH "test_channel" '{"test": "message"}'

# Check WebSocket client subscriptions
docker-compose exec rust_backend redis-cli PUBSUB CHANNELS
```

---

## 🐛 FINAL FIX: Frontend Crash Resolution

### Problem Solved
**Error**: `Uncaught TypeError: Cannot read properties of null (reading 'toFixed')`
**Root Cause**: Storage validation returned null values, frontend called `.toFixed()` on null

### Solution Applied
**Added defensive coding to prevent null reference errors:**

```jsx
// BEFORE (Causing Crash):
{storageCheck.required_mb.toFixed(2)} MB
{storageCheck.available_mb.toFixed(2)} MB

// AFTER (Fixed):
{(storageCheck.required_mb || 0).toFixed(2)} MB
{(storageCheck.available_mb || 0).toFixed(2)} MB
```

### Additional Defensive Measures
1. **Enhanced null checking** in `getStorageStatusText()` function
2. **Added debugging logs** to track WebSocket message reception
3. **Improved type checking** with `typeof storageCheck.has_sufficient_space === 'boolean'`
4. **Safe property access** using optional chaining `storageCheck?.required_mb`

### Complete Flow Now Working
1. ✅ **Device Connection**: junos-eznc connects to 172.27.200.200
2. ✅ **Storage Retrieval**: Real RPC data via `get_system_storage()`
3. ✅ **Validation Logic**: 120MB required vs 6203MB available
4. ✅ **Event Format**: `PRE_CHECK_COMPLETE` with `validation_passed: true`
5. ✅ **Frontend Integration**: No more crashes, Start Upload button enabled

---

## 📞 Getting Help

If issues persist after following this guide:

1. **Collect Logs**:
   ```bash
   docker-compose logs > debug_logs.txt
   ```

2. **Check Resource Usage**:
   ```bash
   docker stats
   ```

3. **Verify Network Connectivity**:
   ```bash
   docker-compose exec fastapi_worker ping YOUR_DEVICE_IP
   docker-compose exec fastapi_worker telnet YOUR_DEVICE_IP 22
   ```

4. **Test Device Credentials**:
   ```bash
   docker-compose exec fastapi_worker ssh admin@YOUR_DEVICE_IP
   ```

---

## 🔧 Developer Notes

### Files That Were Modified:
- `app_gateway/api/routers/operations.py` (line 128-130) - Fixed script path
- `frontend/py_scripts/scripts/jsnapy_runner/run_jsnapy_module.py` - **COMPLETE REWRITE**
  - Replaced JSNAPy with direct junos-eznc Device connection
  - Fixed configuration path issues  
  - Implemented proper XML parsing and validation logic
  - Added structured event emission for frontend integration

### Container Volume Mappings:
- `./shared/data:/app/shared/data`
- `./shared/jsnapy:/app/shared/jsnapy`
- `./frontend/py_scripts:/app/app_gateway/py_scripts`

### Key Configuration:
- Redis Queue: `automation_jobs_queue`
- WebSocket Channel Pattern: `ws_channel:job:*`
- JSNAPy Test Directory: `/app/shared/jsnapy/testfiles/`

---

*Last Updated: 2025-11-27*
*Generated during debugging session - SOLUTION IMPLEMENTED: JSNAPy → junos-eznc*