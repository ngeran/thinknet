/**
 * =============================================================================
 * FILE LOCATION: frontend/src/components/ImageUploads.jsx
 * DESCRIPTION:   Compact Dashboard for Image Uploads & Storage Validation.
 *                UPDATED: Now points to 'execute-v2' to use JSNAPy Module backend.
 * =============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2, HardDrive, Play, FileText, Terminal,
  LayoutDashboard, Activity, Server, CheckCircle2, XCircle
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Shared Components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import FileSelection from '@/shared/FileSelection';

// Hooks & Utilities
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { processLogMessage } from '@/lib/logProcessor';

// API Configuration
const API_BASE = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

export default function ImageUploader({
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
  
  // Internal State
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

  // WebSocket Hook - Now grabbing sendMessage
  const { lastMessage, isConnected, sendMessage } = useJobWebSocket();

  // Props Resolution
  const selectedFile = externalSelectedFile !== undefined ? externalSelectedFile : internalSelectedFile;
  const parameters = externalParameters || internalParameters;
  const isUploading = externalIsUploading || false; 
  const uploadProgress = externalUploadProgress || 0;
  const setSelectedFile = externalSetSelectedFile || setInternalSelectedFile;
  const setParameters = externalOnParamChange
    ? (name, value) => externalOnParamChange(name, value)
    : (name, value) => setInternalParameters(prev => ({ ...prev, [name]: value }));

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  // =========================================================================
  // SECTION 2: WEBSOCKET EVENT LISTENER
  // =========================================================================
  useEffect(() => {
    // 1. Basic Validation
    if (!lastMessage || !checkJobId) return;

    // 2. Validate Job ID (Permissive Check)
    // Only block if job_id is present AND explicitly mismatches
    if (lastMessage.job_id && lastMessage.job_id !== checkJobId) {
        return; 
    }

    // 3. Process Log
    const log = processLogMessage(lastMessage);
    
    // 4. Update Terminal UI
    setTerminalLogs(prev => {
        const last = prev[prev.length - 1];
        if (last && last.originalId === log.id) return prev;

        return [...prev, {
            id: log.id,
            type: log.type,
            message: log.message,
            timestamp: log.timestamp,
            originalId: log.id
        }];
    });

    // 5. Handle Logic States
    const raw = log.originalEvent || {};

    if (log.type === 'ERROR') {
        setStorageCheckError(log.message);
        setIsCheckingStorage(false);
        setCheckJobId(null);
    }
    // Handle JSNAPy Result OR Final Results
    else if (raw.type === 'result' || raw.final_results) {
        processStorageResult(raw.data || raw.final_results || raw);
        setIsCheckingStorage(false);
        setCheckJobId(null); 
    }
    // Fallback: If job finishes without sending a distinct result object
    else if (raw.type === 'job_status' && raw.status === 'finished' && isCheckingStorage) {
         // If we get here, we likely missed the result or it was empty
         // Only unset if we haven't already processed a result
         if (!storageCheck && !storageCheckError) {
             setIsCheckingStorage(false);
             setCheckJobId(null);
         }
    }

  }, [lastMessage, checkJobId]);


  // =========================================================================
  // SECTION 3: STORAGE CHECK LOGIC
  // =========================================================================
  const processStorageResult = (resultData) => {
        try {
            console.log("Storage Result Payload:", resultData);

            const hostResult = resultData.results_by_host?.[0];
            if (!hostResult) return; 
            
            const testResult = hostResult?.test_results?.[0];
            
            // 1. Handle JSNAPy Errors
            if (testResult?.error) {
                // If the device threw an RPC error, we display it here
                throw new Error(testResult.error);
            }

            // 2. Extract the Data Row
            const row = testResult?.data?.[0]; 
            
            if (!row) {
              throw new Error("Device returned empty storage data.");
            }

            // 3. Normalization: Handle XML (kebab-case) vs PyEZ (snake_case)
            // Your XML logs confirm tags like 'available-blocks' and 'mounted-on'
            const availableRaw = row['available-blocks'] || row['available_kb'];
            const mountedOn = row['mounted-on'] || row['mounted_on'] || "Unknown";

            if (!availableRaw) {
                console.warn("Row keys:", Object.keys(row));
                throw new Error(`Data missing 'available-blocks'.`);
            }

            // 4. MATH FIX: Junos XML blocks are 512 bytes (sectors)
            // Formula: (Blocks * 512) / (1024 * 1024) = MB
            // Shortcut: Blocks / 2048 = MB
            const availableMB = parseInt(availableRaw) / 2048;
            const requiredMB = selectedFile.size / (1024 * 1024);
            
            setStorageCheck({
                has_sufficient_space: availableMB > requiredMB,
                available_mb: availableMB.toFixed(2),
                used_percent: row['used-percent']?.trim() || "N/A",
                filesystem: mountedOn
            });
            
            setTerminalLogs(prev => [...prev, {
                id: Date.now(), 
                type: 'SUCCESS', 
                message: `Space Verified: ${availableMB.toFixed(2)}MB available on ${mountedOn}`
            }]);
            
        } catch (err) {
            console.error("Storage Parse Error:", err);
            setStorageCheckError(err.message);
            setTerminalLogs(prev => [...prev, {
                id: Date.now(), 
                type: 'ERROR', 
                message: `Check Failed: ${err.message}`
            }]);
        }
    };

  const startStorageCheck = async () => {
    if (!selectedFile || !parameters.hostname || !parameters.username || !parameters.password) return;

    setIsCheckingStorage(true);
    setStorageCheckError(null);
    setStorageCheck(null);
    setTerminalLogs([{ id: 'init', type: 'INFO', message: `Connecting to ${parameters.hostname} (JSNAPy V2)...` }]);

    try {
        const payload = {
            hostname: parameters.hostname,
            username: parameters.username,
            password: parameters.password,
            tests: ["test_storage_check"],
            // Mode and Tag are handled by V2 backend defaults, but we keep them for compatibility
            mode: "check",
            tag: "snap" 
        };

        // =====================================================================
        // UPDATE: Pointing to 'execute-v2' to use the JSNAPy Module backend
        // =====================================================================
        const res = await fetch(`${API_BASE}/api/operations/validation/execute-v2`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(await res.text());
        
        const data = await res.json();
        
        // 1. Set Job ID for filtering
        setCheckJobId(data.job_id); 
        
        // 2. CRITICAL FIX: SUBSCRIBE TO THE CHANNEL
        if (data.ws_channel && sendMessage) {
            console.log(`Subscribing to channel: ${data.ws_channel}`);
            sendMessage({ 
                type: 'SUBSCRIBE', 
                channel: data.ws_channel 
            });
        } else {
            console.warn("WebSocket sendMessage not available or channel missing");
        }
        
        setTerminalLogs(prev => [...prev, { 
            id: 'job_start', 
            type: 'INFO', 
            message: `Job Started (${data.job_id}). Stream active.` 
        }]);

    } catch (e) {
        setStorageCheckError(e.message);
        setIsCheckingStorage(false);
        setTerminalLogs(prev => [...prev, { id: 'api_fail', type: 'ERROR', message: e.message }]);
    }
  };

  // Debounce Trigger
  useEffect(() => {
    const isReady = selectedFile && parameters.hostname && parameters.username && parameters.password;
    if (isReady) {
      const timer = setTimeout(() => {
          if (!isCheckingStorage && !storageCheck) startStorageCheck();
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setStorageCheck(null);
      setStorageCheckError(null);
    }
  }, [selectedFile, parameters.hostname, parameters.username, parameters.password]);


  // =========================================================================
  // SECTION 4: UI RENDERER
  // =========================================================================
  
  const handleUpload = () => { if (isFormValid && onUpload) onUpload(); };
  
  const isFormValid = selectedFile && parameters.username && parameters.password && 
                     (parameters.hostname || parameters.inventory_file);

  const getStorageCheckStatus = () => {
    if (isCheckingStorage) return 'checking';
    if (storageCheckError) return 'error';
    if (storageCheck) return storageCheck.has_sufficient_space ? 'sufficient' : 'insufficient';
    return 'idle';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-1rem)] md:h-screen w-full bg-zinc-50 text-zinc-950 overflow-hidden font-sans">
      
      {/* APP BAR */}
      <div className="flex-none h-14  bg-white border-b border-zinc-200 flex items-center justify-between px-4 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="bg-black text-white p-1.5 rounded-md"><LayoutDashboard className="h-4 w-4" /></div>
          <h1 className="text-lg font-bold tracking-tight text-zinc-900">Image<span className="font-light text-zinc-500">Deployer</span></h1>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-zinc-50 border border-zinc-100 rounded-full">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-300'}`}></div>
            <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider">{isConnected ? 'System Online' : 'Connecting...'}</span>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden relative">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col md:block">
            
            {/* Mobile Tab List */}
            <div className="md:hidden p-2 bg-white border-b border-zinc-200">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="source" className="text-xs">Source</TabsTrigger>
                    <TabsTrigger value="target" className="text-xs">Target</TabsTrigger>
                    <TabsTrigger value="deploy" className="text-xs">Deploy</TabsTrigger>
                </TabsList>
            </div>

            <div className="h-full overflow-y-auto md:overflow-hidden p-2 md:p-4">
                <div className="hidden md:grid h-full grid-cols-12 gap-4 pb-2">
                    
                    {/* LEFT COLUMN */}
                    <div className="col-span-4 flex flex-col gap-4 h-full overflow-hidden">
                        <Card className="flex-none border-zinc-200 shadow-sm">
                            <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase text-zinc-500 flex items-center gap-2"><FileText className="h-3 w-3" /> Firmware Source</h3>
                                {selectedFile && <Badge variant="secondary" className="text-[10px] px-1 h-5">{selectedFile.name.split('.').pop()?.toUpperCase()}</Badge>}
                            </div>
                            <div className="p-3"><FileSelection selectedFile={selectedFile} setSelectedFile={setSelectedFile} isRunning={isRunning} /></div>
                        </Card>

                        <Card className="flex-1 flex flex-col border-zinc-200 shadow-sm min-h-0">
                            <div className="px-3 py-2 border-b border-zinc-100 bg-zinc-50/50">
                                <h3 className="text-xs font-bold uppercase text-zinc-500 flex items-center gap-2"><Server className="h-3 w-3" /> Target Device</h3>
                            </div>
                            <CardContent className="p-3 space-y-4 overflow-y-auto custom-scrollbar">
                                <DeviceTargetSelector parameters={parameters} onParamChange={setParameters} />
                                <Separator className="bg-zinc-100" />
                                <DeviceAuthFields parameters={parameters} onParamChange={setParameters} />
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="col-span-8 flex flex-col gap-4 h-full overflow-hidden">
                        
                        {/* Status Cards */}
                        <div className="flex-none grid grid-cols-2 gap-4">
                            <div className={`bg-white border rounded-lg p-3 shadow-sm flex items-center gap-3 transition-colors ${storageCheckError ? 'border-red-200 bg-red-50' : 'border-zinc-200'}`}>
                                <div className={`p-2 rounded-md ${isCheckingStorage ? 'bg-blue-100 text-blue-600' : getStorageCheckStatus() === 'sufficient' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-400'}`}>
                                    {isCheckingStorage ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-zinc-700 uppercase">Storage Check</p>
                                    <p className="text-xs text-zinc-500 truncate">
                                        {isCheckingStorage ? "Querying device..." : 
                                         storageCheckError ? "Check failed" : 
                                         storageCheck ? `${storageCheck.available_mb} MB Available` : 
                                         "Waiting for input..."}
                                    </p>
                                </div>
                                {storageCheck && !isCheckingStorage && (storageCheck.has_sufficient_space ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />)}
                            </div>
                            <div className="bg-white border border-zinc-200 rounded-lg p-3 shadow-sm flex items-center gap-3">
                                <div className="p-2 rounded-md bg-zinc-100 text-zinc-900"><Activity className="h-4 w-4" /></div>
                                <div><p className="text-xs font-bold text-zinc-700 uppercase">Telemetry</p><p className="text-xs text-zinc-500">{isConnected ? 'Real-time stream active' : 'Connecting to hub...'}</p></div>
                            </div>
                        </div>

                        {/* Terminal */}
                        <div className="flex-1 bg-black rounded-lg border border-zinc-800 shadow-inner flex flex-col min-h-0 overflow-hidden relative">
                            <div className="flex-none h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-3">
                                <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-2"><Terminal className="h-3 w-3" /> system console</span>
                                {isCheckingStorage && <span className="text-[10px] text-blue-500 font-mono animate-pulse">● QUERYING</span>}
                            </div>
                            
                            <div className="flex-1 p-3 font-mono text-xs text-zinc-300 overflow-y-auto space-y-1 custom-scrollbar">
                                <p className="text-zinc-500"># System ready.</p>
                                {terminalLogs.map((log) => (
                                    <div key={log.id} className="flex gap-2 border-l-2 border-zinc-800 pl-2 mb-1 break-all">
                                        <span className="text-zinc-600 select-none">[{log.type}]</span>
                                        <span className={`${
                                            log.type === 'ERROR' ? 'text-red-400' : 
                                            log.type === 'SUCCESS' ? 'text-green-400' : 
                                            log.type === 'STEP_PROGRESS' ? 'text-blue-400' : 
                                            'text-zinc-300'
                                        }`}>
                                            {log.message}
                                        </span>
                                    </div>
                                ))}
                                {isCheckingStorage && terminalLogs.length === 0 && <p className="text-blue-400 animate-pulse">... waiting for worker script ...</p>}
                                <div ref={terminalEndRef} />
                            </div>

                            {/* Progress Bar */}
                            {isUploading && (
                                <div className="absolute bottom-0 left-0 right-0 bg-zinc-900/90 backdrop-blur-sm p-3 border-t border-zinc-800">
                                    <div className="flex justify-between text-[10px] text-zinc-400 mb-1 font-mono"><span>UPLOAD_PROGRESS</span><span>{uploadProgress?.toFixed(1) || 0}%</span></div>
                                    <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-green-500 transition-all duration-200" style={{ width: `${uploadProgress || 0}%` }}/></div>
                                </div>
                            )}
                        </div>

                        {/* Buttons */}
                        <div className="flex-none pt-1">
                            {isRunning || isUploading ? (
                                <Button disabled className="w-full h-12 bg-zinc-100 text-zinc-400"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</Button>
                            ) : (
                                <Button onClick={handleUpload} disabled={!isFormValid || !storageCheck?.has_sufficient_space} className={`w-full h-12 text-white shadow-md transition-all active:scale-[0.99] flex items-center justify-between px-6 ${isFormValid && storageCheck?.has_sufficient_space ? "bg-zinc-950 hover:bg-zinc-800" : "bg-zinc-300 cursor-not-allowed"}`}>
                                    <span className="flex items-center gap-2"><Play className="h-4 w-4 fill-current" /><span className="font-semibold tracking-wide">INITIATE TRANSFER</span></span>
                                    {storageCheck?.has_sufficient_space && <span className="text-xs opacity-75">Ready to deploy</span>}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Mobile Fallbacks */}
                <div className="md:hidden space-y-4 pb-20">
                    <TabsContent value="source"><FileSelection selectedFile={selectedFile} setSelectedFile={setSelectedFile} /></TabsContent>
                    <TabsContent value="target"><Card><CardContent className="pt-6 space-y-6"><DeviceTargetSelector parameters={parameters} onParamChange={setParameters} /><Separator /><DeviceAuthFields parameters={parameters} onParamChange={setParameters} /></CardContent></Card></TabsContent>
                    <TabsContent value="deploy"><div className="bg-zinc-100 p-3 rounded flex items-center justify-between"><div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-zinc-500" /><span className="text-sm font-medium">{isCheckingStorage ? 'Checking...' : 'Storage'}</span></div><span className={`text-xs font-bold ${storageCheck?.has_sufficient_space ? 'text-green-600' : 'text-zinc-400'}`}>{storageCheck ? `${storageCheck.available_mb} MB` : 'Pending'}</span></div></TabsContent>
                </div>
            </div>

            <div className="md:hidden flex-none p-4 bg-white border-t border-zinc-200 z-20 sticky bottom-0 w-full"><div className="flex gap-3"><Button className="flex-1 bg-zinc-900 text-white" disabled={!isFormValid || !storageCheck?.has_sufficient_space} onClick={handleUpload}>{isCheckingStorage ? 'Checking...' : 'Start Upload'}</Button></div></div>
        </Tabs>
      </div>
    </div>
  );
}
