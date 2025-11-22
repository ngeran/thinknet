
#!/bin/bash
# setup_pyright.sh

# --- Configuration ---
VENV_NAME=".venv_pyright"
REQUIREMENTS_FILE="requirements.txt"

# 💡 NEW/CORRECTED LOGIC: Find the highest compatible version (3.12, then 3.11)
PYTHON_EXEC=""
if command -v python3.12 &>/dev/null; then
  PYTHON_EXEC="python3.12"
elif command -v python3.11 &>/dev/null; then
  PYTHON_EXEC="python3.11"
else
  echo "FATAL ERROR: Neither python3.12 nor python3.11 could be found."
  echo "The dependencies (pydantic-core) are not compatible with Python 3.13 or 3.14."
  echo "Please install python3.12 or python3.11 on your local system to continue."
  exit 1
fi
echo "Using compatible Python interpreter: $PYTHON_EXEC"

# 2. Clean up and recreate the virtual environment
if [ -d "$VENV_NAME" ]; then
  echo "Cleaning up existing environment '$VENV_NAME'..."
  rm -rf "$VENV_NAME"
fi

echo "Creating virtual environment '$VENV_NAME' using $PYTHON_EXEC..."
# Use the explicit, stable Python version found above
"$PYTHON_EXEC" -m venv "$VENV_NAME"
if [ $? -ne 0 ]; then
  echo "ERROR: Failed to create virtual environment."
  exit 1
fi
echo "Virtual environment created."

# Determine the absolute path to the Python binary inside the new venv
PYTHON_BIN_PATH="$(pwd)/$VENV_NAME/bin/python"

# 3. Install dependencies (rest of the script remains the same)
echo "Installing dependencies from $REQUIREMENTS_FILE into $VENV_NAME..."
"$PYTHON_BIN_PATH" -m pip install -r "$REQUIREMENTS_FILE"
if [ $? -ne 0 ]; then
  echo "ERROR: Failed to install dependencies. Check the full output above."
  exit 1
fi

# 4. Create or update pyrightconfig.json
PYRIGHT_CONFIG="pyrightconfig.json"
echo "Creating/Updating $PYRIGHT_CONFIG..."

# Determine the version number to write to the config
PYTHON_VERSION_NUMBER=$("$PYTHON_EXEC" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")

cat <<EOT >"$PYRIGHT_CONFIG"
{
    "executionEnvironments": [
        {
            "root": ".",
            "pythonVersion": "$PYTHON_VERSION_NUMBER",
            "pythonPlatform": "Linux",
            "venvPath": ".",
            "venv": "$VENV_NAME"
        }
    ],
    // Includes both primary Python codebases
    "include": [
        "app_gateway",
        "frontend/py_scripts"
    ],
    "exclude": [
        "**/__pycache__",
        "**/*.pyc",
        "$VENV_NAME"
    ],
    "typeCheckingMode": "basic",
    "reportMissingTypeStubs": false
}
EOT

echo "✅ Pyright setup complete. The virtual environment uses Python $PYTHON_VERSION_NUMBER."
echo "You can now run 'pyright' from the root, or check your editor."
