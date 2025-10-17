// frontend/src/pages/Operations/Backup.jsx

/**
 * =================================================================
 * ⚙️ Device Backup Operation Component
 * =================================================================
 * Key Fixes & Enhancements:
 * 1. Cleanup Effect: Adds a dedicated useEffect to UNSUBSCRIBE when the job completes
 * or the component unmounts, preventing channel leakage in the Rust Hub.
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
import { useJobWebSocket } from '@/hooks/useJobWebSocket'; 

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
        hostname: "192.168.100.10",
        inventory_file: "",
    });

    const [activeTab, setActiveTab] = useState("config");
    // status: 'idle', 'running', 'success', 'failed'
    const [jobStatus, setJobStatus] = useState("idle");
    const [progress, setProgress] = useState(0);
    const [jobOutput, setJobOutput] = useState([]); // Array to store streamed log messages
    const [jobId, setJobId] = useState(null);
    const [wsChannel, setWsChannel] = useState(null);
    const [finalResults, setFinalResults] = useState(null);

    // 🔑 Hook to access the WebSocket stream and send commands
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

    // Resets all state for a new job
    const resetWorkflow = () => {
        // 🔑 FIX: When resetting, ensure any active subscription is cleaned up
        if (wsChannel) {
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
        
        // 🔑 ENHANCEMENT: Check connection before running. 
        if (!isConnected) {
             const connectErrorMsg = "WebSocket connection is not ready. Cannot start job.";
             setJobOutput([{ time: new Date().toLocaleTimeString(), message: connectErrorMsg, level: 'error' }]);
             setJobStatus("failed");
             setActiveTab("results");
             return;
        }

        // 1. Cleanup old state and Transition to Execution Tab
        // This ensures a clean slate before the new job ID is received
        if (wsChannel) {
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
            backup_path: "/var/backups",
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
            const newWsChannel = data.ws_channel;

            setJobId(newJobId);
            setWsChannel(newWsChannel); // <--- This is the channel we will subscribe/unsubscribe to

            // 🔑 CORE: Send the SUBSCRIBE command to the Rust Hub
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
        // 🔑 CRITICAL FIX: Add cleanup logic to UNSUBSCRIBE if the component unmounts
        // or if a new job is initiated, but only if a channel is active and the job is running.
        return () => {
            // Use local wsChannel variable in the dependency array (or the jobStatus)
            if (wsChannel && jobStatus === 'running') {
                console.log(`Component Unmount/Cleanup: Sending UNSUBSCRIBE for ${wsChannel}`);
                sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wsChannel, jobStatus]); 


// =================================================================
// 4. REAL-TIME WS MESSAGE LISTENER
// =================================================================

    useEffect(() => {
        // Only run if we have a new message and a current job ID to filter against
        if (lastMessage && jobId && wsChannel) {
            
            // 🔑 FIX: Robustly filter out non-JSON server diagnostic messages.
            if (typeof lastMessage !== 'string' || (!lastMessage.startsWith('{') && !lastMessage.startsWith('['))) {
                if (lastMessage.includes('Client') && lastMessage.includes('says')) {
                    console.warn("WS Listener: Ignoring server diagnostic message.", lastMessage);
                } else {
                    console.error("WS Listener: Received unparsable, non-JSON message:", lastMessage);
                }
                return;
            }

            try {
                const message = JSON.parse(lastMessage);

                // 🔑 FILTER: Ignore messages not belonging to this job's channel
                if (message.channel !== wsChannel) return;

                // Parse the nested data string (the actual payload from Python/Redis)
                const update = JSON.parse(message.data);

                // 1. Update Log Output
                const logEntry = {
                    time: new Date().toLocaleTimeString(),
                    message: update.message || 'Processing event...',
                    level: update.level ? update.level.toLowerCase() : 'info'
                };
                setJobOutput(prev => [...prev, logEntry]);

                // Auto-scroll the log area
                if (scrollAreaRef.current) {
                    setTimeout(() => {
                        scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
                    }, 50);
                }

                // 2. Update Progress Bar
                if (update.event_type === "PROGRESS_UPDATE" && typeof update.data.progress === 'number') {
                    const newProgress = Math.min(100, Math.max(0, update.data.progress));
                    setProgress(newProgress);
                }

                // 3. Handle Completion
                if (update.event_type === "OPERATION_COMPLETE") {
                    const finalStatus = update.data.status === "SUCCESS" ? "success" : "failed";
                    setJobStatus(finalStatus);
                    setFinalResults(update.data.final_results);
                    setProgress(100);

                    // 🔑 CORE: Send the UNSUBSCRIBE command when job is completed
                    sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });

                    // 🚀 RACE CONDITION GUARD: Switch tabs after a short delay
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
                console.error("Failed to process WebSocket message:", e, lastMessage);
                setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: `WS Error: Failed to parse message`, level: 'error' }]);
            }
        }
    }, [lastMessage, jobId, wsChannel, sendMessage]); 

// =================================================================
// 5. RENDER METHOD
// =================================================================

    return (
        <div className="p-8 pt-6">
            {/* ... JSX remains the same ... */}
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
