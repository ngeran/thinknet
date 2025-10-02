// src/plugins/AppLayout/components/WebSocketStatus.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Wifi, Zap, Users, RotateCcw, Clock, Cpu, CornerDownRight, BarChart3, Settings, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ✅ IMPORT THE REAL-TIME HOOK
import { useWebSocketStatus } from '../../hooks/useWebSocketStatus'; // Adjust path as needed

// ================================================
// UTILITY FUNCTIONS (formatDuration is now handled internally by the Service)
// We keep it here just in case, but it's not strictly necessary if only used by the service.
// ================================================
const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds < 0) return '00:00:00';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
};


// ================================================
// WEBSOCKET STATUS COMPONENT (Real-Time Ready)
// ================================================

const WebSocketStatus = ({ debug = false }) => {
  const enableBackend = true; // Use a configuration flag if needed

  // ✅ Sourcing real-time data from the custom hook
  const {
    status,
    connectedIP,
    connectionDuration,
    activeConnections,
    lastActivity,
    reconnectAttempts,
    serviceInfo,
    connect, // Real connect method from the hook
  } = useWebSocketStatus(enableBackend);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Event Handlers
  const handleButtonClick = useCallback(() => {
    setIsDropdownOpen(prev => !prev);
    // If opening and disconnected/error, attempt to connect
    if (!isDropdownOpen && (status === 'disconnected' || status === 'error')) {
      connect();
    }
  }, [isDropdownOpen, status, connect]);

  const handleReconnectClick = useCallback(() => {
    connect();
  }, [connect]);


  // RENDER HELPERS
  const getStatusConfig = () => {
    const configs = {
      disabled: { title: 'Backend WebSocket disabled', label: 'Disabled', statusClass: 'text-gray-500 hover:text-gray-400', indicatorClass: 'bg-gray-500', icon: <Wifi className="w-5 h-5" /> },
      connecting: { title: 'Connecting to WebSocket...', label: 'Connecting', statusClass: 'text-yellow-500 hover:text-yellow-400 animate-pulse', indicatorClass: 'bg-yellow-500', icon: <Wifi className="w-5 h-5" /> },
      connected: { title: 'Connected to WebSocket', label: 'Connected', statusClass: 'text-green-500 hover:text-green-400', indicatorClass: 'bg-green-500', icon: <Wifi className="w-5 h-5" /> },
      disconnected: { title: 'WebSocket disconnected', label: 'Disconnected', statusClass: 'text-red-500 hover:text-red-400', indicatorClass: 'bg-red-500', icon: <Wifi className="w-5 h-5 rotate-45" /> },
      error: { title: 'WebSocket connection error', label: 'Error', statusClass: 'text-red-600 hover:text-red-500', indicatorClass: 'bg-red-600', icon: <Wifi className="w-5 h-5 rotate-45" /> }
    };
    return configs[status] || configs.disabled;
  };

  /**
   * Metric Card Component (Vertical Stack Layout)
   */
  const MetricCard = ({ icon, label, value, className = "" }) => (
    <div className="flex flex-col items-center p-2 bg-accent/30 rounded-md group text-xs text-center min-h-[55px] justify-center">

      {/* Label and Icon (Top) */}
      <div className="flex items-center space-x-1 mb-0.5">
        <div className="text-primary/70 w-3 h-3">{icon}</div>
        <div className="text-muted-foreground font-semibold uppercase text-[10px]">{label}</div>
      </div>

      {/* Value (Bottom, larger/bolder) */}
      <div className={`font-mono font-bold text-sm text-foreground ${className}`}>
        {value}
      </div>
    </div>
  );

  const currentConfig = getStatusConfig();

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Button with dynamic icon and colors */}
      <Button
        variant="ghost"
        size="icon"
        className={`transition-colors duration-150 ${currentConfig.statusClass}`}
        onClick={handleButtonClick}
        aria-label="WebSocket Status"
        title={currentConfig.title}
        disabled={status === 'connecting'}
      >
        {currentConfig.icon}
      </Button>

      {/* Dropdown with optimized content */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-72 p-3 border bg-popover shadow-2xl rounded-xl z-50 transition-opacity duration-200">

          {/* Compact Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Connection Status</span>
            </div>
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium text-popover-foreground ${currentConfig.indicatorClass}`}>
              <div className="w-1.5 h-1.5 rounded-full border border-popover-foreground/50" />
              {currentConfig.label}
            </div>
          </div>

          {/* Connection Metrics */}
          {enableBackend && (
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <BarChart3 className="w-3 h-3" />
                  Metrics
                </h3>

                {/* Metrics Grid (Vertical Stack Cards) */}
                <div className="grid grid-cols-2 gap-1">
                  <MetricCard
                    icon={<Cpu className="w-3 h-3" />}
                    label="Server"
                    value={connectedIP}
                    className="truncate"
                  />

                  <MetricCard
                    icon={<Clock className="w-3 h-3" />}
                    label="Uptime"
                    value={connectionDuration}
                    className="duration"
                  />

                  <MetricCard
                    icon={<Users className="w-3 h-3" />}
                    label="Clients"
                    value={activeConnections}
                  />

                  <MetricCard
                    icon={<RotateCcw className="w-3 h-3" />}
                    label="Reconnects"
                    value={reconnectAttempts}
                  />
                </div>

                {/* Last activity display */}
                {lastActivity && status === 'connected' && (
                  <div className="flex items-center justify-between p-2 bg-accent/30 rounded-md text-xs mt-1">
                    <div className="flex items-center space-x-1.5">
                      <CornerDownRight className="w-3 h-3 text-primary/70" />
                      <div className="text-muted-foreground">Last Activity</div>
                    </div>
                    <div className="font-mono font-semibold text-right text-foreground">
                      {lastActivity.toLocaleTimeString('en-US', { hour12: false })}
                    </div>
                  </div>
                )}

                {/* Reconnect button */}
                {(status === 'error' || status === 'disconnected') && (
                  <div className="pt-2">
                    <button
                      onClick={handleReconnectClick}
                      className="w-full inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
                      disabled={status === 'connecting'}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      {status === 'connecting' ? 'Connecting...' : 'Reconnect'}
                    </button>
                  </div>
                )}
              </div>

              {/* Service Information Section (Dense) */}
              <div className="space-y-1 pt-2 border-t border-border">
                <h3 className="flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  <Settings className="w-3 h-3" />
                  Service Details
                </h3>

                <div className="space-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-medium text-foreground">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Queue:</span>
                    <span className="font-medium text-foreground">{serviceInfo.queueLength} items</span>
                  </div>

                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">URL:</span>
                    <span className="text-foreground break-all text-[10px] opacity-70 max-w-[65%] text-right">{serviceInfo.wsUrl}</span>
                  </div>

                  {debug && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ping:</span>
                        <span className="font-medium text-foreground">{serviceInfo.pingInterval}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Timeout:</span>
                        <span className="font-medium text-foreground">{serviceInfo.pongTimeout}ms</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state (If enableBackend is false) */}
          {!enableBackend && (
            <div className="text-center py-4">
              <ZapOff className="w-6 h-6 mx-auto mb-1 text-muted" />
              <h3 className="font-semibold text-sm text-foreground">WebSocket Disabled</h3>
              <p className="text-xs text-muted-foreground">
                Backend service is disabled by configuration.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

WebSocketStatus.displayName = 'WebSocketStatus';
export default WebSocketStatus;
