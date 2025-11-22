#!/bin/bash
# ==============================================================================
# Script Name: setup-crpd-lab.sh
# Version:     4.0 (Foreground Fix)
# Description: Generates cRPD Lab files.
#              Fixed: Container Restart Loop (added -N flag to rpd).
#              Fixed: "Undefined service" log error (profile dependency).
# ==============================================================================

set -e

# ==============================================================================
# SECTION 1: CONFIGURATION
# ==============================================================================

CRPD_TAG="25.2R1-S1.4"
CRPD_IMAGE_NAME="crpd"

# Safe Networking (10.99.1.x)
LAB_SUBNET="10.99.1.0/24"
CRPD_IP="10.99.1.10"
INIT_CONTAINER_IP="10.99.1.99"

# Safe Ports (2222 for SSH to avoid host conflict)
SSH_PORT="2222"
NETCONF_PORT="8830"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==============================================================================
# SECTION 2: SETUP FUNCTIONS
# ==============================================================================

check_prerequisites() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed."
        exit 1
    fi
}

create_directory_structure() {
    print_status "Creating directories..."
    directories=("configs" "scripts" "crpd-images" "docker-images" "crpd-data" "license")
    for dir in "${directories[@]}"; do
        [ ! -d "$dir" ] && mkdir -p "$dir"
    done
}

create_env_file() {
    print_status "Creating .env file..."
    cat > .env << EOF
CRPD_TAG=${CRPD_TAG}
CRPD_IMAGE_NAME=${CRPD_IMAGE_NAME}
EOF
}

create_docker_compose() {
    print_status "Creating docker-compose.yml..."
    cat > docker-compose.yml << EOF
services:
  crpd:
    image: \${CRPD_IMAGE_NAME}:\${CRPD_TAG}
    container_name: juniper-crpd
    hostname: crpd-lab
    privileged: true
    tty: true
    stdin_open: true
    networks:
      lab-net:
        ipv4_address: ${CRPD_IP}
    volumes:
      - ./configs:/config
      - ./scripts:/scripts
      - ./license:/config/license
      - crpd-persist:/var/crpd
    ports:
      - "${SSH_PORT}:22"
      - "${NETCONF_PORT}:830"
      - "5000:5000"
    environment:
      - TZ=UTC
    restart: unless-stopped
    profiles: [ "run-crpd" ]
    command: >
      sh -c "
        if [ -f /config/crpd.conf ]; then
          cp /config/crpd.conf /etc/crpd.conf;
        fi;
        # FIX: Added -N flag. This runs RPD in foreground.
        # Without -N, it daemonizes and Docker thinks the container finished.
        /sbin/rpd -N -c /etc/crpd.conf -v --log-level=info
      "

  crpd-init:
    image: alpine
    container_name: crpd-init
    networks:
      lab-net:
        ipv4_address: ${INIT_CONTAINER_IP}
    profiles: [ "init" ]
    depends_on:
      - crpd
    command: >
      sh -c "
        sleep 10;
        echo '=============================================';
        echo '🚀 cRPD Lab is RUNNING!';
        echo '📡 Internal IP:   ${CRPD_IP}';
        echo '🔑 Default Creds: root / Juniper123';
        echo '💻 SSH Access:    ssh root@localhost -p ${SSH_PORT}';
        echo '=============================================';
      "

  crpd-status:
    image: alpine
    container_name: crpd-status
    profiles: [ "status" ]
    depends_on:
      - crpd
    command: >
      sh -c "
        apk add --no-cache netcat-openbsd;
        echo 'Checking internal connectivity...';
        if nc -z crpd 22; then
          echo '✅ cRPD is UP (Port 22 Open)';
        else
          echo '❌ cRPD is DOWN';
        fi;
      "

networks:
  lab-net:
    driver: bridge
    ipam:
      config:
        - subnet: ${LAB_SUBNET}

volumes:
  crpd-persist:
    driver: local
EOF
    print_success "docker-compose.yml created."
}

create_crpd_config() {
    print_status "Creating configs/crpd.conf..."
    cat > configs/crpd.conf << EOF
system {
    host-name crpd-lab;
    root-authentication {
        encrypted-password "\$6\$rounds=410000\$xyz\$J9y/";
    }
    services {
        ssh { root-login allow; }
        netconf { ssh; }
    }
}
interfaces {
    lo0 { unit 0 { family inet { address 127.0.0.1/32; } } }
}
routing-options {
    router-id ${CRPD_IP};
    autonomous-system 65000;
}
EOF
}

create_management_script() {
    print_status "Creating scripts/manage-lab.sh..."
    cat > scripts/manage-lab.sh << 'EOF'
#!/bin/bash

case "$1" in
    start)
        echo "Starting cRPD lab..."
        docker compose --profile run-crpd --profile init up -d
        # FIX: Added '--profile run-crpd' here so Docker sees the dependency
        echo "Waiting for init..."
        docker compose --profile run-crpd --profile init logs -f crpd-init
        ;;
    stop)
        echo "Stopping cRPD lab..."
        docker compose down
        ;;
    restart)
        echo "Restarting..."
        docker compose restart
        ;;
    status)
        docker compose --profile status run --rm crpd-status
        ;;
    logs)
        docker compose --profile run-crpd logs -f crpd
        ;;
    shell)
        echo "Entering cRPD CLI..."
        docker exec -it juniper-crpd cli
        ;;
    bash)
        docker exec -it juniper-crpd bash
        ;;
    load-image)
        ./scripts/load-crpd-image.sh
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|shell|load-image}"
        exit 1
        ;;
esac
EOF
    chmod +x scripts/manage-lab.sh
}

create_load_image_script() {
    print_status "Creating scripts/load-crpd-image.sh..."
    cat > scripts/load-crpd-image.sh << 'EOF'
#!/bin/bash
echo "=== cRPD Image Loader ==="
shopt -s nullglob
IMAGE_FILES=(crpd-images/*.tgz crpd-images/*.tar.gz)
shopt -u nullglob

if [ ${#IMAGE_FILES[@]} -eq 0 ]; then
    echo "No images found in crpd-images/"
    exit 1
fi

select img in "${IMAGE_FILES[@]}"; do
    if [ -n "$img" ]; then
        echo "Loading $img..."
        docker load -i "$img"
        echo "Loaded."
        break
    fi
done
EOF
    chmod +x scripts/load-crpd-image.sh
}

create_readme() {
    cat > crpd-images/README.md << 'EOF'
# cRPD Images
Place .tgz files here.
EOF
}

# ==============================================================================
# SECTION 3: EXECUTION
# ==============================================================================

echo "=== cRPD Lab Setup v4.0 ==="
check_prerequisites
create_directory_structure
create_env_file
create_docker_compose
create_crpd_config
create_management_script
create_load_image_script
create_readme

echo ""
print_success "Setup Complete!"
echo "1. Run: ./scripts/manage-lab.sh start"
echo "2. Access: ssh root@localhost -p ${SSH_PORT}"
