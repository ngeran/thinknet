// frontend/src/App.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { connect, triggerAutomation } from './services/websocket';
import './index.css'; 

// Component: Execution Output (Displays the streaming logs)
const ExecutionOutput = ({ messages }) => (
    <div className="bg-gray-900 text-green-400 p-4 h-80 overflow-y-scroll text-sm font-mono rounded-lg border border-gray-700">
        <div className="text-gray-500 mb-2">--- Real-Time Juniper Execution Feed ---</div>
        {messages.map((msg, index) => {
            let displayMsg = msg;
            try {
                // Attempt to parse JSON messages for cleaner display
                const json = JSON.parse(msg);
                displayMsg = json.step || json.event || msg;
            } catch (e) {
                // Not JSON, display as is
            }
            return <div key={index} className="py-0.5 whitespace-pre-wrap">{displayMsg}</div>;
        })}
    </div>
);

// Component: Main App
function App() {
    const [messages, setMessages] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    // Handles incoming messages from the WebSocket
    const handleIncomingMessage = useCallback((data) => {
        setMessages(prevMessages => [...prevMessages, data]);
        
        // Check for the completion message from the backend
        if (data.includes("EXECUTION_COMPLETE")) {
            setIsProcessing(false);
        }
    }, []);

    // Effect to establish WebSocket connection on mount
    useEffect(() => {
        try {
            connect(handleIncomingMessage);
            setIsConnected(true);
        } catch (e) {
            setIsConnected(false);
        }
    }, [handleIncomingMessage]);

    // Handles the button click (triggers HTTP POST to FastAPI)
    const handleTriggerAutomation = async () => {
        if (isProcessing) return;
        
        // Reset messages and show initial step
        setMessages(["--- Sending HTTP request to FastAPI (port 8000)... ---"]);
        setIsProcessing(true);
        
        // Hardcoded device name for the simulation
        await triggerAutomation("RTR-CORE-01");
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8 flex flex-col items-center">
            <h1 className="text-4xl font-extrabold text-gray-800 mb-2">Juniper Automation Gateway</h1>
            <p className="text-gray-500 mb-6">Rust WS Hub + FastAPI + React UI</p>

            {/* Status & Action */}
            <div className="flex space-x-4 items-center mb-8">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    WS Status: {isConnected ? 'Connected' : 'Disconnected'}
                </span>
                
                <button 
                    onClick={handleTriggerAutomation}
                    disabled={!isConnected || isProcessing}
                    className={`font-bold py-2 px-6 rounded transition duration-150 ${isProcessing ? 'bg-yellow-500 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                >
                    {isProcessing ? 'Running Script...' : 'Trigger Juniper Script'}
                </button>
            </div>

            {/* Output Window */}
            <div className="w-full max-w-2xl bg-white shadow-2xl rounded-xl">
                <ExecutionOutput messages={messages} />
            </div>
        </div>
    );
}

export default App;
