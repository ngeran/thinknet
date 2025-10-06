import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';

// Shadcn UI Tabs and Progress Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

// Local Components
// 🛑 IMPORTANT: This is the new component for the dependent dropdowns
import RestoreDeviceConfig from './components/RestoreDeviceConfig';
import DeviceAuthFields from '../../shared/DeviceAuthFields'; // Re-use the shared Auth component
// The dynamic sidebar component
import SidebarLoader from '../../components/blocks/SidebarLoader';

/**
 * Main component for the Restore page, integrating a guided workflow 
 * using three tabs (Configure, Execute, Results) and a dynamic sidebar.
 */
export default function RestorePage() {

  // State to hold all form parameters. NOTE: This state will be managed by RestoreDeviceConfig
  // and passed up when ready for execution. For simplicity here, we track the final selected values.
  const [restoreParams, setRestoreParams] = useState({
    username: "", // For DeviceAuthFields
    password: "", // For DeviceAuthFields
    device_name: "", // Selected from dependent dropdown 1
    backup_id: "",   // Selected from dependent dropdown 2
  });

  // State to manage the active tab: 'config', 'execute', 'results'
  const [activeTab, setActiveTab] = useState("config");

  // State for the execution phase (Copied from BackupPage)
  const [jobStatus, setJobStatus] = useState("idle"); // 'idle', 'running', 'success', 'failed'
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);

  // Unified handler to update any parameter from any sub-component
  const handleParamChange = (name, value) => {
    setRestoreParams(prev => ({ ...prev, [name]: value }));
  };

  // Determine if the form is valid (requires credentials AND both selections)
  const isFormValid = (
    restoreParams.username.trim() !== "" &&
    restoreParams.password.trim() !== "" &&
    restoreParams.device_name.trim() !== "" &&
    restoreParams.backup_id.trim() !== ""
  );

  // --- EXECUTION LOGIC (Mocked, copied from BackupPage) ---
  const startJobExecution = async (e) => {
    e.preventDefault();

    if (!isFormValid || jobStatus === 'running') return;

    // 1. Transition to the Execute tab
    setActiveTab("execute");
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);

    // --- Mock Execution Logic (REPLACE THIS SECTION with API call to FastAPI) ---
    console.log("Starting Restore Job with parameters:", restoreParams);

    // Simulate progress updates
    for (let p = 0; p <= 100; p += 10) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setProgress(p);
      if (p === 30) setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: `Connecting to ${restoreParams.device_name}...` }]);
      if (p === 60) setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: `Starting restore from backup ${restoreParams.backup_id}...` }]);
      if (p === 90) setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: "Verifying device state..." }]);
    }

    // Final state transition
    await new Promise(resolve => setTimeout(resolve, 1000));
    const finalStatus = Math.random() > 0.8 ? "failed" : "success"; // Add a small chance of failure
    setJobStatus(finalStatus);

    const finalMessage = finalStatus === "success" ? "Restore job completed successfully." : "Restore job failed during configuration transfer.";
    setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: finalMessage }]);

    setActiveTab("results");
    // --- End Mock Execution Logic ---
  };

  // Reset function
  const resetWorkflow = () => {
    setRestoreParams({ username: "", password: "", device_name: "", backup_id: "" });
    setJobStatus("idle");
    setProgress(0);
    setJobOutput([]);
    setActiveTab("config");
  };

  return (
    <div className="flex min-h-screen bg-background">

      {/* 1. Dynamic Sidebar (Must match the existing pattern) */}
      <SidebarLoader
        title="Automation Scripts"
        activePath="/operations/restore" // 🛑 UPDATED PATH
      />

      {/* 2. Main Content Area (Copied from BackupPage) */}
      <main className="flex-1 p-8 pt-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Device Restore Operation</h1>
        <p className="text-muted-foreground mb-6">
          A guided workflow to select a device and backup, execute the restore, and view results.
        </p>
        <Separator className="mb-8" />

        {/* --- TABS IMPLEMENTATION (Copied from BackupPage) --- */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="config" disabled={jobStatus === 'running'}>Configure</TabsTrigger>
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="results" disabled={jobStatus === 'running'}>Results</TabsTrigger>
          </TabsList>

          {/* --- 1. CONFIGURE TAB --- */}
          <TabsContent value="config">
            <form onSubmit={startJobExecution} className="space-y-8 max-w-4xl">
              {/* 🛑 INTEGRATE NEW DROPDOWN COMPONENT */}
              <RestoreDeviceConfig
                parameters={restoreParams}
                onParamChange={handleParamChange}
              />

              {/* 🛑 USE EXISTING AUTH FIELDS COMPONENT */}
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

          {/* --- 2. EXECUTE TAB (Copied from BackupPage) --- */}
          <TabsContent value="execute">
            <div className="space-y-6 p-4 border rounded-lg max-w-4xl">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Job Execution Status
                {jobStatus === 'running' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              </h2>
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground">Progress: {progress}%</p>

              <div className="h-64 overflow-y-auto bg-muted/50 p-4 rounded-md font-mono text-sm border">
                {jobOutput.length === 0 ? (
                  <p className="text-center text-muted-foreground">Awaiting job start...</p>
                ) : (
                  jobOutput.map((log, index) => (
                    <p key={index} className="text-xs text-foreground/80">
                      <span className="text-primary mr-2">[{log.time}]</span> {log.message}
                    </p>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          {/* --- 3. RESULTS TAB (Copied from BackupPage) --- */}
          <TabsContent value="results">
            <div className="space-y-6 p-6 border rounded-lg max-w-4xl">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                {jobStatus === 'success' ? (
                  <><CheckCircle className="h-6 w-6 text-green-500" /> Restore Complete!</>
                ) : jobStatus === 'failed' ? (
                  <><XCircle className="h-6 w-6 text-destructive" /> Restore Failed</>
                ) : (
                  "Awaiting Execution"
                )}
              </h2>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Summary:</p>
                <ul className="list-disc list-inside text-muted-foreground ml-4">
                  <li>Device: {restoreParams.device_name || 'N/A'}</li>
                  <li>Backup ID: {restoreParams.backup_id || 'N/A'}</li>
                  <li>Credentials: {restoreParams.username ? 'Provided' : 'Missing'}</li>
                  <li>Final Status: <span className={jobStatus === 'success' ? 'text-green-500 font-semibold' : 'text-destructive font-semibold'}>{jobStatus.toUpperCase()}</span></li>
                </ul>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={resetWorkflow} variant="outline">
                  Start New Restore
                </Button>
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
