#!/bin/bash

case "$1" in
    start)
        echo "Starting cRPD lab..."
        # Start both the router and the init helper
        docker compose --profile run-crpd --profile init up -d
        
        # FIX: We explicitly specify the profile to avoid "service not found" errors
        echo "Waiting for initialization..."
        docker compose --profile init logs -f crpd-init
        ;;
    stop)
        echo "Stopping cRPD lab..."
        docker compose down
        ;;
    restart)
        echo "Restarting cRPD lab..."
        docker compose restart
        ;;
    status)
        docker compose --profile status run --rm crpd-status
        ;;
    logs)
        # FIX: Added profile flag so logs can be found
        docker compose --profile run-crpd logs -f crpd
        ;;
    shell)
        echo "Entering cRPD CLI..."
        docker exec -it juniper-crpd cli
        ;;
    bash)
        echo "Entering cRPD Bash Shell..."
        docker exec -it juniper-crpd bash
        ;;
    load-image)
        ./scripts/load-crpd-image.sh
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|shell|bash|load-image}"
        exit 1
        ;;
esac
