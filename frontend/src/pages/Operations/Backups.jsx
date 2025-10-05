import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Loader2, CheckCircle, XCircle } from 'lucide-react';

// Shadcn UI Tabs and Progress Components
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';

// Local Components
import BackupForm from '../../forms/BackupForm';
import DeviceTargetSelector from '../../shared/DeviceTargetSelector';
// The new component responsible for fetching sidebar data dynamically
import SidebarLoader from '../../components/blocks/SidebarLoader';

/**
 * Main component for the Backup page, integrating a guided workflow 
 * using three tabs (Configure, Execute, Results) and a dynamic sidebar.
 */
export default function BackupPage() {

  // State to hold all form parameters (Configuration)
  const [backupParams, setBackupParams] = useState({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
  });

  // State to manage the active tab: 'config', 'execute', 'results'
  const [activeTab, setActiveTab] = useState("config");

  // State for the execution phase
  const [jobStatus, setJobStatus] = useState("idle"); // 'idle', 'running', 'success', 'failed'
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);


  // Unified handler to update any parameter from any sub-component
  const handleParamChange = (name, value) => {
    setBackupParams(prev => ({ ...prev, [name]: value }));
  };

  // Determine if the form is valid (requires credentials AND a target)
  const isFormValid = (
    backupParams.username.trim() !== "" &&
    backupParams.password.trim() !== "" &&
    (backupParams.hostname.trim() !== "" || backupParams.inventory_file.trim() !== "")
  );

  // --- EXECUTION LOGIC ---
  const startJobExecution = async (e) => {
    e.preventDefault();

    if (!isFormValid || jobStatus === 'running') return;

    // 1. Transition to the Execute tab
    setActiveTab("execute");
    setJobStatus("running");
    setProgress(0);
    setJobOutput([]);

    // --- Mock Execution Logic (REPLACE THIS SECTION with API call to FastAPI) ---
    console.log("Starting Backup Job with parameters:", backupParams);

    // Simulate progress updates
    for (let p = 0; p <= 100; p += 10) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setProgress(p);
      if (p === 30) setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: "Connecting to devices..." }]);
      if (p === 60) setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: "Starting configuration capture..." }]);
      if (p === 90) setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: "Transferring files to server..." }]);
    }

    // Final state transition
    await new Promise(resolve => setTimeout(resolve, 1000));
    const finalStatus = Math.random() > 0.8 ? "failed" : "success"; // Add a small chance of failure
    setJobStatus(finalStatus);

    const finalMessage = finalStatus === "success" ? "Job completed successfully." : "Job failed during configuration capture.";
    setJobOutput(prev => [...prev, { time: new Date().toLocaleTimeString(), message: finalMessage }]);

    setActiveTab("results");
    // --- End Mock Execution Logic ---
  };

  // Reset function
  const resetWorkflow = () => {
    setBackupParams({ username: "", password: "", hostname: "", inventory_file: "" });
    setJobStatus("idle");
    setProgress(0);
    setJobOutput([]);
    setActiveTab("config");
  };

  return (
    <div className="flex min-h-screen bg-background">

      {/* 1. Dynamic Sidebar (Replaced CollapsibleSidebar with SidebarLoader) */}
      <SidebarLoader
        title="Automation Scripts"
        activePath="/operations/backups" // The route for the current page
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 p-8 pt-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Device Backup Operation</h1>
        <p className="text-muted-foreground mb-6">
          A guided workflow to configure, execute, and view results for device backups.
        </p>
        <Separator className="mb-8" />

        {/* --- TABS IMPLEMENTATION --- */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

          {/* Tabs List (Disabled while running) */}
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="config" disabled={jobStatus === 'running'}>Configure</TabsTrigger>
            <TabsTrigger value="execute">Execute</TabsTrigger>
            <TabsTrigger value="results" disabled={jobStatus === 'running'}>Results</TabsTrigger>
          </TabsList>

          {/* --- 1. CONFIGURE TAB --- */}
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
                  disabled={!isFormValid || jobStatus !== 'idle'}
                  className="w-full sm:w-auto"
                >
                  Start Backup Job <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </TabsContent>

          {/* --- 2. EXECUTE TAB --- */}
          <TabsContent value="execute">
            <div className="space-y-6 p-4 border rounded-lg max-w-4xl">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Job Execution Status
                {jobStatus === 'running' && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              </h2>
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground">Progress: {progress}%</p>

              {/* Real-time Log Output */}
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

          {/* --- 3. RESULTS TAB --- */}
          <TabsContent value="results">
            <div className="space-y-6 p-6 border rounded-lg max-w-4xl">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                {jobStatus === 'success' ? (
                  <>
                    <CheckCircle className="h-6 w-6 text-green-500" /> Job Complete!
                  </>
                ) : jobStatus === 'failed' ? (
                  <>
                    <XCircle className="h-6 w-6 text-destructive" /> Job Failed
                  </>
                ) : (
                  "Awaiting Execution"
                )}
              </h2>

              <Separator />

              <div className="space-y-2">
                <p className="font-medium">Summary:</p>
                <ul className="list-disc list-inside text-muted-foreground ml-4">
                  <li>Target(s): {backupParams.hostname || backupParams.inventory_file || 'N/A'}</li>
                  <li>Credentials: {backupParams.username ? 'Provided' : 'Missing'}</li>
                  <li>Final Status: <span className={jobStatus === 'success' ? 'text-green-500 font-semibold' : 'text-destructive font-semibold'}>{jobStatus.toUpperCase()}</span></li>
                </ul>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={resetWorkflow} variant="outline">
                  Start New Backup
                </Button>
              </div>
            </div>
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
}
