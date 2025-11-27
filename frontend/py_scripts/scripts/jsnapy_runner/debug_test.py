#!/usr/bin/env python3
"""
Debug script to test JSNAPy connection and storage check
"""

import sys
import json
import os

print(
    json.dumps(
        {
            "type": "progress",
            "event_type": "DEBUG_START",
            "message": "Starting JSNAPy debug test",
            "data": {"hostname": "172.27.200.200"},
        }
    ),
    flush=True,
)

try:
    from jnpr.jsnapy import SnapAdmin

    print(
        json.dumps(
            {
                "type": "progress",
                "event_type": "DEBUG_IMPORT",
                "message": "✅ JSNAPy import successful",
                "data": {},
            }
        ),
        flush=True,
    )
except ImportError as e:
    print(
        json.dumps(
            {
                "type": "error",
                "event_type": "DEBUG_IMPORT",
                "message": f"❌ JSNAPy import failed: {e}",
                "data": {"error": str(e)},
            }
        ),
        flush=True,
    )
    sys.exit(1)

# Test configuration
config_dir = "/etc/jsnapy"
os.makedirs(config_dir, exist_ok=True)

cfg_path = os.path.join(config_dir, "jsnapy.cfg")
cfg_content = """
[DEFAULT]
snapshot_path = /app/shared/jsnapy/snapshots
test_file_path = /app/shared/jsnapy/testfiles
"""
with open(cfg_path, "w") as f:
    f.write(cfg_content.strip())

print(
    json.dumps(
        {
            "type": "progress",
            "event_type": "DEBUG_CONFIG",
            "message": "✅ JSNAPy configuration created",
            "data": {"config_path": cfg_path},
        }
    ),
    flush=True,
)

# Test basic connection
try:
    js = SnapAdmin()
    print(
        json.dumps(
            {
                "type": "progress",
                "event_type": "DEBUG_SNAPADMIN",
                "message": "✅ SnapAdmin initialized",
                "data": {},
            }
        ),
        flush=True,
    )

    # Simple test config
    test_config = """
        hosts:
          - device: 172.27.200.200
            username: admin
            passwd: manolis1
        tests:
          - test_storage_check
        """

    print(
        json.dumps(
            {
                "type": "progress",
                "event_type": "DEBUG_CONNECT",
                "message": "🔄 Testing connection to device...",
                "data": {"hostname": "172.27.200.200"},
            }
        ),
        flush=True,
    )

    # This will test basic connectivity
    js.snapcheck(test_config, "debug_test")

    print(
        json.dumps(
            {
                "type": "result",
                "event_type": "DEBUG_SUCCESS",
                "message": "✅ JSNAPy connection test successful",
                "data": {"hostname": "172.27.200.200"},
            }
        ),
        flush=True,
    )

except Exception as e:
    print(
        json.dumps(
            {
                "type": "error",
                "event_type": "DEBUG_CONNECT",
                "message": f"❌ Connection test failed: {e}",
                "data": {"error": str(e), "hostname": "172.27.200.200"},
            }
        ),
        flush=True,
    )
    sys.exit(1)
