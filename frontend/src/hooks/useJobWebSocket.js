// frontend/src/hooks/useJobWebSocket.js

import { useState, useEffect, useCallback } from 'react';
import { webSocketService } from '../services/websocket';

/**
 * Custom hook to manage the WebSocket job data stream and commands.
 */
export const useJobWebSocket = () => {

    const [isConnected, setIsConnected] = useState(webSocketService.status === 'connected');
    const [lastMessage, setLastMessage] = useState(null);

    // 1. Subscribe to connection status and initiate connection on mount
    useEffect(() => {
        const unsubscribeStatus = webSocketService.onStatusChange(newStatus => {
            setIsConnected(newStatus === 'connected');
        });

        // 🔑 FIX/ENHANCEMENT: Ensure 'connect' is called if disconnected. 
        // The service handles preventing double-connection. This guarantees 
        // the client initiates connection when the hook mounts.
        webSocketService.connect(); 

        return () => {
            unsubscribeStatus();
        };
    }, []); // Runs once on mount


    // 2. Subscribe to the raw data stream emitted from the service
    useEffect(() => {
        // We subscribe to the 'data' event emitted by the service
        const unsubscribeData = webSocketService.emitter.on('data', (data) => {
            setLastMessage(data);
        });

        return () => {
            unsubscribeData();
        };
    }, []); // Runs once on mount


    // 3. Command function that uses the public method in the service
    const sendMessage = useCallback((message) => {
        webSocketService.sendMessage(message);
    }, []);

    // 4. Expose the connection state, last message, and command sender
    return { sendMessage, lastMessage, isConnected };
};
