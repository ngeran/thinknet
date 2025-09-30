// frontend/src/services/websocket.js

// Read URLs from environment variables set in docker-compose.yml
const RUST_BACKEND_URL = import.meta.env.VITE_RUST_WS_URL || "ws://127.0.0.1:3100/ws";
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || "http://127.0.0.1:8000";

let ws = null;

// --- WebSocket Connection ---
export function connect(onMessageCallback) {
    // Attempt to connect only if a connection doesn't exist or is closed
    if (ws && ws.readyState === WebSocket.OPEN) return; 
    
    ws = new WebSocket(RUST_BACKEND_URL);

    ws.onopen = () => { console.log("WebSocket connected successfully."); };
    ws.onmessage = (event) => { onMessageCallback(event.data); };
    ws.onclose = () => { console.warn("WebSocket closed."); };
    ws.onerror = (error) => { console.error("WebSocket error:", error); };
}

// --- FastAPI API Trigger (HTTP POST) ---
export async function triggerAutomation(deviceName) {
    const url = `${API_GATEWAY_URL}/api/automation/run/${deviceName}`;
    try {
        const response = await fetch(url, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'} 
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error triggering automation:", error);
        return { message: "Failed to connect to FastAPI.", status: "error" };
    }
}
