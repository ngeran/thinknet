// frontend/src/pages/Operations/RestorePage.jsx (MOCK LOGIC WITH ENHANCED UI)

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';

// Shadcn UI Tabs and ScrollArea (replacing simple overflow div)
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

// PROGRESS COMPONENTS IMPORTS (Using the shared enhanced components)
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar'; 
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';

// Local Components
import RestoreDeviceConfig from './components/RestoreDeviceConfig';
import DeviceAuthFields from '../../shared/DeviceAuthFields';

/**
 * =============================================================================
 * RESTORE OPERATION COMPONENT (MOCK LOGIC)
 * =============================================================================
 * Main component for managing device restore operations with enhanced real-time 
 * progress display, structured identically to Backup.jsx for consistency.
 *
 * @version 1.1.0
 * @last_updated 2025-10-18
 * =============================================================================
 */
export default function RestorePage() {
    
    // =========================================================================
    // 🧠 STATE MANAGEMENT SECTION
    // =========================================================================

    // Restore configuration parameters
    const [restoreParams, setRestoreParams] = useState({
        username: "admin", // Initial values for convenience
        password: "manolis1",
        device_name: "172.27.200.200",
        backup_id: "20250915_config_1",
    });

    // UI State
    const [activeTab, setActiveTab] = useState("config");
    const [jobStatus, setJobStatus] = useState("idle"); 
    
    // Progress Tracking State
    const [progress, setProgress] = useState(0);
    const [jobOutput, setJobOutput] = useState([]); // Now stores structured log objects
    const [finalResults, setFinalResults] = useState(null); // For final job summary

    // Step Tracking State (Mocking the real operation structure)
    const [completedSteps, setCompletedSteps] = useState(0);
    const [totalSteps, setTotalSteps] = useState(4); // Fixed steps for mock: connect, restore, verify, complete
    
    // Real-time Statistics Tracking (Simplified for mock)
    const [statistics, setStatistics] = useState({
        total: 0,
        succeeded: 0,
        failed: 0
    });

    // Refs for real-time log display
    const scrollAreaRef = useRef(null); 
    const latestStepMessageRef = useRef("Awaiting configuration..."); 

    // =========================================================================
    // 🧩 FORM AND HANDLERS
    // =========================================================================

    // Unified handler to update any parameter from any sub-component
    const handleParamChange = (name, value) => {
        setRestoreParams(prev => ({ ...prev, [name]: value }));
    };

    // Determine if the form is valid
    const isFormValid = (
        restoreParams.username.trim() !== "" &&
        restoreParams.password.trim() !== "" &&
        restoreParams.device_name.trim() !== "" &&
        restoreParams.backup_id.trim() !== ""
    );

    // =========================================================================
    // 🔄 WORKFLOW RESET FUNCTION
    // =========================================================================
    
    const resetWorkflow = () => {
        setRestoreParams({ username: "", password: "", device_name: "", backup_id: "" });
        setJobStatus("idle");
        setProgress(0);
        setJobOutput([]);
        setFinalResults(null);
        setActiveTab("config");
        setCompletedSteps(0);
        setTotalSteps(4); // Reset to default mock total steps
        setStatistics({ total: 0, succeeded: 0, failed: 0 });
        latestStepMessageRef.current = "Awaiting configuration...";
        console.log("[WORKFLOW] Workflow reset to initial state");
    };

    // =========================================================================
    // 🚀 JOB EXECUTION (MOCKED)
    // =========================================================================
    
    /**
     * Helper to simulate a step completion and update state
     */
    const mockStep = async (step, message, level = 'info') => {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Use structured log format matching Backup.jsx
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: message,
            level: level,
            event_type: "STEP_COMPLETE", 
            data: { step: step },
        };

        setJobOutput(prev => [...prev, logEntry]);
        latestStepMessageRef.current = message;
        setCompletedSteps(step);
        setProgress(Math.round((step / totalSteps) * 100));

        if (scrollAreaRef.current) {
            // Auto-scroll to latest log entry
            setTimeout(() => {
                scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
            }, 50);
        }
    }

    const startJobExecution = async (e) => {
        e.preventDefault();

        if (!isFormValid || jobStatus === 'running') return;

        console.log("Starting Restore Job with parameters:", restoreParams);
        
        // Reset and start UI transition
        setActiveTab("execute");
        setJobStatus("running");
        setProgress(5); // Start at 5%
        setJobOutput([]);
        setCompletedSteps(0);
        setStatistics({ total: 0, succeeded: 0, failed: 0 });


        // Mock Steps
        await mockStep(1, `Connecting to device: ${restoreParams.device_name}...`);
        await mockStep(2, `Starting configuration restore from ${restoreParams.backup_id}...`);
        
        // Simulate a random success/failure
        const finalStatus = Math.random() > 0.3 ? "success" : "failed";
        
        const finalMessage = finalStatus === "success" 
            ? "Restore job completed successfully and configuration is verified." 
            : "Restore job failed during configuration push. Device may require manual intervention.";

        if (finalStatus === "success") {
            await mockStep(3, "Verifying device state and commit...");
            await mockStep(4, finalMessage, 'success');
            
            setStatistics({ total: 1, succeeded: 1, failed: 0 });
            setFinalResults({
                message: finalMessage,
                status: "SUCCESS",
                device: restoreParams.device_name,
                backup_id: restoreParams.backup_id,
                statistics: { succeeded: 1, failed: 0 },
                data: {
                    device_results: [{
                        hostname: restoreParams.device_name,
                        success: true,
                        message: "Restore successful.",
                        duration: 7.5
                    }]
                }
            });
            
        } else {
            await mockStep(3, finalMessage, 'error');
            await mockStep(4, "Finalizing failed job.", 'error');

            setStatistics({ total: 1, succeeded: 0, failed: 1 });
            setFinalResults({
                message: finalMessage,
                status: "FAILED",
                device: restoreParams.device_name,
                backup_id: restoreParams.backup_id,
                error_details: "Network timeout or config validation failure.",
                statistics: { succeeded: 0, failed: 1 },
                data: {
                    device_results: [{
                        hostname: restoreParams.device_name,
                        success: false,
                        message: "Configuration push failed (timeout).",
                        duration: 9.1
                    }]
                }
            });
        }
        
        // Final state transition
        setJobStatus(finalStatus);
        setProgress(100); 
        setCompletedSteps(totalSteps); // Ensure progress bar is full

        requestAnimationFrame(() => {
            setActiveTab("results");
        });
    };
    
    // =========================================================================
    // 🧱 UI RENDER SECTION
    // =========================================================================
    
    // Derived state for progress components
    const isRunning = jobStatus === 'running';
    const isComplete = jobStatus === 'success';
    const hasError = jobStatus === 'failed';

    return (
        <div className="p-8 pt-6">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Device Restore Operation</h1>
            <p className="text-muted-foreground mb-6">
                A guided workflow to select a device and backup, execute the restore, and view results.
            </p>
            <Separator className="mb-8" />

            {/* --- TABS IMPLEMENTATION --- */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

                <TabsList className="grid w-full grid-cols-3 mb-6">
                    <TabsTrigger value="config" disabled={jobStatus === 'running'}>Configure</TabsTrigger>
                    <TabsTrigger value="execute">Execute</TabsTrigger>
                    <TabsTrigger value="results" disabled={jobStatus === 'running'}>Results</TabsTrigger>
                </TabsList>

                {/* 1. CONFIGURE TAB */}
                <TabsContent value="config">
                    <form onSubmit={startJobExecution} className="space-y-8 max-w-4xl">
                        <RestoreDeviceConfig
                            parameters={restoreParams}
                            onParamChange={handleParamChange}
                        />

                        <DeviceAuthFields
                            parameters={restoreParams}
                            onParamChange={handleParamChange}
                        />

                        <div className="flex justify-end pt-4">
                            <Button
                                type="submit"
                                disabled={!isFormValid || jobStatus !== 'idle'}
                                className="w-full sm:w-auto"
                            >
                                Start Restore Job <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </div>
                    </form>
                </TabsContent>

                {/* 2. EXECUTE TAB (Enhanced with EnhancedProgressBar and ScrollArea) */}
                <TabsContent value="execute">
                    <div className="space-y-6 p-4 border rounded-lg max-w-4xl">
                        <h2 className="text-xl font-semibold mb-4">Job Execution Status</h2>
                        
                        {/* Enhanced Progress Bar */}
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

                        {/* Real-time Log Display with ScrollArea */}
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

                {/* 3. RESULTS TAB (Structured like Backup.jsx Results) */}
                <TabsContent value="results">
                    <div className="space-y-6 max-w-6xl">
                        {/* Header Status Card */}
                        <div className={`p-6 rounded-lg border-2 ${
                            jobStatus === 'success' ? 'bg-green-50 border-green-200' : 
                            jobStatus === 'failed' ? 'bg-red-50 border-red-200' : 
                            'bg-muted border-border'
                        }`}>
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    {jobStatus === 'success' ? (
                                        <CheckCircle className="h-8 w-8 text-green-600" />
                                    ) : jobStatus === 'failed' ? (
                                        <XCircle className="h-8 w-8 text-red-600" />
                                    ) : (
                                        <Loader2 className="h-8 w-8 text-muted-foreground" />
                                    )}
                                    <div>
                                        <h2 className="text-2xl font-bold">
                                            {jobStatus === 'success' ? 'Restore Completed Successfully' : 
                                             jobStatus === 'failed' ? 'Restore Failed' : 
                                             'Awaiting Execution'}
                                        </h2>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {finalResults?.message || 'No results available yet'}
                                        </p>
                                    </div>
                                </div>
                                <Button onClick={resetWorkflow} variant="outline" size="sm">
                                    Start New Restore
                                </Button>
                            </div>
                        </div>

                        {/* Statistics Grid */}
                        {(statistics.total > 0 || jobStatus !== 'idle') && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="p-4 border rounded-lg bg-card">
                                    <div className="text-sm font-medium text-muted-foreground">Total Devices</div>
                                    <div className="text-3xl font-bold mt-2">
                                        {statistics.total}
                                    </div>
                                </div>
                                <div className="p-4 border rounded-lg bg-card">
                                    <div className="text-sm font-medium text-muted-foreground">Succeeded</div>
                                    <div className="text-3xl font-bold mt-2 text-green-600">
                                        {statistics.succeeded}
                                    </div>
                                </div>
                                <div className="p-4 border rounded-lg bg-card">
                                    <div className="text-sm font-medium text-muted-foreground">Failed</div>
                                    <div className="text-3xl font-bold mt-2 text-red-600">
                                        {statistics.failed}
                                    </div>
                                </div>
                                <div className="p-4 border rounded-lg bg-card">
                                    <div className="text-sm font-medium text-muted-foreground">Success Rate</div>
                                    <div className="text-3xl font-bold mt-2">
                                        {statistics.total > 0 ? `${Math.round((statistics.succeeded / statistics.total) * 100)}%` : '—'}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Device Results Table */}
                        {finalResults?.data?.device_results && finalResults.data.device_results.length > 0 && (
                            <div className="border rounded-lg bg-card">
                                <div className="p-4 border-b">
                                    <h3 className="text-lg font-semibold">Device Restore Results</h3>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        Detailed status for the target device
                                    </p>
                                </div>
                                <ScrollArea className="h-96">
                                    <div className="p-4">
                                        <table className="w-full">
                                            <thead className="border-b">
                                                <tr className="text-left">
                                                    <th className="pb-3 font-semibold text-sm">Status</th>
                                                    <th className="pb-3 font-semibold text-sm">Device</th>
                                                    <th className="pb-3 font-semibold text-sm">Message</th>
                                                    <th className="pb-3 font-semibold text-sm">Duration</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {finalResults.data.device_results.map((device, index) => (
                                                    <tr key={index} className="border-b last:border-0 hover:bg-muted/50">
                                                        <td className="py-3">
                                                            {device.success ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                                                    <CheckCircle className="h-3 w-3" />
                                                                    Success
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                                                                    <XCircle className="h-3 w-3" />
                                                                    Failed
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 font-medium">{device.hostname || device.device || 'Unknown'}</td>
                                                        <td className="py-3 text-sm text-muted-foreground max-w-md truncate">
                                                            {device.message || device.error || 'No message'}
                                                        </td>
                                                        <td className="py-3 text-sm text-muted-foreground">
                                                            {device.duration ? `${device.duration.toFixed(2)}s` : '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </ScrollArea>
                            </div>
                        )}

                        {/* Execution Metadata */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 border rounded-lg bg-card">
                                <h3 className="text-sm font-semibold mb-3">Restore Details</h3>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Target Device:</dt>
                                        <dd className="font-medium truncate ml-2">{restoreParams.device_name || 'N/A'}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Backup ID:</dt>
                                        <dd className="font-medium">{restoreParams.backup_id || 'N/A'}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Progress:</dt>
                                        <dd className="font-semibold">{progress}%</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Steps:</dt>
                                        <dd className="font-semibold">{completedSteps}/{totalSteps || 'Unknown'}</dd>
                                    </div>
                                </dl>
                            </div>

                            <div className="p-4 border rounded-lg bg-card">
                                <h3 className="text-sm font-semibold mb-3">Configuration</h3>
                                <dl className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Username:</dt>
                                        <dd className="font-medium">{restoreParams.username}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Status:</dt>
                                        <dd className={`font-semibold ${jobStatus === 'success' ? 'text-green-500' : jobStatus === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>
                                            {jobStatus.toUpperCase()}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Source Path:</dt>
                                        <dd className="font-mono text-xs">/app/shared/data/backups</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>

                        {/* Debug Information (Development Only) */}
                        {finalResults && (
                            <details className="border rounded-lg bg-card">
                                <summary className="p-4 cursor-pointer font-semibold text-sm hover:bg-muted/50">
                                    Debug Information (Final Job Result)
                                </summary>
                                <div className="p-4 border-t bg-muted/30">
                                    <pre className="text-xs font-mono whitespace-pre-wrap overflow-auto max-h-96">
                                        {JSON.stringify(finalResults, null, 2)}
                                    </pre>
                                </div>
                            </details>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
