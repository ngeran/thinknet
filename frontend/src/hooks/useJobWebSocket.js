// frontend/src/hooks/useJobWebSocket.js

import { useState, useEffect, useCallback } from 'react';
// ⚠️ Note the change: Using 'webSocketService' singleton
import { webSocketService } from '../services/websocket'; 

/**
 * Custom hook to manage the WebSocket job data stream and commands.
 * It provides the connection status, a function to send commands (like SUBSCRIBE/UNSUBSCRIBE),
 * and the last raw message received.
 */
export const useJobWebSocket = () => {
    
    const [isConnected, setIsConnected] = useState(webSocketService.status === 'connected');
    const [lastMessage, setLastMessage] = useState(null);

    // 1. Subscribe to connection status
    useEffect(() => {
        const unsubscribeStatus = webSocketService.onStatusChange(newStatus => {
            setIsConnected(newStatus === 'connected');
        });

        if (webSocketService.status !== 'connected' && webSocketService.status !== 'connecting') {
            webSocketService.connect();
        }

        return () => {
            unsubscribeStatus();
        };
    }, []);


    // 2. Subscribe to the raw data stream emitted from the service
    useEffect(() => {
        // We subscribe to the 'data' event emitted by the service
        const unsubscribeData = webSocketService.emitter.on('data', (data) => {
            setLastMessage(data);
        });

        return () => {
            unsubscribeData();
        };
    }, []); 


    // 3. Command function that uses the public method in the service
    const sendMessage = useCallback((message) => {
        webSocketService.sendMessage(message);
    }, []);

    return { sendMessage, lastMessage, isConnected };
};
