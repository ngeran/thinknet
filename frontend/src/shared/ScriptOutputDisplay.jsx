// =========================================================================================
//
// COMPONENT:          ScriptOutputDisplay.jsx
// FILE:               /src/shared/ScriptOutputDisplay.jsx
//
// OVERVIEW:
//   A universal, shared component responsible for rendering the entire output section for
//   any script execution. Adapted for the new UI component library.
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS & CONFIGURATION
// ====================================================================================
import React, { useState, useMemo } from "react";
import { ChevronDown, AlertTriangle, Info, Save, CheckCircle, XCircle, Loader, Bug } from "lucide-react";

// Import new UI components
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || "http://localhost:8000";

// ====================================================================================
// SECTION 2: UTILITY & DEBUG SUB-COMPONENTS
// ====================================================================================

const StatusIcon = ({ status }) => {
  switch (status) {
    case "COMPLETED":
    case "SUCCESS":
      return <CheckCircle className="text-green-600 h-5 w-5" />;
    case "FAILED":
    case "ERROR":
      return <XCircle className="text-red-600 h-5 w-5" />;
    case "IN_PROGRESS":
      return <Loader className="animate-spin text-blue-600 h-5 w-5" />;
    default:
      return <ChevronDown className="text-muted-foreground h-5 w-5" />;
  }
};

function DebugProgressEvents({ progressEvents, isVisible }) {
  if (!isVisible || !progressEvents || progressEvents.length === 0) {
    return null;
  }
  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2 text-yellow-800">
          <Bug size={16} /> Debug: Progress Events ({progressEvents.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-48">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {JSON.stringify(progressEvents, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ====================================================================================
// SECTION 3: DATA DISPLAY SUB-COMPONENTS
// ====================================================================================

function SimpleTable({ title, headers, data }) {
  if (!data || data.length === 0) {
    return (
      <div className="mt-2">
        <h4 className="font-semibold">{title}</h4>
        <p className="text-sm text-muted-foreground italic">No data returned for this check.</p>
      </div>
    );
  }

  return (
    <div className="mt-4 w-full">
      <h4 className="font-semibold mb-2">{title}</h4>
      <Card>
        <ScrollArea className="h-[300px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                {headers.map((header) => (
                  <th key={header} className="text-left p-3 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b hover:bg-muted/50">
                  {headers.map((header) => (
                    <td key={header} className="p-3 font-mono text-xs">
                      <div className="whitespace-pre-wrap break-all">
                        {String(row[header] || "")}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </Card>
    </div>
  );
}

function FinalResultView({ finalResult }) {
  const data = finalResult?.data ? finalResult.data : finalResult;
  console.log("[DEBUG] Final Result View received:", data);

  if (!data) return null;

  // Handle multi-host results format
  if (data.results_by_host && Array.isArray(data.results_by_host)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Final Results (Multi-Host)
            <Badge variant="outline">{data.results_by_host.length} hosts</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {data.results_by_host.map((hostResult, index) => (
            <Card key={index} className="bg-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <StatusIcon status={hostResult.status === "error" ? "ERROR" : "SUCCESS"} />
                  Results for: <span className="font-mono text-sm">{hostResult.hostname}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {hostResult.status === "error" ? (
                  <div className="bg-destructive/10 text-destructive p-3 rounded-md">
                    <p className="text-sm whitespace-pre-wrap">{hostResult.message}</p>
                  </div>
                ) : (
                  hostResult.test_results?.map((testResult, testIndex) => (
                    <div key={testIndex} className="mt-4 first:mt-0">
                      {testResult.error ? (
                        <div className="bg-yellow-50 text-yellow-800 p-3 rounded-md">
                          <p className="text-sm whitespace-pre-wrap">{testResult.error}</p>
                        </div>
                      ) : (
                        <SimpleTable
                          title={testResult.title}
                          headers={testResult.headers}
                          data={testResult.data}
                        />
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Handle simple message format
  if (data.message && typeof data.message === 'string') {
    const isSuccess = data.success !== false;
    return (
      <Card className={isSuccess ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isSuccess ? <Info className="text-green-600" /> : <AlertTriangle className="text-red-600" />}
            Final Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{data.message}</p>
        </CardContent>
      </Card>
    );
  }

  // Fallback for any other format
  return (
    <Card>
      <CardHeader>
        <CardTitle>Final Results (Raw Data)</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-muted p-4 rounded-md">
            {JSON.stringify(data, null, 2)}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ====================================================================================
// SECTION 4: REAL-TIME PROGRESS VIEW
// ====================================================================================

function RealtimeProgressView({ progressEvents = [], isRunning, isComplete, error }) {
  const derivedState = useMemo(() => {
    if (!Array.isArray(progressEvents) || progressEvents.length === 0) {
      return { totalSteps: 0, completedSteps: 0, currentMessage: 'Waiting to start...' };
    }

    const operationStart = progressEvents.find(e => e.event_type === 'OPERATION_START');
    const totalSteps = operationStart?.data?.total_steps || 0;
    const completedSteps = progressEvents.filter(e => e.event_type === 'STEP_COMPLETE').length;

    let currentMessage = 'Executing...';
    const lastMessageEvent = [...progressEvents].reverse().find(e => e.message);
    if (lastMessageEvent) {
      currentMessage = lastMessageEvent.message;
    }

    if (isRunning && progressEvents.length === 1 && progressEvents[0].type === 'script_start') {
      currentMessage = 'Initializing script run...';
    }
    if (isComplete) {
      currentMessage = error ? 'Operation failed. Please review logs.' : 'Operation completed successfully.';
    }

    return { totalSteps, completedSteps, currentMessage };
  }, [progressEvents, isRunning, isComplete, error]);

  const progressPercentage = derivedState.totalSteps > 0
    ? Math.min(100, (derivedState.completedSteps / derivedState.totalSteps) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isRunning ? <Loader className="animate-spin text-blue-600" /> : error ? <XCircle className="text-red-600" /> : <CheckCircle className="text-green-600" />}
          Execution Progress
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live Log Display */}
        <div className="bg-muted p-3 rounded-md border">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Live Log</p>
          <p className="text-sm font-mono mt-1 whitespace-pre-wrap break-all min-h-6">
            {derivedState.currentMessage}
          </p>
        </div>

        {/* Progress Bar */}
        {derivedState.totalSteps > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Step {derivedState.completedSteps} of {derivedState.totalSteps}</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ====================================================================================
// SECTION 5: MAIN COMPONENT - SCRIPT OUTPUT DISPLAY
// ====================================================================================

export default function ScriptOutputDisplay({
  script,
  isRunning,
  isComplete,
  progressEvents,
  finalResult,
  error,
  showDebug = false
}) {
  const [isSaving, setIsSaving] = useState(false);
  const saveButtonConfig = script?.capabilities?.saveButton;
  const canSaveReport = script?.capabilities?.enableReportSaving === true;

  const formatErrorMessage = (err) => {
    if (typeof err === 'object' && err !== null && err.message) {
      return String(err.message);
    }
    if (typeof err === 'object' && err !== null) {
      return JSON.stringify(err);
    }
    return err ? String(err) : "An unknown error occurred.";
  };

  const handleSaveReport = async () => {
    if (!finalResult) {
      alert("Cannot generate report: No final data available.");
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/report/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savePath: saveButtonConfig?.savePath || `/reports/${script.id}_${Date.now()}.json`,
          jsonData: finalResult,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to generate report on the server.");
      }
      alert(data.message || "Report saved successfully!");
    } catch (err) {
      alert(err.message || "An unknown error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- RUNNING STATE ---
  if (isRunning) {
    return (
      <div className="space-y-6 w-full">
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />
        <RealtimeProgressView
          progressEvents={progressEvents}
          isRunning={isRunning}
          isComplete={isComplete}
          error={error}
        />
      </div>
    );
  }

  // --- COMPLETED STATE ---
  if (isComplete) {
    // Handle script failure
    if (error) {
      return (
        <div className="space-y-6 w-full">
          <Card className="border-destructive bg-destructive/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Script Execution Failed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-mono whitespace-pre-wrap break-all">
                {formatErrorMessage(error)}
              </p>
            </CardContent>
          </Card>
          <RealtimeProgressView
            progressEvents={progressEvents}
            isRunning={false}
            isComplete={true}
            error={error}
          />
        </div>
      );
    }

    // Handle script success
    return (
      <div className="space-y-6 w-full">
        <DebugProgressEvents progressEvents={progressEvents} isVisible={showDebug} />

        {/* Save Report Button */}
        {canSaveReport && !error && finalResult && (
          <Card>
            <CardContent className="pt-6">
              <Button
                onClick={handleSaveReport}
                disabled={isSaving}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Save size={16} />
                {isSaving ? "Saving..." : (saveButtonConfig?.label || "Save Report")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Final Progress View */}
        <RealtimeProgressView
          progressEvents={progressEvents}
          isRunning={false}
          isComplete={true}
          error={error}
        />

        {/* Final Results */}
        {finalResult && <FinalResultView finalResult={finalResult} />}
      </div>
    );
  }

  // Default state (should not be visible if used correctly)
  return null;
}
