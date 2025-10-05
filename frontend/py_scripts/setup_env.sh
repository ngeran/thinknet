#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define the name of the virtual environment directory
VENV_DIR="venv"

echo "Starting environment setup for xaospy project..."

# 1. Create the virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
else
  echo "Virtual environment already exists."
fi

# 2. Activate the virtual environment
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# 3. Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
  echo "Error: requirements.txt file not found!"
  echo "Please ensure you have created this file with all project dependencies."
  exit 1
fi

# 4. Install dependencies from requirements.txt
echo "Installing dependencies from requirements.txt..."
pip install -r requirements.txt

# 5. Deactivate the virtual environment to complete the script
echo "Deactivating virtual environment..."
deactivate

echo "Environment setup complete! 🎉"
echo "To activate the environment, run 'source venv/bin/activate'."
