# Juniper Device Code Upgrade - Enhanced Edition

Enterprise-grade Juniper device firmware upgrade automation using PyEZ framework.

## 🚀 Features

- **Comprehensive Pre-Upgrade Validation** (10+ checks)
- **Real-time Progress Reporting** to stdout/stderr
- **Automatic Error Recovery & Rollback**
- **Multi-stage Reboot Recovery** with adaptive polling
- **Platform-aware Timeout Management**
- **Structured Logging** with audit trail
- **Frontend Event Integration** via JSON
- **Human-readable Console Output**

## 📋 Requirements

- Python 3.7+
- junos-eznc (PyEZ) library
- Network connectivity to target device
- Valid device credentials
- Image file pre-uploaded to `/var/tmp/` on device

## 🏗️ Architecture

The application is organized into logical modules:

### Core Components
- `core/` - Base classes, exceptions, constants, and data structures
- `connectivity/` - Device connection and reachability testing
- `validation/` - Pre/post-upgrade validation and version management
- `progress/` - Real-time event reporting and output formatting
- `upgrade/` - Main upgrade orchestration and rollback management
- `utils/` - Utility functions and helpers

## 📁 Module Overview

### Core Module (`core/`)
- **exceptions.py** - Hierarchical exception classes for error handling
- **constants.py** - Configuration values and operational parameters
- **dataclasses.py** - Data structures for state tracking
- **enums.py** - Enumerated types for categorical states

### Connectivity Module (`connectivity/`)
- **device_connector.py** - Device session management and connection lifecycle
- **reachability.py** - Network reachability testing and reboot recovery

### Validation Module (`validation/`)
- **pre_check_engine.py** - Comprehensive pre-upgrade validation (10+ checks)
- **post_upgrade_validator.py** - Post-upgrade functional validation
- **version_manager.py** - Version parsing, comparison, and risk assessment

### Progress Module (`progress/`)
- **event_sender.py** - Real-time JSON event delivery to frontend
- **formatter.py** - Human-readable console output formatting

### Upgrade Module (`upgrade/`)
- **device_upgrader.py** - Main upgrade orchestration and workflow management
- **rollback_manager.py** - Automatic rollback functionality
- **software_installer.py** - Software installation with fallback strategies

### Utils Module (`utils/`)
- **json_utils.py** - Safe JSON serialization utilities
- **network_utils.py** - Network connectivity helpers

## 🔧 Usage

### Basic Upgrade
```bash
python main.py \
    --hostname 192.168.1.1 \
    --username admin \
    --password secret123 \
    --target-version 21.4R3.15 \
    --image-filename junos-srxsme-21.4R3.15.tgz
