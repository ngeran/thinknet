#!/bin/bash
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== cRPD Image Loader ==="
# Safe globbing in case no files exist
shopt -s nullglob
IMAGE_FILES=(crpd-images/*.tgz crpd-images/*.tar.gz)
shopt -u nullglob

if [ ${#IMAGE_FILES[@]} -eq 0 ]; then
    echo -e "${RED}No cRPD image files found in crpd-images/${NC}"
    exit 1
fi

echo -e "${GREEN}Found images:${NC}"
select img in "${IMAGE_FILES[@]}"; do
    if [ -n "$img" ]; then
        echo "Loading $img..."
        docker load -i "$img"
        echo ""
        echo -e "${GREEN}Image Loaded.${NC} Verify repository name below is 'crpd':"
        docker images | grep crpd
        break
    else
        echo "Invalid selection."
    fi
done
