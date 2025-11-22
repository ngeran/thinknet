#!/bin/bash
# fix_init_files.sh

echo "🔧 Fixing __init__.py files..."

# Fix core module
if [ -f "core/init.py" ] && [ -f "core/__init__.py" ]; then
    echo "Fixing core module..."
    mv "core/init.py" "core/__init__.py"
fi

# Fix connectivity module  
if [ -f "connectivity/init.py" ] && [ -f "connectivity/__init__.py" ]; then
    echo "Fixing connectivity module..."
    mv "connectivity/init.py" "connectivity/__init__.py"
fi

# Fix validation module
if [ -f "validation/init.py" ] && [ -f "validation/__init__.py" ]; then
    echo "Fixing validation module..."
    mv "validation/init.py" "validation/__init__.py"
fi

# Fix progress module
if [ -f "progress/init.py" ] && [ -f "progress/__init__.py" ]; then
    echo "Fixing progress module..."
    mv "progress/init.py" "progress/__init__.py"
fi

# Fix upgrade module
if [ -f "upgrade/init.py" ] && [ -f "upgrade/__init__.py" ]; then
    echo "Fixing upgrade module..."
    mv "upgrade/init.py" "upgrade/__init__.py"
fi

# Fix utils module
if [ -f "utils/init.py" ] && [ -f "utils/__init__.py" ]; then
    echo "Fixing utils module..."
    mv "utils/init.py" "utils/__init__.py"
fi

echo "✅ All __init__.py files fixed!"
