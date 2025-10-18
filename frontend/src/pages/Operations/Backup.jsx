/**
 * =============================================================================
 * ⚙️ Device Backup Operation Component - v5.3.0 (Duplicate Fix)
 * =============================================================================
 *
 * FIX: Complete rewrite of log deduplication logic using a Set-based approach
 * to track unique message signatures and prevent any duplicate log entries.
 *
 * @version 5.3.0
 * @last_updated 2025-10-18
 * =============================================================================
 */
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

// PROGRESS COMPONENTS IMPORTS
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar'; 
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';

// FORM AND SELECTOR COMPONENTS
import BackupForm from '@/forms/BackupForm';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import { useJobWebSocket } from '@/hooks/useJobWebSocket';

// API CONFIGURATION
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Main Backup Component
 * Handles device backup operations with real-time progress tracking
 */
export default function Backup() {
    // =========================================================================
    // 🧠 STATE MANAGEMENT SECTION
    // =========================================================================
    
    // Backup configuration parameters
    const [backupParams, setBackupParams] = useState({
        username: "admin",
        password: "manolis1", 
        hostname: "172.27.200.200",
        inventory_file: "",
    });

    // UI State
    const [activeTab, setActiveTab] = useState("config");
    const [jobStatus, setJobStatus] = useState("idle");
    
    // Progress Tracking State
    const [progress, setProgress] = useState(0);
    const [jobOutput, setJobOutput] = useState([]);
    const [jobId, setJobId] = useState(null);
    const [wsChannel, setWsChannel] = useState(null);
    const [finalResults, setFinalResults] = useState(null);
    
    // Step Tracking State
    const [completedSteps, setCompletedSteps] = useState(0);
    const [totalSteps, setTotalSteps] = useState(0);

    // Refs for tracking processed data without re-renders
    const processedStepsRef = useRef(new Set());
    const latestStepMessageRef = useRef("");
    const loggedMessagesRef = useRef(new Set()); // NEW: Track logged messages to prevent duplicates

    // Custom WebSocket hook and UI refs
    const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
    const scrollAreaRef = useRef(null);

    // =========================================================================
    // 🐞 DEBUG MONITORS
    // =========================================================================
    
    useEffect(() => {
        console.log(`[DEBUG: activeTab] Tab changed to: "${activeTab}"`);
    }, [activeTab]);

    useEffect(() => {
        if (jobStatus !== 'running' && jobStatus !== 'idle') {
            console.log(`[DEBUG: jobStatus] Final status determined: "${jobStatus.toUpperCase()}"`);
        }
    }, [jobStatus]);

    // =========================================================================
    // 🧩 FORM HANDLERS SECTION
    // =========================================================================

    const handleParamChange = (name, value) => {
        setBackupParams(prev => ({ ...prev, [name]: value }));
    };

    const isFormValid =
        backupParams.username.trim() !== "" &&
        backupParams.password.trim() !== "" &&
        (backupParams.hostname.trim() !== "" || backupParams.inventory_file.trim() !== "");

    // =========================================================================
    // 🔄 WORKFLOW RESET FUNCTION
    // =========================================================================

    const resetWorkflow = () => {
        if (wsChannel) {
            sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
            console.log('[WORKFLOW] Unsubscribed from WebSocket channel');
        }

        setJobStatus("idle");
        setProgress(0);
        setJobOutput([]);
        setJobId(null);
        setWsChannel(null);
        setFinalResults(null);
        setActiveTab("config");
        setCompletedSteps(0);
        setTotalSteps(0);
        
        processedStepsRef.current.clear();
        latestStepMessageRef.current = "";
        loggedMessagesRef.current.clear(); // Clear logged messages
        
        console.log("[WORKFLOW] Workflow reset to initial state");
    };

    // =========================================================================
    // 🚀 JOB EXECUTION
    // =========================================================================

    const startJobExecution = async (e) => {
        e.preventDefault();
        
        if (!isFormValid || jobStatus === 'running') return;
        
        if (!isConnected) {
            console.error("[JOB START] WebSocket not connected - cannot start job");
            setJobOutput(prev => [...prev, { 
                timestamp: new Date().toISOString(), 
                message: "WebSocket not connected. Cannot start job.", 
                level: 'error' 
            }]);
            setJobStatus("failed");
            setActiveTab("results");
            return;
        }

        if (wsChannel) {
            sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
        
        console.log("[JOB START] Starting Backup Job...");
        setActiveTab("execute");
        setJobStatus("running");
        setProgress(0);
        setJobOutput([]);
        setFinalResults(null);
        setJobId(null);
        setWsChannel(null);
        setCompletedSteps(0);
        setTotalSteps(0);
        processedStepsRef.current.clear();
        latestStepMessageRef.current = "";
        loggedMessagesRef.current.clear(); // Clear logged messages

        const payload = {
            command: "backup",
            hostname: backupParams.hostname.trim(),
            inventory_file: backupParams.inventory_file.trim(),
            username: backupParams.username,
            password: backupParams.password,
            backup_path: "/app/shared/data/backups",
        };

        try {
            const response = await fetch(`${API_URL}/api/operations/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`API error ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            setJobId(data.job_id);
            setWsChannel(data.ws_channel);
            console.log(`[JOB START] Job initiated - ID: ${data.job_id}, Channel: ${data.ws_channel}`);

            sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
            
        } catch (error) {
            console.error("[JOB START] API Call Failed:", error);
            setJobOutput(prev => [...prev, { 
                timestamp: new Date().toISOString(), 
                message: `Job start failed: ${error.message}`, 
                level: 'error' 
            }]);
            setJobStatus("failed");
            setActiveTab("results");
        }
    };

    // =========================================================================
    // 🔌 WEBSOCKET MESSAGE HANDLER
    // =========================================================================

    useEffect(() => {
        if (!lastMessage || !jobId) return;

        const raw = lastMessage;
        
        if (typeof raw !== 'string' || (!raw.startsWith('{') && !raw.startsWith('['))) {
            console.log('[WEBSOCKET] Skipping non-JSON message:', raw.substring(0, 100));
            return;
        }

        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            console.warn('[WEBSOCKET DEBUG] Failed to parse initial JSON:', raw.substring(0, 200));
            return;
        }

        if (parsed.channel && wsChannel && !parsed.channel.includes(wsChannel)) {
            console.log('[WEBSOCKET] Skipping message from different channel:', parsed.channel);
            return;
        }

        // =====================================================================
        // 🔄 PAYLOAD EXTRACTION
        // =====================================================================

        const extractNestedProgressData = (initialParsed) => {
            let currentPayload = initialParsed;
            let deepestNestedData = null;

            if (initialParsed.data) {
                try {
                    const dataPayload = typeof initialParsed.data === 'string' 
                        ? JSON.parse(initialParsed.data) 
                        : initialParsed.data;
                    
                    currentPayload = dataPayload;

                    if (dataPayload.event_type === "ORCHESTRATOR_LOG" && dataPayload.message) {
                        const message = dataPayload.message;
                        const jsonMatch = message.match(/\[(STDOUT|STDERR)(?:_RAW)?\]\s*(\{.*\})/s);
                        if (jsonMatch && jsonMatch[2]) {
                            try {
                                deepestNestedData = JSON.parse(jsonMatch[2]);
                            } catch (parseError) {
                                console.warn('[WEBSOCKET DEBUG] Failed to parse nested JSON:', jsonMatch[2].substring(0, 200));
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[WEBSOCKET DEBUG] Failed to parse data field:', error.message);
                }
            }

            return {
                payload: deepestNestedData || currentPayload,
                isNested: !!deepestNestedData
            };
        };

        const { payload: finalPayload, isNested } = extractNestedProgressData(parsed);

        // =====================================================================
        // 📝 LOG STREAM UPDATES - DEDUPLICATION LOGIC
        // =====================================================================
        
        /**
         * Create a unique signature for each log message to detect duplicates
         */
        const createLogSignature = (payload) => {
            const msg = payload.message || '';
            const eventType = payload.event_type || 'unknown';
            const timestamp = payload.timestamp || '';
            
            // Create signature from message content + event type
            // We don't include timestamp to catch duplicates sent at slightly different times
            return `${eventType}::${msg.substring(0, 100)}`;
        };

        const logSignature = createLogSignature(finalPayload);
        
        // Check if we've already logged this message
        if (loggedMessagesRef.current.has(logSignature)) {
            console.log('[WEBSOCKET FILTER] Duplicate message detected and skipped:', logSignature);
            // Still process progress updates even if we skip logging
        } else {
            // This is a new unique message, log it
            loggedMessagesRef.current.add(logSignature);
            
            const logEntry = {
                timestamp: finalPayload.timestamp || new Date().toISOString(),
                message: finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing..."),
                level: finalPayload.level?.toLowerCase() || "info",
                event_type: finalPayload.event_type,
                data: finalPayload.data,
            };
            
            setJobOutput(prev => [...prev, logEntry]);
            
            // Auto-scroll to latest log entry
            if (scrollAreaRef.current) {
                setTimeout(() => {
                    if (scrollAreaRef.current) {
                        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
                    }
                }, 50);
            }
        }
        
        // Update latest step message for progress bar display
        const logMessage = finalPayload.message || (typeof finalPayload === 'string' ? finalPayload : "Processing...");
        if (logMessage && finalPayload.event_type !== "OPERATION_COMPLETE") {
            latestStepMessageRef.current = logMessage;
        }

        // =====================================================================
        // 📊 PROGRESS & STEP TRACKING
        // =====================================================================
        
        if (finalPayload.event_type === "OPERATION_START" && typeof finalPayload.data?.total_steps === "number") {
            console.log(`[PROGRESS] Operation started with ${finalPayload.data.total_steps} total steps`);
            setTotalSteps(finalPayload.data.total_steps);
            setProgress(5);
        }

        if (finalPayload.event_type === "STEP_START" && finalPayload.data?.step) {
            if (finalPayload.data.step > totalSteps) {
                const inferredTotal = finalPayload.data.step + 3;
                setTotalSteps(inferredTotal);
            }
        }

        if (finalPayload.event_type === "STEP_COMPLETE" && typeof finalPayload.data?.step === "number") {
            const stepNum = finalPayload.data.step;
            
            if (!processedStepsRef.current.has(stepNum)) {
                processedStepsRef.current.add(stepNum);
                
                setCompletedSteps(prevCompleted => {
                    const newCompleted = prevCompleted + 1;

                    let newProgress = progress;
                    if (totalSteps > 0) {
                        newProgress = Math.min(99, Math.round((newCompleted / totalSteps) * 100));
                    } else {
                        newProgress = Math.min(99, progress + 25);
                    }
                    
                    setProgress(newProgress);
                    return newCompleted;
                });
            }
        }

        if (finalPayload.event_type === "PROGRESS_UPDATE" && typeof finalPayload.data?.progress === "number") {
            setProgress(Math.min(99, Math.max(0, finalPayload.data.progress)));
        }

        // =====================================================================
        // 🏁 OPERATION COMPLETE
        // =====================================================================

        const isCompletionEvent = 
            finalPayload.event_type === "OPERATION_COMPLETE" || 
            finalPayload.success !== undefined ||
            (logMessage && logMessage.includes('Orchestrator completed with success')) ||
            (logMessage && logMessage.includes('Backup completed:'));

        if (isCompletionEvent) {
            // Check multiple possible locations for success status
            const finalSuccess = 
                finalPayload.success === true || 
                finalPayload.data?.final_results?.success === true ||
                finalPayload.data?.status === "SUCCESS" ||
                (logMessage && logMessage.includes('success: True')) ||
                (logMessage && logMessage.includes('Succeeded: ') && !logMessage.includes('Failed: 0') === false);
            
            console.log("[JOB COMPLETE] Final event detected:", { 
                success: finalSuccess, 
                event_type: finalPayload.event_type,
                data_status: finalPayload.data?.status,
                nested_success: finalPayload.data?.final_results?.success
            });
            
            setJobStatus(finalSuccess ? "success" : "failed");
            setFinalResults(finalPayload); 
            setProgress(100);
            
            if (totalSteps > 0) {
                setCompletedSteps(totalSteps);
            }
            
            if (wsChannel) {
                sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
            }

            requestAnimationFrame(() => {
                console.log("[TAB SWITCH] Executing scheduled tab switch to 'results'");
                setActiveTab("results");
            });
        }
    }, [lastMessage, jobId, wsChannel, sendMessage, setActiveTab, totalSteps, progress, completedSteps]); 

    // =========================================================================
    // 🧱 UI RENDER SECTION
    // =========================================================================
    
    const isRunning = jobStatus === 'running';
    const isComplete = jobStatus === 'success';
    const hasError = jobStatus === 'failed';

    return (
        <div className="p-8 pt-6">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Device Backup Operation</h1>
            <p className="text-muted-foreground mb-6">Configure, execute, and review device backups.</p>
            <Separator className="mb-8" />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="config" disabled={jobStatus === 'running'}>
                        Configure
                    </TabsTrigger>
                    <TabsTrigger value="execute">
                        Execute
                    </TabsTrigger>
                    <TabsTrigger value="results" disabled={jobStatus === 'running'}>
                        Results
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="config">
                    <div className="space-y-8 max-w-4xl">
                        <DeviceTargetSelector 
                            parameters={backupParams} 
                            onParamChange={handleParamChange} 
                        />
                        <BackupForm 
                            parameters={backupParams} 
                            onParamChange={handleParamChange} 
                        />

                        <div className="flex justify-end pt-4">
                            <Button
                                onClick={startJobExecution}
                                disabled={!isFormValid || jobStatus !== 'idle' || !isConnected}
                                className="w-full sm:w-auto"
                            >
                                {jobStatus === 'running' ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                                ) : (
                                    <>Start Backup Job <ArrowRight className="ml-2 h-4 w-4" /></>
                                )}
                            </Button>
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="execute">
                    <div className="space-y-6 p-4 border rounded-lg max-w-4xl">
                        <h2 className="text-xl font-semibold mb-4">Job Execution Status</h2>
                        
                        <EnhancedProgressBar
                            percentage={progress}
                            currentStep={latestStepMessageRef.current}
                            totalSteps={totalSteps}
                            completedSteps={completedSteps}
                            isRunning={isRunning}
                            isComplete={isComplete}
                            hasError={hasError}
                            animated={isRunning}
                            showStepCounter={true}
                            showPercentage={true}
                            compact={false}
                            variant={isComplete ? "success" : hasError ? "destructive" : "default"}
                        />

                        <ScrollArea className="h-96 bg-background/50 p-4 rounded-md border">
                            <div ref={scrollAreaRef} className="space-y-3">
                                {jobOutput.length === 0 ? (
                                    <p className="text-center text-muted-foreground pt-4">
                                        Waiting for job to start...
                                    </p>
                                ) : (
                                    jobOutput.map((log, index) => (
                                        <EnhancedProgressStep
                                            key={`${log.timestamp}-${index}`}
                                            step={{
                                                message: log.message,
                                                level: log.level,
                                                timestamp: log.timestamp,
                                                type: log.event_type, 
                                            }}
                                            isLatest={index === jobOutput.length - 1}
                                            compact={false}
                                            showTimestamp={true}
                                        />
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </TabsContent>

                <TabsContent value="results">
                    <div className="space-y-6 p-6 border rounded-lg max-w-4xl">
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            {jobStatus === 'success' ? (
                                <><CheckCircle className="h-6 w-6 text-green-500" /> Backup Completed Successfully!</>
                            ) : jobStatus === 'failed' ? (
                                <><XCircle className="h-6 w-6 text-destructive" /> Backup Failed</>
                            ) : (
                                "Awaiting Execution"
                            )}
                        </h2>
                        <Separator />

                        <div className="space-y-2">
                            <p className="font-medium">Backup Summary:</p>
                            <ul className="list-disc list-inside text-muted-foreground ml-4 space-y-1">
                                <li>Target Device: <strong>{backupParams.hostname || 'N/A'}</strong></li>
                                <li>Status: <strong className={
                                    jobStatus === 'success' ? 'text-green-500' : 'text-destructive'
                                }>
                                    {jobStatus.toUpperCase()}
                                </strong></li>
                                <li>Final Message: <strong>{finalResults?.message || 'Check logs for details.'}</strong></li>
                                <li>Progress: <strong>{progress}%</strong></li>
                                <li>Steps Completed: <strong>{completedSteps}/{totalSteps || 'Unknown'}</strong></li>
                                
                                {finalResults?.statistics && (
                                    <>
                                        <li>Devices Succeeded: <strong className="text-green-500">{finalResults.statistics.succeeded || 0}</strong></li>
                                        <li>Devices Failed: <strong className="text-destructive">{finalResults.statistics.failed || 0}</strong></li>
                                    </>
                                )}
                            </ul>
                        </div>
                        
                        {finalResults && process.env.NODE_ENV === 'development' && (
                            <div className="bg-muted p-3 rounded-md text-sm font-mono whitespace-pre-wrap max-h-40 overflow-auto">
                                <div className="text-xs font-semibold mb-1">Debug Information:</div>
                                {JSON.stringify(finalResults, null, 2)}
                            </div>
                        )}

                        <div className="flex justify-end pt-4">
                            <Button onClick={resetWorkflow} variant="outline">
                                Start New Backup
                            </Button>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
