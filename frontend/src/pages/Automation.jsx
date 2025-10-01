// frontend/src/pages/Automation.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { connect, triggerAutomation } from '../services/websocket';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Component: Execution Output (Displays the streaming logs)
const ExecutionOutput = ({ messages }) => (
    <div className="bg-gray-900 text-green-400 p-4 h-96 overflow-y-scroll text-sm font-mono rounded-lg border border-gray-700">
        <div className="text-gray-500 mb-2">--- Real-Time Execution Feed (via Rust WS Hub) ---</div>
        {messages.map((msg, index) => {
            let displayMsg = msg;
            try {
                const json = JSON.parse(msg);
                displayMsg = json.step || json.event || msg;
            } catch (e) {
                // Not JSON, display as is
            }
            return <div key={index} className="py-0.5 whitespace-pre-wrap">{displayMsg}</div>;
        })}
    </div>
);

// Component: Main Automation Page
function Automation() {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Handles incoming messages from the WebSocket
    const handleIncomingMessage = useCallback((data) => {
        setMessages(prevMessages => [...prevMessages, data]);
        if (data.includes("EXECUTION_COMPLETE")) {
            setIsProcessing(false);
        }
    }, []);
    
    // Handles WS status changes
    const handleStatusChange = useCallback((status) => {
        setIsConnected(status);
    }, []);

    // Effect to establish WebSocket connection on mount
    useEffect(() => {
        connect(handleIncomingMessage, handleStatusChange);
    }, [handleIncomingMessage, handleStatusChange]);

    // Handles the button click (triggers HTTP POST to FastAPI)
    const handleTriggerAutomation = async () => {
        if (isProcessing) return;
        
        setMessages(["--- Sending HTTP request to FastAPI (port 8000) to trigger script... ---"]);
        setIsProcessing(true);
        
        // Use a descriptive device name for the simulation
        const result = await triggerAutomation("RTR-CORE-01");
        if (result.status === 'error') {
            setMessages(prev => [...prev, `[ERROR] ${result.message}`]);
            setIsProcessing(false);
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">Backup Configuration Workflow</h2>
            
            <Card>
                <CardHeader>
                    <CardTitle>Automation Trigger</CardTitle>
                    <CardDescription>
                        Initiate the simulated backup workflow via FastAPI and view real-time logs via the Rust WebSocket Hub.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex space-x-4 items-center">
                        <span className={`px-3 py-1 text-sm font-medium rounded-full ${isConnected ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100' : 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'}`}>
                            WS Status: {isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                        
                        <Button 
                            onClick={handleTriggerAutomation}
                            disabled={!isConnected || isProcessing}
                            className="transition-colors"
                        >
                            {isProcessing ? 'Executing...' : 'Trigger Backup Simulation'}
                        </Button>
                    </div>

                    <ExecutionOutput messages={messages} />
                </CardContent>
            </Card>
        </div>
    );
}

export default Automation;
