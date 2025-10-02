// /hooks/useWebSocketStatus.js

import { useState, useEffect, useCallback } from 'react';

// ⚠️ IMPORTANT: Update the import path if your file structure is different.
import { webSocketService } from '../services/websocket';

export const useWebSocketStatus = (enableBackend = true) => {
  // Initialize state with the current info from the service
  const initialInfo = webSocketService.getInfo();

  // We only need 'status' and the full 'info' object to trigger re-renders
  const [status, setStatus] = useState(initialInfo.status);
  const [info, setInfo] = useState(initialInfo);

  const connect = useCallback(() => {
    webSocketService.connect();
  }, []);

  useEffect(() => {
    if (!enableBackend) return;

    // 1. Subscribe to status changes
    const unsubscribeStatus = webSocketService.onStatusChange(newStatus => {
      setStatus(newStatus);
    });

    // 2. Subscribe to full info updates (includes uptime, IP, metrics)
    const unsubscribeInfo = webSocketService.onInfoUpdate(newInfo => {
      setInfo(newInfo);
    });

    // 3. Connect on mount if not already connected (or reconnecting)
    if (webSocketService.status === 'disconnected') {
      webSocketService.connect();
    }

    // Cleanup: Disconnect the listeners on unmount
    return () => {
      unsubscribeStatus();
      unsubscribeInfo();
    };
  }, [enableBackend]);

  // Return the combined status and info object, plus the manual connect function
  return {
    status: status,
    connectedIP: info.connectedIP,
    connectionDuration: info.connectionDuration,
    activeConnections: info.activeConnections,
    lastActivity: info.lastActivity,
    reconnectAttempts: info.reconnectAttempts,
    serviceInfo: info.serviceInfo,
    connect, // Re-exports the connect function for manual button clicks
  };
};
