/**
 * =============================================================================
 * FILE LOCATION: frontend/src/components/ImageUploads-DEBUG.jsx
 * DESCRIPTION:   Complete Diagnostic Tool for WebSocket & Storage Check
 *                Comprehensive debugging to identify connection issues
 * VERSION:       1.0.0 - Diagnostic
 * AUTHOR:        nikos-geranios_vgi
 * DATE:          2025-11-25
 * =============================================================================
 */
 
import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, HardDrive, Play, FileText, Terminal,
  LayoutDashboard, Activity, Server, CheckCircle2, XCircle,
  AlertCircle, Info, Copy, Download, RefreshCw
} from 'lucide-react';
 
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
 
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';
 
const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_RUST_WS_URL || 'ws://localhost:3100/ws';
 
// =========================================================================
// COLOR-CODED DEBUG LOGGER
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
  isRunning = false,
  isUploading: externalIsUploading,
  uploadProgress: externalUploadProgress
}) {
  // =========================================================================
  // SECTION 1: STATE MANAGEMENT
  // =========================================================================
 
  const [internalSelectedFile, setInternalSelectedFile] = useState(null);
  const [internalParameters, setInternalParameters] = useState({
    hostname: '', inventory_file: '', username: '', password: ''
  });
 
  // Storage Validation State
  const [checkJobId, setCheckJobId] = useState(null);
  const [storageCheck, setStorageCheck] = useState(null);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [storageCheckError, setStorageCheckError] = useState(null);
 
  // Terminal/Log State
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalEndRef = useRef(null);
  const [activeTab, setActiveTab] = useState("source");
 
  // WebSocket State
  const [wsConnection, setWsConnection] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [wsError, setWsError] = useState(null);
  const [wsStatus, setWsStatus] = useState('disconnected');
 
  // Diagnostic State
  const [diagnostics, setDiagnostics] = useState([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
 
  // =========================================================================
  // SECTION 2: PROPS RESOLUTION
  // =========================================================================
 
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploading = externalIsUploading || false;
  const uploadProgress = externalUploadProgress || 0;
  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));
 
  // =========================================================================
  // SECTION 3: DIAGNOSTIC LOGGING
  // =========================================================================
 
  const addDiagnosticLog = (category, message, type = 'info', data = null) => {
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
  };
 
  // =========================================================================
  // SECTION 4: AUTO-SCROLL EFFECT
  // =========================================================================
 
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);
 
  // =========================================================================
  // SECTION 5: COMPREHENSIVE WEBSOCKET DIAGNOSTICS
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
        const pingRes = await fetch('http://localhost:3100/health', {
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
  // SECTION 6: WEBSOCKET LIFECYCLE
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
        setIsConnected(true);
        setWsStatus('connected');
        setWsError(null);
      };
 
      ws.onmessage = (event) => {
        messageCount++;
        const messagePreview = event.data.substring(0, 150);
        addDiagnosticLog('WEBSOCKET', `Message #${messageCount} received (${event.data.length} bytes)`, 'info', messagePreview);
 
        // Process message
        try {
          const msgData = JSON.parse(event.data);
          addDiagnosticLog('MESSAGE', `Parsed: type=${msgData.type}, event_type=${msgData.event_type}`, 'info');
 
          // Add to terminal logs
          setTerminalLogs(prev => [...prev, {
              id: Date.now() + Math.random(),
              type: msgData.event_type || 'INFO',
              message: msgData.message || JSON.stringify(msgData).substring(0, 100),
              timestamp: new Date().toLocaleTimeString()
          }]);
        } catch (parseErr) {
          addDiagnosticLog('MESSAGE', `Failed to parse JSON: ${parseErr.message}`, 'error');
        }
      };
 
      ws.onerror = (err) => {
        addDiagnosticLog('WEBSOCKET', `❌ WebSocket error: ${err.message || 'Unknown'}`, 'error');
        setIsConnected(false);
        setWsStatus('error');
        setWsError(err.message || 'Unknown error');
      };
 
      ws.onclose = (closeEvent) => {
        addDiagnosticLog('WEBSOCKET', `Connection closed (code: ${closeEvent.code})`,
          closeEvent.code === 1000 ? 'info' : 'warning');
        setIsConnected(false);
        setWsStatus('disconnected');
        if (!intendedClose) {
          addDiagnosticLog('WEBSOCKET', '⚠️ Connection closed unexpectedly', 'warning');
        }
      };
 
    } catch (err) {
      addDiagnosticLog('WEBSOCKET', `Failed to create WebSocket: ${err.message}`, 'error', err);
      setIsConnected(false);
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
  }, []);
 
  // =========================================================================
  // SECTION 7: STORAGE CHECK
  // =========================================================================
 
  const startStorageCheck = async () => {
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
 
        setCheckJobId(returnedJobId);
 
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
  };
 
  // =========================================================================
  // SECTION 8: DEBOUNCE EFFECT
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
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);
 
  // =========================================================================
  // SECTION 9: UI HELPER FUNCTIONS
  // =========================================================================
 
  const getStorageCheckStatus = () => {
    if (isCheckingStorage) return 'checking';
    if (storageCheckError) return 'error';
    if (storageCheck) return storageCheck.has_sufficient_space ? 'sufficient' : 'insufficient';
    return 'idle';
  };
 
  const getWsStatusColor = () => {
    switch(wsStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-blue-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
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
  // SECTION 10: UI RENDER
  // =========================================================================
 
  return (
    <div className="flex flex-col h-screen w-full bg-zinc-50 text-zinc-950 overflow-hidden font-sans">
 
      {/* APP BAR */}
      <div className="flex-none h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-black text-white p-1.5 rounded-md">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-900">
            Image<span className="font-light text-zinc-500">Deployer</span> <span className="text-red-600 font-mono text-xs ml-2">DEBUG</span>
          </h1>
        </div>
 
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${
            wsStatus === 'connected' ? 'bg-green-50 border-green-200' :
            wsStatus === 'connecting' ? 'bg-blue-50 border-blue-200' :
            wsStatus === 'error' ? 'bg-red-50 border-red-200' :
            'bg-zinc-50 border-zinc-100'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              wsStatus === 'connected' ? 'bg-green-500 animate-pulse' :
              wsStatus === 'connecting' ? 'bg-blue-500 animate-pulse' :
              wsStatus === 'error' ? 'bg-red-500' :
              'bg-gray-400'
            }`}></div>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${getWsStatusColor()}`}>
              {wsStatus}
            </span>
            {wsError && <span className="text-[10px] ml-2 text-red-600">{wsError.substring(0, 30)}</span>}
          </div>
        </div>
      </div>
 
      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="main" className="h-full flex flex-col">
          <TabsList className="rounded-none border-b border-zinc-200 bg-zinc-100 w-full justify-start">
            <TabsTrigger value="main">Main</TabsTrigger>
            <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
            <TabsTrigger value="logs">WebSocket Logs</TabsTrigger>
          </TabsList>
 
          {/* MAIN TAB */}
          <TabsContent value="main" className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {/* Quick Diagnostics Button */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-6">
                  <Button
                    onClick={runFullDiagnostics}
                    disabled={isRunningDiagnostics}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isRunningDiagnostics ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Running Diagnostics...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Run Full Diagnostics
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-blue-700 mt-2">This will test network, API, and WebSocket connectivity</p>
                </CardContent>
              </Card>
 
              {/* Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                    <div>
                      <p className="text-zinc-600">API Base:</p>
                      <p className="break-all bg-zinc-50 p-2 rounded">{API_BASE}</p>
                    </div>
                    <div>
                      <p className="text-zinc-600">WebSocket URL:</p>
                      <p className="break-all bg-zinc-50 p-2 rounded">{WS_BASE}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
 
              {/* Storage Check Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Storage Check Test</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs font-bold uppercase">File Selection</label>
                    <FileSelection
                      selectedFile={selectedFile}
                      setSelectedFile={setSelectedFile}
                      isRunning={false}
                    />
                  </div>
 
                  <Separator />
 
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <DeviceTargetSelector parameters={parameters} onParamChange={setParameters} />
                    </div>
                    <div>
                      <DeviceAuthFields parameters={parameters} onParamChange={setParameters} />
                    </div>
                  </div>
 
                  <Button onClick={startStorageCheck} disabled={isCheckingStorage} className="w-full">
                    {isCheckingStorage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Checking Storage...
                      </>
                    ) : (
                      'Manual Storage Check'
                    )}
                  </Button>
                </CardContent>
              </Card>
 
              {/* Terminal */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Terminal Output</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-black text-zinc-300 p-3 rounded font-mono text-xs h-48 overflow-y-auto space-y-1">
                    {terminalLogs.length === 0 ? (
                      <p className="text-zinc-500">Waiting for output...</p>
                    ) : (
                      terminalLogs.map(log => (
                        <div key={log.id} className="flex gap-2">
                          <span className="text-zinc-600 flex-shrink-0">{log.timestamp}</span>
                          <span className={`flex-shrink-0 font-bold ${
                            log.type === 'ERROR' ? 'text-red-400' :
                            log.type === 'SUCCESS' ? 'text-green-400' :
                            'text-blue-400'
                          }`}>[{log.type}]</span>
                          <span className="flex-1 break-words">{log.message}</span>
                        </div>
                      ))
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
 
          {/* DIAGNOSTICS TAB */}
          <TabsContent value="diagnostics" className="flex-1 overflow-y-auto p-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-sm">Diagnostic Results</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={copyDiagnosticsToClipboard}>
                      <Copy className="h-4 w-4 mr-1" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={exportDiagnostics}>
                      <Download className="h-4 w-4 mr-1" /> Export
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-black text-zinc-300 p-4 rounded font-mono text-xs max-h-96 overflow-y-auto space-y-1">
                  {diagnostics.length === 0 ? (
                    <p className="text-zinc-500">Click "Run Full Diagnostics" to start...</p>
                  ) : (
                    diagnostics.map(log => (
                      <div key={log.id} className="flex gap-2 break-all">
                        <span className="text-zinc-600 flex-shrink-0">{log.timestamp}</span>
                        <span className={`flex-shrink-0 font-bold w-20 ${
                          log.type === 'error' ? 'text-red-400' :
                          log.type === 'success' ? 'text-green-400' :
                          log.type === 'warning' ? 'text-yellow-400' :
                          'text-blue-400'
                        }`}>[{log.category}]</span>
                        <span className="flex-1">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
 
          {/* LOGS TAB */}
          <TabsContent value="logs" className="flex-1 overflow-y-auto p-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">WebSocket Message Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-2">
                  <p className="text-zinc-600">
                    Open your browser's Developer Console (F12) to see color-coded debug logs:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-zinc-700">
                    <li><span className="bg-blue-500 text-white px-2 py-1 rounded text-[10px]">[WS]</span> WebSocket events</li>
                    <li><span className="bg-green-500 text-white px-2 py-1 rounded text-[10px]">[STORAGE_CHECK]</span> Storage check events</li>
                    <li><span className="bg-orange-500 text-white px-2 py-1 rounded text-[10px]">[API]</span> API calls</li>
                    <li><span className="bg-purple-500 text-white px-2 py-1 rounded text-[10px]">[MESSAGE]</span> Received messages</li>
                    <li><span className="bg-red-500 text-white px-2 py-1 rounded text-[10px]">[ERROR]</span> Errors</li>
                    <li><span className="bg-pink-500 text-white px-2 py-1 rounded text-[10px]">[STATE]</span> State changes</li>
                  </ul>
                  <Separator className="my-4" />
                  <p className="font-mono bg-zinc-100 p-3 rounded text-[10px]">
                    Press F12 to open DevTools, go to Console tab to see detailed logs with context
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
 
 
