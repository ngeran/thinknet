/**
 * =================================================================
 * ⚙️ Device Backup Operation Component
 * =================================================================
 * Manages the full backup workflow: Configuration, Execution (via FastAPI/Redis), 
 * and Real-Time Logging (via Rust WebSocket Hub).
 * * Key Fixes & Enhancements:
 * 1. CRITICAL WS FILTER: The message filter now correctly uses the 'ws_channel:' prefix
 * expected from the Rust Hub/Redis system.
 * 2. DOUBLE PARSING: Implemented robust try/catch logic to handle both structured JSON 
 * log events and raw text (non-JSON) logs coming from the Python worker.
 * 3. CLEANUP: Ensured UNSUBSCRIBE command is sent both on job completion and component unmount/reset
 * to prevent channel leakage in the Rust Hub.
 *
 */

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

// Local Components & Hooks
import BackupForm from '../../forms/BackupForm';
import DeviceTargetSelector from '../../shared/DeviceTargetSelector';
import { useJobWebSocket } from '@/hooks/useJobWebSocket'; // Hook to access WS stream and commands

// Define the API URL for the initial trigger
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// =================================================================
// 1. COMPONENT DEFINITION AND STATE MANAGEMENT
// =================================================================

export default function Backup() {

    // --- State Initialization ---
    const [backupParams, setBackupParams] = useState({
        username: "admin",
        password: "manolis1",
        hostname: "172.27.200.200",
        inventory_file: "",
    });

    const [activeTab, setActiveTab] = useState("config");
    // status: 'idle', 'running', 'success', 'failed'
    const [jobStatus, setJobStatus] = useState("idle");
    const [progress, setProgress] = useState(0);
    const [jobOutput, setJobOutput] = useState([]); // Array to store streamed log messages
    const [jobId, setJobId] = useState(null);
    const [wsChannel, setWsChannel] = useState(null); // The base channel name from FastAPI (e.g., job:UUID)
    const [finalResults, setFinalResults] = useState(null);

    // Hook to access the WebSocket stream and send commands
    const { sendMessage, lastMessage, isConnected } = useJobWebSocket();

    const scrollAreaRef = useRef(null);

    // --- Utility Handlers ---

    const handleParamChange = (name, value) => {
        setBackupParams(prev => ({ ...prev, [name]: value }));
    };

    const isFormValid = (
        backupParams.username.trim() !== "" &&
        backupParams.password.trim() !== "" &&
        (backupParams.hostname.trim() !== "" || backupParams.inventory_file.trim() !== "")
    );

    // Resets all state for a new job and cleans up the active WS subscription
    const resetWorkflow = () => {
        // Cleanup: Send UNSUBSCRIBE for the specific channel if one is active
        if (wsChannel) {
            // Note: The channel sent in the command does *not* need the 'ws_channel:' prefix
            sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
            console.log(`Reset: Sent UNSUBSCRIBE for ${wsChannel}`);
        }
        
        setJobStatus("idle");
        setProgress(0);
        setJobOutput([]);
        setJobId(null);
        setWsChannel(null); // Clear the channel state
        setFinalResults(null);
        setActiveTab("config");
    };

// =================================================================
// 2. JOB EXECUTION: HTTP TRIGGER AND WS SUBSCRIPTION
// =================================================================

    const startJobExecution = async (e) => {
        e.preventDefault();

        if (!isFormValid || jobStatus === 'running') return;
        
        // Check connection before running.
        if (!isConnected) {
            const connectErrorMsg = "WebSocket connection is not ready. Cannot start job. Check Rust Hub status.";
            setJobOutput([{ time: new Date().toLocaleTimeString(), message: connectErrorMsg, level: 'error' }]);
            setJobStatus("failed");
            setActiveTab("results");
            return;
        }

        // 1. Cleanup old state and Transition to Execution Tab
        if (wsChannel) {
            // Unsubscribe old job if necessary, though 'resetWorkflow' should handle most cases
            sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
        }
        setActiveTab("execute");
        setJobStatus("running");
        setProgress(0);
        setJobOutput([]);
        setFinalResults(null);
        setJobId(null);
        setWsChannel(null);


        // 2. Prepare payload for FastAPI
        const payload = {
            command: "backup",
            hostname: backupParams.hostname.trim(),
            inventory_file: backupParams.inventory_file.trim(),
            username: backupParams.username,
            password: backupParams.password,
            backup_path: "/app/shared/data/backups",
        };

        try {
            // 3. Trigger job via FastAPI
            const response = await fetch(`${API_URL}/api/operations/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `API returned status ${response.status}`);
            }

            const data = await response.json();

            // 4. Set the new job ID, channel, and SUBSCRIBE
            const newJobId = data.job_id;
            const newWsChannel = data.ws_channel; // e.g., 'job:UUID' (prefix 'ws_channel:' is added on Rust side)

            setJobId(newJobId);
            setWsChannel(newWsChannel); // <--- Store the base channel name

            // CORE: Send the SUBSCRIBE command to the Rust Hub
            sendMessage({ type: 'SUBSCRIBE', channel: newWsChannel });


        } catch (error) {
            // Handle API failure (happens before WS stream starts)
            const errorMsg = `Job start failed (API Error): ${error.message}`;
            setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: errorMsg, level: 'error' }]);
            setJobStatus("failed");
            setActiveTab("results");
        }
    };

// =================================================================
// 3. SUBSCRIPTION CLEANUP EFFECT
// =================================================================

    useEffect(() => {
        // CRITICAL: Cleanup logic to UNSUBSCRIBE if the component unmounts.
        // It uses the latest 'wsChannel' and 'jobStatus' from the dependency array.
        return () => {
            if (wsChannel && jobStatus === 'running') {
                console.log(`Component Unmount/Cleanup: Sending UNSUBSCRIBE for ${wsChannel}`);
                sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsChannel, jobStatus, sendMessage]); 
    // sendMessage is stable (from useCallback), but included for completeness.


// =================================================================
// 4. REAL-TIME WS MESSAGE LISTENER (FIXED LOGIC)
// =================================================================

    useEffect(() => {
        // Only run if we have a new message, a current job ID, and a channel to filter against
        if (lastMessage && jobId && wsChannel) {
            
            // 1. Initial check: Filter out non-JSON pings or diagnostic messages from the raw stream
            if (typeof lastMessage !== 'string' || (!lastMessage.startsWith('{') && !lastMessage.startsWith('['))) {
                return;
            }

            try {
                // Parse the outer RedisMessage object { channel, data }
                const message = JSON.parse(lastMessage);

                // CRITICAL FIX 1: The Rust Hub prefix the channel with 'ws_channel:'. Filter must match this.
                if (message.channel !== `ws_channel:${wsChannel}`) { 
                    return; // Ignore messages not meant for this component's job
                }

                let update = {};

                // CRITICAL FIX 2: Handle the nested JSON string (the log payload) vs. raw text logs
                try {
                    // Attempt to parse the inner data as JSON (for logs with event_type)
                    update = JSON.parse(message.data);
                } catch (innerError) {
                    // If inner parsing fails, assume it's a raw text log (e.g., [STDERR_RAW_NON_JSON])
                    // Create a pseudo-update object for consistent logging structure
                    update = {
                        message: message.data,
                        // Heuristic to set level for raw messages
                        level: message.data.toLowerCase().includes('error') ? 'error' : 'warning',
                        event_type: 'RAW_LOG'
                    };
                }

                // 2. Update Log Output
                const logEntry = {
                    time: new Date().toLocaleTimeString(),
                    // Use the message from the parsed/pseudo-parsed 'update' object
                    message: update.message || 'Processing event (no message field)...',
                    level: update.level ? update.level.toLowerCase() : 'info'
                };
                setJobOutput(prev => [...prev, logEntry]);

                // Auto-scroll the log area
                if (scrollAreaRef.current) {
                    // Use a short delay to wait for the DOM update
                    setTimeout(() => {
                        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
                    }, 50);
                }

                // 3. Update Progress Bar (Only for structured JSON events)
                if (update.event_type === "PROGRESS_UPDATE" && typeof update.data?.progress === 'number') {
                    const newProgress = Math.min(100, Math.max(0, update.data.progress));
                    setProgress(newProgress);
                }

                // 4. Handle Completion (Only for structured JSON events)
                if (update.event_type === "OPERATION_COMPLETE") {
                    const finalStatus = update.data.status === "SUCCESS" ? "success" : "failed";
                    setJobStatus(finalStatus);
                    setFinalResults(update.data.final_results);
                    setProgress(100);

                    // CORE: Send the UNSUBSCRIBE command when job is completed
                    sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });

                    // Switch tabs after a short delay
                    setTimeout(() => {
                        setActiveTab(currentTab => {
                            if (currentTab === "execute") {
                                console.log("Job complete, switching from Execute to Results.");
                                return "results";
                            }
                            return currentTab;
                        });
                    }, 100);
                }

            } catch (e) {
                // Catches errors from the outer JSON.parse(lastMessage) or unexpected structure
                console.error("Failed to process WebSocket message:", e, lastMessage);
                setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: `WS Error: Failed to parse message`, level: 'error' }]);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastMessage, jobId, wsChannel, sendMessage]); 
    // Note: scrollAreaRef is omitted from deps as it's a ref, but is used inside the handler.

// =================================================================
// 5. RENDER METHOD
// =================================================================

    return (
        <div className="p-8 pt-6">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Device Backup Operation</h1>
            <p className="text-muted-foreground mb-6">
                A guided workflow to configure, execute, and view results for device backups.
            </p>
            <Separator className="mb-8" />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="config" disabled={jobStatus === 'running'}>Configure</TabsTrigger>
                    <TabsTrigger value="execute">Execute</TabsTrigger>
                    <TabsTrigger value="results" disabled={jobStatus === 'running' && activeTab !== 'results'}>Results</TabsTrigger>
                </TabsList>

                {/* --- CONFIGURE TAB --- */}
                <TabsContent value="config">
                    <form onSubmit={startJobExecution} className="space-y-8 max-w-4xl">
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
                                type="submit"
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
                    </form>
                </TabsContent>

                {/* --- EXECUTE TAB --- */}
                <TabsContent value="execute">
                    <div className="space-y-6 p-4 border rounded-lg max-w-4xl">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            Job Execution Status
                            {jobStatus === 'running' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                        </h2>
                        <Progress value={progress} className="w-full" />
                        <p className="text-sm text-muted-foreground">Progress: **{progress}%**</p>

                        <ScrollArea className="h-64 bg-muted/50 p-4 rounded-md font-mono text-sm border">
                            <div ref={scrollAreaRef} className="h-full">
                                {jobOutput.length === 0 && jobStatus !== 'running' ? (
                                    <p className="text-center text-muted-foreground">Start the job to see real-time updates.</p>
                                ) : (
                                    jobOutput.map((log, index) => (
                                        <p
                                            key={index}
                                            className={`text-xs ${
                                                log.level === 'error' ? 'text-destructive' :
                                                log.level === 'success' ? 'text-green-600' :
                                                log.level === 'warning' ? 'text-yellow-600' :
                                                'text-foreground/80'
                                            }`}
                                        >
                                            <span className="text-primary mr-2">[{log.time}]</span> {log.message}
                                        </p>
                                    ))
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </TabsContent>

                {/* --- RESULTS TAB --- */}
                <TabsContent value="results">
                    <div className="space-y-6 p-6 border rounded-lg max-w-4xl">
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            {jobStatus === 'success' ? (
                                <><CheckCircle className="h-6 w-6 text-green-500" /> Job Complete!</>
                            ) : jobStatus === 'failed' ? (
                                <><XCircle className="h-6 w-6 text-destructive" /> Job Failed</>
                            ) : (
                                "Awaiting Execution"
                            )}
                        </h2>

                        <Separator />

                        <div className="space-y-2">
                            <p className="font-medium">Summary:</p>
                            <ul className="list-disc list-inside text-muted-foreground ml-4">
                                <li>Target(s): **{finalResults?.targets || backupParams.hostname || backupParams.inventory_file || 'N/A'}**</li>
                                <li>Final Status: <span className={jobStatus === 'success' ? 'text-green-500 font-semibold' : 'text-destructive font-semibold'}>{jobStatus.toUpperCase()}</span></li>
                                <li>Final Message: **{finalResults?.message || 'Details not available.'}**</li>
                                {finalResults?.statistics && (
                                    <>
                                        <li>Devices Succeeded: **{finalResults.statistics.succeeded || 0}**</li>
                                        <li>Devices Failed: **{finalResults.statistics.failed || 0}**</li>
                                        <li>Total Duration: **{finalResults.statistics.duration || 'N/A'}**</li>
                                    </>
                                )}
                            </ul>
                        </div>

                        {jobStatus === 'failed' && finalResults?.traceback && (
                            <div className="bg-destructive/10 p-3 rounded-md border border-destructive/50 text-destructive text-sm font-mono whitespace-pre-wrap">
                                **Traceback:** {finalResults.traceback}
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
