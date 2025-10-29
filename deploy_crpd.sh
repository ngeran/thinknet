#!/bin/bash
 
################################################################################
# Juniper cRPD Deployment Script
# Description: Sets up directory structure and deploys cRPD container
# Architecture: x86_64 (AMD64)
################################################################################
 
set -e  # Exit on error
 
# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color
 
# Configuration variables
CRPD_IMAGE="crpd:latest"  # Adjust version as needed (e.g., crpd:23.2R1.14)
CONTAINER_NAME="crpd-router"
BASE_DIR="$HOME/crpd"
CONFIG_DIR="$BASE_DIR/config"
LOG_DIR="$BASE_DIR/log"
VAR_DIR="$BASE_DIR/var"
LICENSE_DIR="$BASE_DIR/license"
 
# Print functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}
 
print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}
 
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}
 
# Check if running on x86_64
check_architecture() {
    print_info "Checking system architecture..."
    ARCH=$(uname -m)
    if [ "$ARCH" != "x86_64" ]; then
        print_error "This script is designed for x86_64 architecture. Detected: $ARCH"
        exit 1
    fi
    print_info "Architecture verified: $ARCH"
}
 
# Check if Docker is installed
check_docker() {
    print_info "Checking Docker installation..."
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
 
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
 
    print_info "Docker is installed and running"
    docker --version
}
 
# Create directory structure
create_directories() {
    print_info "Creating directory structure..."
 
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$VAR_DIR"
    mkdir -p "$LICENSE_DIR"
 
    print_info "Directory structure created:"
    echo "  Base: $BASE_DIR"
    echo "  Config: $CONFIG_DIR"
    echo "  Logs: $LOG_DIR"
    echo "  Var: $VAR_DIR"
    echo "  License: $LICENSE_DIR"
}
 
# Create basic cRPD configuration
create_basic_config() {
    print_info "Creating basic cRPD configuration..."
 
    CONFIG_FILE="$CONFIG_DIR/juniper.conf"
 
    cat > "$CONFIG_FILE" << 'EOF'
## Last commit: 2025-10-29 09:56:32 UTC by root
version 20.4R1.12;
 
system {
    host-name crpd-router;
    root-authentication {
        encrypted-password "$6$SALT$HASH"; ## Change this!
    }
    login {
        user admin {
            uid 2001;
            class super-user;
            authentication {
                encrypted-password "$6$SALT$HASH"; ## Change this!
            }
        }
    }
    services {
        ssh {
            root-login allow;
        }
        netconf {
            ssh;
        }
    }
    syslog {
        user * {
            any emergency;
        }
        file messages {
            any notice;
            authorization info;
        }
        file interactive-commands {
            interactive-commands any;
        }
    }
}
 
interfaces {
    lo0 {
        unit 0 {
            family inet {
                address 127.0.0.1/32;
            }
        }
    }
}
 
routing-options {
    router-id 1.1.1.1;
    autonomous-system 65000;
}
 
protocols {
    bgp {
        group example {
            type internal;
            local-address 1.1.1.1;
        }
    }
}
EOF
 
    print_info "Basic configuration created at: $CONFIG_FILE"
    print_warn "Please update the encrypted passwords before production use!"
}
 
# Pull cRPD Docker image
pull_crpd_image() {
    print_info "Checking for cRPD Docker image..."
 
    if docker images | grep -q "crpd"; then
        print_warn "cRPD image already exists locally"
        read -p "Do you want to pull the latest version? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            return
        fi
    fi
 
    print_info "Pulling cRPD image: $CRPD_IMAGE"
    print_warn "Note: You may need to load cRPD image manually if not available in a registry"
    print_warn "Use: docker load -i <crpd-image.tar> if you have the image file"
 
    # Uncomment the following line if the image is available in a registry
    # docker pull $CRPD_IMAGE
}
 
# Check if container already exists
check_existing_container() {
    if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        print_warn "Container '$CONTAINER_NAME' already exists"
        read -p "Do you want to remove it and create a new one? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Stopping and removing existing container..."
            docker stop "$CONTAINER_NAME" 2>/dev/null || true
            docker rm "$CONTAINER_NAME" 2>/dev/null || true
        else
            print_error "Cannot proceed with existing container. Exiting."
            exit 1
        fi
    fi
}
 
# Deploy cRPD container
deploy_crpd() {
    print_info "Deploying cRPD container..."
 
    docker run -d \
        --name "$CONTAINER_NAME" \
        --hostname crpd-router \
        --net=host \
        --privileged \
        -v "$CONFIG_DIR:/config" \
        -v "$LOG_DIR:/var/log" \
        -v "$VAR_DIR:/var/tmp" \
        -v "$LICENSE_DIR:/config/license" \
        -e CRPD_CONFIG_FILE="/config/juniper.conf" \
        "$CRPD_IMAGE"
 
    if [ $? -eq 0 ]; then
        print_info "cRPD container deployed successfully!"
        print_info "Container name: $CONTAINER_NAME"
    else
        print_error "Failed to deploy cRPD container"
        exit 1
    fi
}
 
# Display container status
show_status() {
    print_info "Container Status:"
    docker ps -a --filter "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
 
    echo ""
    print_info "Useful Commands:"
    echo "  View logs:        docker logs $CONTAINER_NAME"
    echo "  Access CLI:       docker exec -it $CONTAINER_NAME cli"
    echo "  Access shell:     docker exec -it $CONTAINER_NAME bash"
    echo "  Stop container:   docker stop $CONTAINER_NAME"
    echo "  Start container:  docker start $CONTAINER_NAME"
    echo "  Remove container: docker rm -f $CONTAINER_NAME"
}
 
# Main execution
main() {
    echo "=================================="
    echo "Juniper cRPD Deployment Script"
    echo "=================================="
    echo ""
 
    check_architecture
    check_docker
    create_directories
    create_basic_config
    pull_crpd_image
    check_existing_container
    deploy_crpd
    show_status
 
    echo ""
    print_info "Deployment complete!"
    print_warn "Don't forget to:"
    echo "  1. Add your cRPD license file to: $LICENSE_DIR"
    echo "  2. Update the configuration in: $CONFIG_DIR/juniper.conf"
    echo "  3. Update password hashes in the configuration"
    echo "  4. Restart the container after making changes: docker restart $CONTAINER_NAME"
}
 
# Run main function
main