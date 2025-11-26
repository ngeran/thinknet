/**
 * =============================================================================
 * FILE LOCATION: frontend/src/components/ImageUploads-DEBUG.jsx
 * DESCRIPTION:   Complete Diagnostic Tool for WebSocket & Storage Check
 *                Comprehensive debugging to identify connection issues
 *                REDESIGN: Modern, space-efficient UI with enhanced UX
 * VERSION:       1.1.0 - Modern Redesign
 * AUTHOR:        nikos-geranios_vgi
 * DATE:          2025-11-25
 * =============================================================================
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, HardDrive, Play, FileText, Terminal,
  LayoutDashboard, Activity, Server, CheckCircle2, XCircle,
  AlertCircle, Info, Copy, Download, RefreshCw,
  ChevronDown, ChevronUp, Settings, Wifi, WifiOff
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_RUST_WS_URL || 'ws://localhost:3100/ws';

// =========================================================================
// COLOR-CODED DEBUG LOGGER (UNCHANGED)
// =========================================================================

const DEBUG_LOGGER = {
  ws: (msg, data = null) => {
    console.log(`%c[WS]%c ${msg}`, 'background: #3b82f6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #3b82f6;', data || '');
  },
  check: (msg, data = null) => {
    console.log(`%c[STORAGE_CHECK]%c ${msg}`, 'background: #10b981; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #10b981;', data || '');
  },
  api: (msg, data = null) => {
    console.log(`%c[API]%c ${msg}`, 'background: #f59e0b; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #f59e0b;', data || '');
  },
  msg: (msg, data = null) => {
    console.log(`%c[MESSAGE]%c ${msg}`, 'background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #8b5cf6;', data || '');
  },
  error: (msg, data = null) => {
    console.error(`%c[ERROR]%c ${msg}`, 'background: #ef4444; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #ef4444;', data || '');
  },
  state: (msg, data = null) => {
    console.log(`%c[STATE]%c ${msg}`, 'background: #ec4899; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #ec4899;', data || '');
  },
  success: (msg, data = null) => {
    console.log(`%c[SUCCESS]%c ${msg}`, 'background: #22c55e; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;', 'color: #22c55e;', data || '');
  }
};

export default function ImageUploaderDebug({
  parameters: externalParameters,
  onParamChange: externalOnParamChange,
  selectedFile: externalSelectedFile,
  setSelectedFile: externalSetSelectedFile,
  onUpload,
  isUploading: externalIsUploading
}) {
  // =========================================================================
  // SECTION 1: STATE MANAGEMENT (ENHANCED WITH UI STATES)
  // =========================================================================

  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '', inventory_file: '', username: '', password: ''
  });

  // Storage Validation State
  const [storageCheck, setStorageCheck] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageCheckError, setStorageCheckError] = useState(null);
  const [internalIsUploading, setInternalIsUploading] = useState(false);

  // Terminal/Log State
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalEndRef = useRef(null);

  // WebSocket State
  const [wsConnection, setWsConnection] = useState(null);
  const [wsError, setWsError] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');

  // Diagnostic State
  const [diagnostics, setDiagnostics] = useState([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  // NEW: UI State for collapsible sections and layout
  const [isConfigExpanded, setIsConfigExpanded] = useState(false);
  const [isTerminalExpanded, setIsTerminalExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState('main');

  // =========================================================================
  // SECTION 2: PROPS RESOLUTION (UNCHANGED)
  // =========================================================================

  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploading = externalIsUploading || internalIsUploading;
  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // =========================================================================
  // SECTION 3: DIAGNOSTIC LOGGING (UNCHANGED)
  // =========================================================================

  const addDiagnosticLog = useCallback((category, message, type = 'info', data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { id: Date.now() + Math.random(), category, message, type, timestamp, data };

    setDiagnostics(prev => [...prev, logEntry]);

    // Also log to console
    switch(type) {
      case 'error':
        DEBUG_LOGGER.error(`[${category}] ${message}`, data);
        break;
      case 'success':
        DEBUG_LOGGER.success(`[${category}] ${message}`, data);
        break;
      case 'warning':
        console.warn(`[${category}] ${message}`, data);
        break;
      default:
        console.log(`[${category}] ${message}`, data);
    }
  }, []);

  // =========================================================================
  // SECTION 4: AUTO-SCROLL EFFECT (UNCHANGED)
  // =========================================================================

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // =========================================================================
  // SECTION 5: COMPREHENSIVE WEBSOCKET DIAGNOSTICS (UNCHANGED)
  // =========================================================================

  const runFullDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnostics([]);
    addDiagnosticLog('DIAGNOSTIC', 'Starting comprehensive WebSocket diagnostics...', 'info');
    addDiagnosticLog('ENVIRONMENT', `VITE_RUST_WS_URL: ${WS_BASE}`, 'info');
    addDiagnosticLog('ENVIRONMENT', `VITE_API_GATEWAY_URL: ${API_BASE}`, 'info');

    try {
      // Step 1: Check Network Connectivity
      addDiagnosticLog('NETWORK', 'Checking network connectivity...', 'info');

      try {
        await fetch('http://localhost:3100/health', {
          method: 'HEAD',
          mode: 'no-cors'
        });
        addDiagnosticLog('NETWORK', `HTTP HEAD to localhost:3100 succeeded`, 'success');
      } catch (err) {
        addDiagnosticLog('NETWORK', `HTTP connectivity check failed: ${err.message}`, 'warning', err);
      }

      // Step 2: Test API Gateway
      addDiagnosticLog('API', 'Testing API Gateway connection...', 'info');
      try {
        const apiRes = await fetch(`${API_BASE}/api/tests`, {
          method: 'GET'
        });
        if (apiRes.ok) {
          addDiagnosticLog('API', `API Gateway is reachable (status: ${apiRes.status})`, 'success');
        } else {
          addDiagnosticLog('API', `API Gateway returned status: ${apiRes.status}`, 'warning');
        }
      } catch (err) {
        addDiagnosticLog('API', `API Gateway connection failed: ${err.message}`, 'error', err);
      }

      // Step 3: Test WebSocket Connection
      addDiagnosticLog('WEBSOCKET', `Attempting connection to ${WS_BASE}...`, 'info');

      let ws;
      let timeoutId;

      const wsPromise = new Promise((resolve, reject) => {
        try {
          ws = new WebSocket(WS_BASE);
          addDiagnosticLog('WEBSOCKET', `WebSocket object created (readyState: ${ws.readyState})`, 'info');

          timeoutId = setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
              addDiagnosticLog('WEBSOCKET', 'Connection timeout - stuck in CONNECTING state for 10 seconds', 'error');
              ws.close();
              reject(new Error('Connection timeout'));
            }
          }, 10000);

          ws.onopen = () => {
            clearTimeout(timeoutId);
            addDiagnosticLog('WEBSOCKET', '✅ WebSocket connection established!', 'success');
            addDiagnosticLog('WEBSOCKET', `ReadyState: ${ws.readyState} (OPEN)`, 'success');

            // Test sending a message
            try {
              const testMsg = JSON.stringify({ type: 'SUBSCRIBE', channel: 'diagnostic-test' });
              ws.send(testMsg);
              addDiagnosticLog('WEBSOCKET', 'Test SUBSCRIBE message sent successfully', 'success');
            } catch (sendErr) {
              addDiagnosticLog('WEBSOCKET', `Failed to send test message: ${sendErr.message}`, 'error', sendErr);
            }

            resolve('connected');
            setTimeout(() => ws.close(), 2000);
          };

          ws.onmessage = (event) => {
            addDiagnosticLog('WEBSOCKET', `Message received: ${event.data.substring(0, 100)}...`, 'success');
          };

          ws.onerror = (err) => {
            clearTimeout(timeoutId);
            const errorMsg = err.message || 'Unknown WebSocket error';
            addDiagnosticLog('WEBSOCKET', `WebSocket error: ${errorMsg}`, 'error', err);
            reject(new Error(errorMsg));
          };

          ws.onclose = (closeEvent) => {
            clearTimeout(timeoutId);
            const reason = closeEvent.reason || 'No reason provided';
            addDiagnosticLog('WEBSOCKET', `Connection closed (code: ${closeEvent.code}, reason: ${reason})`,
              closeEvent.code === 1000 ? 'success' : 'warning');
          };

        } catch (createErr) {
          clearTimeout(timeoutId);
          addDiagnosticLog('WEBSOCKET', `Failed to create WebSocket: ${createErr.message}`, 'error', createErr);
          reject(createErr);
        }
      });

      try {
        await wsPromise;
      } catch (wsErr) {
        addDiagnosticLog('WEBSOCKET', `WebSocket connection failed: ${wsErr.message}`, 'error');
      }

      // Step 4: Summary
      addDiagnosticLog('DIAGNOSTIC', 'Diagnostics completed', 'success');

    } catch (err) {
      addDiagnosticLog('DIAGNOSTIC', `Diagnostic exception: ${err.message}`, 'error', err);
    }

    setIsRunningDiagnostics(false);
  };

  // =========================================================================
  // SECTION 6: WEBSOCKET LIFECYCLE (UNCHANGED)
  // =========================================================================

  useEffect(() => {
    addDiagnosticLog('INIT', `Initializing WebSocket to ${WS_BASE}`, 'info');

    let ws;
    let intendedClose = false;
    let messageCount = 0;

    try {
      ws = new WebSocket(WS_BASE);
      setWsConnection(ws);
      setWsStatus('connecting');
      addDiagnosticLog('WEBSOCKET', 'WebSocket object created', 'info');

      ws.onopen = () => {
        addDiagnosticLog('WEBSOCKET', '✅ Connected to Rust Hub', 'success');
        setWsStatus('connected');
        setWsError(null);
      };

      ws.onmessage = (event) => {
        messageCount++;
        const messagePreview = event.data.substring(0, 150);
        addDiagnosticLog('WEBSOCKET', `Message #${messageCount} received (${event.data.length} bytes)`, 'info', messagePreview);

        // Process message
        try {
          let msgData;
          let eventData;
          
          // First, parse the outer RedisMessage wrapper
          const parsedData = JSON.parse(event.data);
          
          if (parsedData.data) {
            // This is a RedisMessage wrapper - parse the inner data
            eventData = JSON.parse(parsedData.data);
            msgData = eventData;
            addDiagnosticLog('MESSAGE', `Parsed RedisMessage wrapper: type=${msgData.type}, event_type=${msgData.event_type}`, 'info');
          } else {
            // Direct message (no wrapper)
            msgData = parsedData;
            eventData = parsedData;
            addDiagnosticLog('MESSAGE', `Parsed direct message: type=${msgData.type}, event_type=${msgData.event_type}`, 'info');
          }

          // Handle different message formats
          let eventType = eventData.event_type || 'INFO';
          let message = eventData.message || JSON.stringify(eventData).substring(0, 100);

          // Special handling for JSNAPy results
          if (eventData.type === 'result' && eventData.data && eventData.data.results_by_host) {
            addDiagnosticLog('STORAGE_CHECK', `Processing result message: ${JSON.stringify(eventData.data).substring(0, 200)}...`, 'info');
            const hostResult = eventData.data.results_by_host[0];
            if (hostResult && hostResult.test_results) {
              const storageTest = hostResult.test_results.find(t => t.title === 'storage_check');
              addDiagnosticLog('STORAGE_CHECK', `Found storage test: ${storageTest ? JSON.stringify(storageTest).substring(0, 150) : 'null'}`, 'info');
              if (storageTest) {
                if (storageTest.status === 'success' && storageTest.data && storageTest.data.length > 0) {
                  // Process storage check results
                  const hasSufficientSpace = storageTest.data.some(fs => 
                    parseInt(fs['available-blocks']) > 1000000
                  );
                  
                  setStorageCheck({
                    has_sufficient_space: hasSufficientSpace,
                    details: storageTest.data
                  });
                  setIsCheckingStorage(false);
                  
                  eventType = 'SUCCESS';
                  message = `Storage check completed. Sufficient space: ${hasSufficientSpace}`;
                } else if (storageTest.error) {
                  setStorageCheckError(storageTest.error);
                  setIsCheckingStorage(false);
                  setStorageCheck(null);
                  eventType = 'ERROR';
                  message = `Storage check failed: ${storageTest.error}`;
                } else if (storageTest.status === 'success' && (!storageTest.data || storageTest.data.length === 0)) {
                  setStorageCheckError('No storage data received from device');
                  setIsCheckingStorage(false);
                  setStorageCheck(null);
                  eventType = 'ERROR';
                  message = 'No storage data received from device';
                }
              }
            }
          }

          // Add to terminal logs
          setTerminalLogs(prev => [...prev, {
              id: Date.now() + Math.random(),
              type: eventType,
              message: message,
              timestamp: new Date().toLocaleTimeString()
          }]);
        } catch (parseErr) {
          addDiagnosticLog('MESSAGE', `Failed to parse JSON: ${parseErr.message}`, 'error');
        }
      };

      ws.onerror = (err) => {
        addDiagnosticLog('WEBSOCKET', `❌ WebSocket error: ${err.message || 'Unknown'}`, 'error');
        setWsStatus('error');
        setWsError(err.message || 'Unknown error');
      };

      ws.onclose = (closeEvent) => {
        addDiagnosticLog('WEBSOCKET', `Connection closed (code: ${closeEvent.code})`,
          closeEvent.code === 1000 ? 'info' : 'warning');
        setWsStatus('disconnected');
        if (!intendedClose) {
          addDiagnosticLog('WEBSOCKET', '⚠️ Connection closed unexpectedly', 'warning');
        }
      };

    } catch (err) {
        addDiagnosticLog('WEBSOCKET', `Failed to create WebSocket: ${err.message}`, 'error', err);
        setWsStatus('error');
        setWsError(err.message);
    }

    return () => {
      intendedClose = true;
      if (ws) {
        addDiagnosticLog('CLEANUP', 'Closing WebSocket connection', 'info');
        ws.close();
      }
    };
  }, [addDiagnosticLog]);

  // =========================================================================
  // SECTION 7: STORAGE CHECK (UNCHANGED)
  // =========================================================================

  const startStorageCheck = useCallback(async () => {
    addDiagnosticLog('STORAGE_CHECK', 'Starting storage check...', 'info');

    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) {
      addDiagnosticLog('STORAGE_CHECK', 'Validation failed - missing required fields', 'warning');
      return;
    }

    setIsCheckingStorage(true);
    setStorageCheckError(null);
    setStorageCheck(null);
    setTerminalLogs([{
      id: 'init',
      type: 'INFO',
      message: `Connecting to ${parameters.hostname}...`,
      timestamp: new Date().toLocaleTimeString()
    }]);

    try {
        const payload = {
            hostname: parameters.hostname,
            username: parameters.username,
            password: parameters.password,
            tests: ["test_storage_check"],
            mode: "check",
            tag: "snap"
        };

        addDiagnosticLog('API', `Sending POST to ${API_BASE}/api/operations/validation/execute-v2`, 'info');
        addDiagnosticLog('API', `Payload: ${JSON.stringify(payload)}`, 'info');

        const res = await fetch(`${API_BASE}/api/operations/validation/execute-v2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        addDiagnosticLog('API', `Response status: ${res.status}`, res.ok ? 'success' : 'error');

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText);
        }

        const data = await res.json();
        addDiagnosticLog('API', `Response: job_id=${data.job_id}, ws_channel=${data.ws_channel}`, 'success');

        const returnedJobId = data.job_id;
        const returnedChannel = data.ws_channel;



        // Subscribe
        if (returnedChannel && wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            addDiagnosticLog('SUBSCRIBE', `Subscribing to channel: ${returnedChannel}`, 'info');

            wsConnection.send(JSON.stringify({
                type: 'SUBSCRIBE',
                channel: returnedChannel
            }));

            addDiagnosticLog('SUBSCRIBE', '✅ Subscription message sent', 'success');
        } else {
            addDiagnosticLog('SUBSCRIBE', '❌ WebSocket not ready', 'error', {
              wsExists: !!wsConnection,
              readyState: wsConnection?.readyState,
              readyStateDescription: wsConnection?.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
                                   wsConnection?.readyState === WebSocket.OPEN ? 'OPEN' :
                                   wsConnection?.readyState === WebSocket.CLOSING ? 'CLOSING' :
                                   wsConnection?.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN'
            });
        }

        setTerminalLogs(prev => [...prev, {
            id: 'job_start',
            type: 'INFO',
            message: `Job Started (${returnedJobId}). Waiting for results...`,
            timestamp: new Date().toLocaleTimeString()
        }]);

    } catch (e) {
        addDiagnosticLog('STORAGE_CHECK', `Error: ${e.message}`, 'error', e);
        setStorageCheckError(e.message);
        setIsCheckingStorage(false);
        setTerminalLogs(prev => [...prev, {
          id: 'api_fail',
          type: 'ERROR',
          message: e.message,
          timestamp: new Date().toLocaleTimeString()
        }]);
    }
  }, [selectedFile, parameters, wsConnection, addDiagnosticLog]);

  // =========================================================================
  // SECTION 8: DEBOUNCE EFFECT (UNCHANGED)
  // =========================================================================

  useEffect(() => {
    const isReady = selectedFile && parameters.hostname && parameters.username && parameters.password;

    if (isReady) {
      const timer = setTimeout(() => {
          if (!isCheckingStorage && !storageCheck) {
            startStorageCheck();
          }
      }, 1500);

      return () => clearTimeout(timer);
    } else {
      setStorageCheck(null);
      setStorageCheckError(null);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password, isCheckingStorage, storageCheck, startStorageCheck, addDiagnosticLog]);

  // =========================================================================
  // SECTION 9: UI HELPER FUNCTIONS (ENHANCED)
  // =========================================================================

  const getWsStatusColor = () => {
    switch(wsStatus) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'connecting': return 'text-blue-600 bg-blue-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getWsStatusIcon = () => {
    switch(wsStatus) {
      case 'connected': return <Wifi className="h-3 w-3" />;
      case 'connecting': return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'error': return <WifiOff className="h-3 w-3" />;
      default: return <WifiOff className="h-3 w-3" />;
    }
  };

  const copyDiagnosticsToClipboard = () => {
    const text = diagnostics.map(d => `[${d.timestamp}] ${d.category}: ${d.message}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const exportDiagnostics = () => {
    const text = JSON.stringify(diagnostics, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagnostics.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // SECTION 10: MODERN UI RENDER (REDESIGNED)
  // =========================================================================

  return (
    <div className="flex flex-col h-screen w-full bg-gradient-to-br from-slate-50 to-blue-50 text-slate-900 overflow-hidden font-sans">

      {/* COMPACT APP BAR WITH GLASS EFFECT */}
      <div className="flex-none h-12 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-blue-600 to-purple-600 text-white p-1.5 rounded-lg shadow-sm">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-slate-900">
              Image<span className="font-light text-slate-600">Deployer</span>
            </h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-red-50 text-red-700 border-red-200">
                DEBUG
              </Badge>
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${getWsStatusColor()}`}>
                {getWsStatusIcon()}
                <span className="uppercase tracking-wider">{wsStatus}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={runFullDiagnostics}
            disabled={isRunningDiagnostics}
            className="h-8 text-xs"
          >
            {isRunningDiagnostics ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Activity className="h-3 w-3 mr-1" />
            )}
            Diagnostics
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setActiveTab('logs')}
            className="h-8 text-xs"
          >
            <Terminal className="h-3 w-3 mr-1" />
            Logs
          </Button>
        </div>
      </div>

      {/* MAIN CONTENT - COMPACT LAYOUT */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
          
          {/* LEFT COLUMN: CONFIGURATION & CONTROLS */}
          <div className="flex flex-col gap-4">
            
            {/* QUICK STATUS CARD */}
            <Card className="bg-white/70 backdrop-blur-sm border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4 text-slate-600" />
                    <span className="text-sm font-semibold">Connection Status</span>
                  </div>
                  <Badge variant={wsStatus === 'connected' ? 'default' : 'secondary'} className="text-xs">
                    {wsStatus}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">API</p>
                    <p className="font-mono truncate bg-slate-50 p-1.5 rounded text-[10px]">{API_BASE}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide">WebSocket</p>
                    <p className="font-mono truncate bg-slate-50 p-1.5 rounded text-[10px]">{WS_BASE}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* COLLAPSIBLE CONFIGURATION CARD */}
            <Card className="bg-white/70 backdrop-blur-sm border-slate-200 shadow-sm">
              <CardHeader 
                className="p-4 cursor-pointer hover:bg-slate-50/50 transition-colors rounded-t-lg"
                onClick={() => setIsConfigExpanded(!isConfigExpanded)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Configuration
                  </CardTitle>
                  {isConfigExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              
              {isConfigExpanded && (
                <CardContent className="p-4 pt-0 space-y-4">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2 block">
                      File Selection
                    </label>
                    <FileSelection
                      selectedFile={selectedFile}
                      setSelectedFile={setSelectedFile}
                      isRunning={false}
                    />
                  </div>

                  <Separator />

                  <div className="grid grid-cols-1 gap-4">
                    <DeviceTargetSelector parameters={parameters} onParamChange={setParameters} />
                    <DeviceAuthFields parameters={parameters} onParamChange={setParameters} />
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={startStorageCheck} 
                      disabled={isCheckingStorage}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      {isCheckingStorage ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Checking...
                        </>
                      ) : (
                        'Check Storage'
                      )}
                    </Button>
                    
                    <Button 
                      onClick={runFullDiagnostics}
                      disabled={isRunningDiagnostics}
                      size="sm"
                      className="flex-1"
                    >
                      {isRunningDiagnostics ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Activity className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* STORAGE CHECK RESULTS */}
            {(storageCheck || storageCheckError) && (
              <Card className={`border-l-4 ${
                storageCheck?.has_sufficient_space 
                  ? 'bg-green-50/70 border-green-400' 
                  : storageCheckError 
                  ? 'bg-red-50/70 border-red-400'
                  : 'bg-yellow-50/70 border-yellow-400'
              } backdrop-blur-sm shadow-sm`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    {storageCheck?.has_sufficient_space ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : storageCheckError ? (
                      <XCircle className="h-5 w-5 text-red-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${
                        storageCheck?.has_sufficient_space ? 'text-green-800' : 
                        storageCheckError ? 'text-red-800' : 'text-yellow-800'
                      }`}>
                        {storageCheck?.has_sufficient_space 
                          ? '✅ Storage Check Passed' 
                          : storageCheckError 
                          ? '❌ Storage Check Failed'
                          : '⚠️ Storage Check In Progress'}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        {storageCheck?.has_sufficient_space 
                          ? 'Sufficient space available for upload'
                          : storageCheckError 
                          ? storageCheckError
                          : 'Checking device storage...'}
                      </p>
                    </div>
                  </div>
                  
                  {storageCheck?.details && (
                    <details className="mt-3">
                      <summary className="text-xs text-slate-600 cursor-pointer hover:text-slate-800">
                        View storage details
                      </summary>
                      <div className="mt-2 space-y-1 text-xs font-mono bg-white/50 p-2 rounded">
                        {storageCheck.details.map((fs, idx) => (
                          <div key={idx} className="flex justify-between">
                            <span>{fs['mounted-on']}:</span>
                            <span>{fs['available-blocks']} blocks</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
            )}

            {/* UPLOAD BUTTON - PROMINENT PLACEMENT */}
            <Button 
              onClick={async () => {
                addDiagnosticLog('UPLOAD', `Upload clicked. Storage check: ${JSON.stringify(storageCheck)}, Selected file: ${selectedFile ? selectedFile.name : 'none'}`, 'info');
                
                if (!storageCheck?.has_sufficient_space) {
                  addDiagnosticLog('UPLOAD', 'Upload blocked: Insufficient storage space', 'error');
                  return;
                }
                
                if (!selectedFile) {
                  addDiagnosticLog('UPLOAD', 'Upload blocked: No file selected', 'error');
                  return;
                }
                
                if (!parameters.hostname || !parameters.username || !parameters.password) {
                  addDiagnosticLog('UPLOAD', 'Upload blocked: Missing device credentials', 'error');
                  return;
                }
                
                try {
                  setInternalIsUploading(true);
                  addDiagnosticLog('UPLOAD', 'Starting image upload...', 'info');
                  
                  const formData = new FormData();
                  formData.append('file', selectedFile);
                  formData.append('hostname', parameters.hostname);
                  formData.append('username', parameters.username);
                  formData.append('password', parameters.password);
                  
                  const response = await fetch(`${API_BASE}/api/files/upload`, {
                    method: 'POST',
                    body: formData
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    addDiagnosticLog('UPLOAD', `✅ Image upload completed successfully: ${result.message}`, 'success');
                    if (result.job_id) {
                      addDiagnosticLog('UPLOAD', `Upload job ID: ${result.job_id}`, 'info');
                      
                      // Subscribe to upload progress channel
                      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
                        addDiagnosticLog('UPLOAD', `Subscribing to upload channel: ${result.ws_channel}`, 'info');
                        
                        wsConnection.send(JSON.stringify({
                          type: 'SUBSCRIBE',
                          channel: result.ws_channel
                        }));
                        
                        addDiagnosticLog('UPLOAD', '✅ Subscribed to upload progress channel', 'success');
                      }
                    }
                  } else {
                    const errorText = await response.text();
                    addDiagnosticLog('UPLOAD', `❌ Upload failed: ${errorText}`, 'error');
                  }
                } catch (error) {
                  addDiagnosticLog('UPLOAD', `❌ Upload error: ${error.message}`, 'error');
                } finally {
                  setInternalIsUploading(false);
                }
                
                if (onUpload) {
                  onUpload();
                }
              }}
              disabled={!storageCheck?.has_sufficient_space || isUploading || !selectedFile}
              className={`w-full h-12 font-semibold shadow-lg ${
                storageCheck?.has_sufficient_space 
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700' 
                  : 'bg-slate-400 cursor-not-allowed'
              } text-white transition-all duration-200`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading Image...
                </>
              ) : (
                <>
                  <HardDrive className="mr-2 h-4 w-4" />
                  Upload Image to Device
                </>
              )}
            </Button>
          </div>

          {/* RIGHT COLUMN: TERMINAL OUTPUT */}
          <div className="flex flex-col h-full">
            <Card className="bg-slate-900 border-slate-700 shadow-lg flex-1 flex flex-col">
              <CardHeader 
                className="p-3 border-b border-slate-700 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => setIsTerminalExpanded(!isTerminalExpanded)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2 text-slate-200">
                    <Terminal className="h-4 w-4" />
                    Terminal Output
                    {terminalLogs.length > 0 && (
                      <Badge variant="secondary" className="bg-slate-700 text-slate-300 text-[10px]">
                        {terminalLogs.length}
                      </Badge>
                    )}
                  </CardTitle>
                  {isTerminalExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </div>
              </CardHeader>
              
              {isTerminalExpanded && (
                <CardContent className="p-0 flex-1 flex flex-col">
                  <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-xs">
                    {terminalLogs.length === 0 ? (
                      <p className="text-slate-500 italic">Waiting for output... Storage check will auto-start when form is complete.</p>
                    ) : (
                      terminalLogs.map(log => (
                        <div key={log.id} className="flex gap-2 group hover:bg-slate-800/50 p-1 rounded">
                          <span className="text-slate-500 flex-shrink-0 text-[10px]">{log.timestamp}</span>
                          <span className={`flex-shrink-0 font-bold text-[10px] px-1 rounded ${
                            log.type === 'ERROR' ? 'text-red-400 bg-red-400/10' :
                            log.type === 'SUCCESS' ? 'text-green-400 bg-green-400/10' :
                            'text-blue-400 bg-blue-400/10'
                          }`}>
                            {log.type}
                          </span>
                          <span className="flex-1 break-words text-slate-300">{log.message}</span>
                        </div>
                      ))
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                  
                  {/* TERMINAL CONTROLS */}
                  <div className="flex justify-between items-center p-2 border-t border-slate-700 bg-slate-800/50">
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 text-xs text-slate-400 hover:text-slate-200"
                        onClick={() => setTerminalLogs([])}
                      >
                        Clear
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 text-xs text-slate-400 hover:text-slate-200"
                        onClick={() => terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })}
                      >
                        Scroll to Bottom
                      </Button>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {terminalLogs.length} messages
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* FLOATING DIAGNOSTICS PANEL - ONLY SHOWS WHEN ACTIVE */}
      {activeTab === 'diagnostics' && (
        <div className="absolute inset-4 bg-white/95 backdrop-blur-md rounded-lg border border-slate-200 shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h3 className="text-lg font-semibold">Diagnostic Results</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyDiagnosticsToClipboard}>
                <Copy className="h-4 w-4 mr-1" /> Copy
              </Button>
              <Button size="sm" variant="outline" onClick={exportDiagnostics}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveTab('main')}>
                Close
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 bg-slate-900 text-slate-300 font-mono text-sm">
            {diagnostics.length === 0 ? (
              <p className="text-slate-500">No diagnostics run yet. Click the Diagnostics button to start.</p>
            ) : (
              diagnostics.map(log => (
                <div key={log.id} className="flex gap-3 py-1 border-b border-slate-700 last:border-b-0">
                  <span className="text-slate-500 flex-shrink-0 text-xs">{log.timestamp}</span>
                  <span className={`flex-shrink-0 font-bold w-24 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'warning' ? 'text-yellow-400' :
                    'text-blue-400'
                  }`}>
                    [{log.category}]
                  </span>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
