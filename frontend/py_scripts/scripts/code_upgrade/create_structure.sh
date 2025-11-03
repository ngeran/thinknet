#!/bin/bash

# Create main project directory (if script is run from within it, no need to create)
mkdir -p core connectivity validation progress upgrade utils

# Create root files
touch README.md
touch run.py

# Create core directory files
touch core/__init__.py
touch core/exceptions.py
touch core/constants.py
touch core/dataclasses.py
touch core/enums.py

# Create connectivity directory files
touch connectivity/__init__.py
touch connectivity/device_connector.py
touch connectivity/reachability.py

# Create validation directory files
touch validation/__init__.py
touch validation/pre_check_engine.py
touch validation/post_upgrade_validator.py
touch validation/version_manager.py

# Create progress directory files
touch progress/__init__.py
touch progress/event_sender.py
touch progress/formatter.py

# Create upgrade directory files
touch upgrade/__init__.py
touch upgrade/device_upgrader.py
touch upgrade/rollback_manager.py
touch upgrade/software_installer.py

# Create utils directory files
touch utils/__init__.py
touch utils/json_utils.py
touch utils/network_utils.py

# Set appropriate permissions
chmod -R 755 .
chmod 644 *.py *.md

echo "Directory structure and files created successfully!"
