
// frontend/src/services/websocket.js

// =================================================================
// 🌟 1. CONFIGURATION AND UTILITIES 🌟
// Description: Defines environment variables and helper functions.
// =================================================================

// Read URLs from environment variables set in docker-compose.yml
const RUST_BACKEND_URL = import.meta.env.VITE_RUST_WS_URL || "ws://127.0.0.1:3100/ws";
const API_GATEWAY_URL = import.meta.env.VITE_API_GATEWAY_URL || "http://127.0.0.1:8000";

// --- Simple Event Emitter Utility ---
// Used to decouple the service from React components, allowing hooks to subscribe.
class EventEmitter {
  constructor() {
    this.listeners = {};
  }
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    // Returns an unsubscribe function for cleanup
    return () => {
      this.listeners[event] = this.listeners[event].filter(l => l !== callback);
    };
  }
  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

// --- Format Duration Utility ---
// Converts total seconds into HH:MM:SS format for the uptime display.
const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00:00';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};

// =================================================================
// 🔄 2. CORE SERVICE CLASS (SINGLETON) 🔄
// Description: Manages the WebSocket connection lifecycle and state.
// =================================================================

class WebSocketService {
  constructor() {
    this.socket = null;
    this.emitter = new EventEmitter();
    this.status = 'disconnected';
    this.reconnectAttempts = 0;
    this.connectionStartTime = null;
    this.uptimeInterval = null; // Interval ID for the uptime timer

    // State storage for metrics and info
    this.info = {
      // Extracts IP/Host from the WS URL for display purposes
      serverIp: RUST_BACKEND_URL.replace(/^ws:\/\//, '').replace(/\/ws$/, ''),
      queueLength: 0,
      wsUrl: RUST_BACKEND_URL,
      pingInterval: 1000,
      pongTimeout: 5000,
      activeClients: 0,
      lastActivity: null,
      apiGatewayUrl: API_GATEWAY_URL,
    };
  }

  // --- Private Timer Methods for Uptime ---

  _startUptimeTimer() {
    // Clear any existing timer before starting a new one
    this._stopUptimeTimer();

    // Emit infoUpdate every second to force the React hook to re-render the duration
    this.uptimeInterval = setInterval(() => {
      if (this.status === 'connected') {
        this.emitter.emit('infoUpdate', this.getInfo());
      }
    }, 1000);
  }

  _stopUptimeTimer() {
    if (this.uptimeInterval) {
      clearInterval(this.uptimeInterval);
      this.uptimeInterval = null;
    }
  }

  // --- Private Connection Handlers ---

  _updateStatus(newStatus) {
    this.status = newStatus;
    this.emitter.emit('statusChange', newStatus);
    this.emitter.emit('infoUpdate', this.getInfo()); // Always broadcast on status change
  }

  _handleOpen = () => {
    this._updateStatus('connected');
    this.reconnectAttempts = 0;
    this.connectionStartTime = new Date(); // Record start time
    this.info.lastActivity = new Date();
    this.info.activeClients = 1; // Initialize clients to 1 (self)

    this._startUptimeTimer(); // Start the periodic emitter

    console.log("WebSocket connected successfully.");
  }

  _handleMessage = (event) => {
    this.info.lastActivity = new Date();
    this.emitter.emit('data', event.data);

    // ⚠️ Placeholder for parsing real-time server metrics
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'METRICS_UPDATE') {
        // Update clients and queue from the server's broadcast
        this.info.activeClients = data.clients || this.info.activeClients;
        this.info.queueLength = data.queue || this.info.queueLength;
      }
    } catch (e) {
      // Handle non-JSON messages (e.g., plain text)
    }

    // Emit update whenever a message is received (in case metrics changed)
    this.emitter.emit('infoUpdate', this.getInfo());
  }

  _handleClose = (event) => {
    console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
    this._stopUptimeTimer(); // Stop the timer on close
    this._updateStatus('disconnected');
    this.connectionStartTime = null;

    // Simple exponential backoff reconnect logic
    if (!event.wasClean && this.reconnectAttempts < 5) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnect(delay);
    }
  }

  _handleError = (error) => {
    console.error("WebSocket error:", error);
    this._updateStatus('error');
  }

  // =================================================================
  // 🛠️ 3. PUBLIC API & EXPORTS 🛠️
  // Description: Methods exposed for use by React components and other services.
  // =================================================================

  // Original: export function connect()
  connect() {
    // Prevent connection if already open or attempting to connect
    if (this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this._updateStatus('connecting');
    try {
      this.socket = new WebSocket(RUST_BACKEND_URL);
      this.socket.onopen = this._handleOpen;
      this.socket.onmessage = this._handleMessage;
      this.socket.onclose = this._handleClose;
      this.socket.onerror = this._handleError;
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      this._updateStatus('error');
    }
  }

  reconnect(delay = 1000) {
    if (this.status !== 'connecting') {
      console.log(`Attempting reconnect in ${delay / 1000}s...`);
      setTimeout(() => this.connect(), delay);
    }
  }

  // Original: export async function triggerAutomation(deviceName)
  // HTTP POST request to the FastAPI Gateway. Unchanged from original functionality.
  async triggerAutomation(deviceName) {
    const url = `${API_GATEWAY_URL}/api/automation/run/${deviceName}`;
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Error triggering automation:", error);
      return { message: "Failed to connect to FastAPI.", status: "error" };
    }
  }

  // --- Getters and Subscription Methods for Hook Consumption ---

  // Provides the current comprehensive state package to the React hook.
  getInfo() {
    const uptimeSeconds = this.connectionStartTime
      ? Math.floor((new Date() - this.connectionStartTime) / 1000)
      : 0;

    return {
      status: this.status,
      connectedIP: this.info.serverIp,
      connectionDuration: formatDuration(uptimeSeconds), // Calculated real-time duration
      activeConnections: this.info.activeClients,
      lastActivity: this.info.lastActivity,
      reconnectAttempts: this.reconnectAttempts,
      serviceInfo: {
        queueLength: this.info.queueLength,
        wsUrl: this.info.wsUrl,
        pingInterval: this.info.pingInterval,
        pongTimeout: this.info.pongTimeout,
      },
    };
  }

  onStatusChange(callback) { return this.emitter.on('statusChange', callback); }
  onInfoUpdate(callback) { return this.emitter.on('infoUpdate', callback); }
}

// Export a singleton instance and the individual functions for full backward compatibility
export const webSocketService = new WebSocketService();

// These exports ensure any existing code that used "import { connect, triggerAutomation } from './websocket'" still works.
export const connect = webSocketService.connect.bind(webSocketService);
export const triggerAutomation = webSocketService.triggerAutomation.bind(webSocketService);
