/**
 * =============================================================================
 * FILE LOCATION: frontend/src/pages/Automation/Validation.jsx
 * DESCRIPTION:   Validation Workflow Component.
 *                FIXED: WebSocket registration race condition & message filtering.
 * =============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  CheckCircle, XCircle, Loader2, ArrowRight, Search, ChevronDown, 
  ChevronRight, X, CheckCircle2, AlertCircle, Table, FileText, 
  ListChecks, Bug 
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

// Shared Components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import TableDisplay from '@/shared/TableDisplay';
import LiveLogViewer from '@/components/realTimeProgress/LiveLogViewer';

// Custom Hooks & Utils
import { useTestDiscovery } from '@/hooks/useTestDiscovery';
import { useJobWebSocket } from '@/hooks/useJobWebSocket'; 
import { processLogMessage } from '@/lib/logProcessor';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// =========================================================================================
// SECTION 1: SUB-COMPONENT - TEST SELECTION PANEL
// =========================================================================================
function TestSelectionPanel({ categorizedTests, selectedTests, onTestToggle, testsLoading, testsError }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState('all');

  const toggleCategory = (category) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) newExpanded.delete(category);
    else newExpanded.add(category);
    setExpandedCategories(newExpanded);
  };

  const filteredTests = useMemo(() => {
    let filtered = { ...categorizedTests };
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = Object.entries(filtered).reduce((acc, [category, tests]) => {
        const matchingTests = tests.filter(test =>
          test.name?.toLowerCase().includes(query) ||
          test.description?.toLowerCase().includes(query) ||
          test.path?.toLowerCase().includes(query)
        );
        if (matchingTests.length > 0) acc[category] = matchingTests;
        return acc;
      }, {});
    }
    if (selectedCategory !== 'all') {
      filtered = { [selectedCategory]: filtered[selectedCategory] || [] };
    }
    return filtered;
  }, [categorizedTests, searchQuery, selectedCategory]);

  const totalTests = Object.values(categorizedTests).flat().length;
  const categories = Object.keys(categorizedTests);

  if (testsLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin mr-2" /> Loading tests...</div>;
  if (testsError) return <div className="p-4 bg-red-50 text-red-600 rounded">Failed to load tests: {testsError}</div>;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant={selectedCategory === 'all' ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory('all')}>
              All ({totalTests})
            </Badge>
            {categories.map(category => (
              <Badge key={category} variant={selectedCategory === category ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory(category)}>
                {category} ({categorizedTests[category].length})
              </Badge>
            ))}
          </div>
        )}
      </div>

      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          {Object.keys(filteredTests).length === 0 ? (
            <div className="text-center py-8 text-gray-500">No tests match your search</div>
          ) : (
            Object.entries(filteredTests).map(([category, tests]) => (
              <div key={category} className="border rounded-lg overflow-hidden">
                <button onClick={() => toggleCategory(category)} className="w-full flex justify-between p-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <div className="flex items-center gap-2">
                    {expandedCategories.has(category) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium text-sm">{category}</span>
                    <Badge variant="secondary" className="text-xs">{tests.length}</Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">{tests.filter(t => selectedTests.includes(t.id)).length} selected</Badge>
                </button>

                {expandedCategories.has(category) && (
                  <div className="p-3 grid gap-2">
                    {tests.map((test) => {
                      const isSelected = selectedTests.includes(test.id);
                      return (
                        <div key={test.id} 
                             onClick={() => onTestToggle(test.id)}
                             className={`flex items-start gap-3 p-3 rounded-md cursor-pointer border transition-all ${isSelected ? 'border-black bg-gray-50 dark:border-white dark:bg-gray-900' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-900'}`}>
                          <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center ${isSelected ? 'bg-black border-black dark:bg-white dark:border-white' : 'border-gray-300'}`}>
                             {isSelected && <CheckCircle className="h-3 w-3 text-white dark:text-black" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono font-medium">{test.id}</code>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{test.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// =========================================================================================
// SECTION 2: SUB-COMPONENT - USER-FRIENDLY RESULTS VIEWER
// =========================================================================================
const UserFriendlyResults = ({ finalResults, jobId }) => {
  const [viewMode, setViewMode] = useState('summary');
  const [expandedHosts, setExpandedHosts] = useState(new Set());

  const toggleHost = (hostname) => {
    const newExpanded = new Set(expandedHosts);
    if (newExpanded.has(hostname)) {
      newExpanded.delete(hostname);
    } else {
      newExpanded.add(hostname);
    }
    setExpandedHosts(newExpanded);
  };

  const summaryStats = useMemo(() => {
    if (!finalResults?.results_by_host) return { total: 0, passed: 0, failed: 0, hosts: 0 };
    
    let total = 0, passed = 0, failed = 0;
    const hosts = finalResults.results_by_host.length;
    
    finalResults.results_by_host.forEach(host => {
      if (host.test_results && Array.isArray(host.test_results)) {
        host.test_results.forEach(test => {
          total++;
          if (test.error) {
            failed++;
          } else {
            passed++;
          }
        });
      }
    });
    
    return { total, passed, failed, hosts };
  }, [finalResults]);

  if (viewMode === 'summary') {
    return (
      <div className="space-y-6">
        {/* Overall Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Validation Summary
            </CardTitle>
            <CardDescription>
              {summaryStats.total} tests run across {summaryStats.hosts} device(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{summaryStats.total}</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Total Tests</div>
          </div>
          <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{summaryStats.passed}</div>
            <div className="text-sm text-emerald-600 dark:text-emerald-400">Passed</div>
          </div>
          <div className="text-center p-4 bg-rose-50 dark:bg-rose-950 rounded-lg border border-rose-200 dark:border-rose-800">
            <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">{summaryStats.failed}</div>
            <div className="text-sm text-rose-600 dark:text-rose-400">Failed</div>
          </div>
          <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{summaryStats.hosts}</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">Devices</div>
          </div>
        </div>
          </CardContent>
        </Card>

        {/* Device-wise Results */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Device Results</h3>
          {finalResults?.results_by_host?.map((hostData, index) => {
            const hostname = hostData.hostname || `Device ${index + 1}`;
            const hostTests = hostData.test_results || [];
            const passedTests = hostTests.filter(t => !t.error).length;
            const failedTests = hostTests.filter(t => t.error).length;
            const isExpanded = expandedHosts.has(hostname);

            return (
              <Card key={index}>
                <CardHeader 
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                  onClick={() => toggleHost(hostname)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                      <div>
                        <CardTitle className="text-base text-slate-800 dark:text-slate-200">{hostname}</CardTitle>
                        <CardDescription className="text-slate-600 dark:text-slate-400">
                          {hostTests.length} tests • {passedTests} passed • {failedTests} failed
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {failedTests > 0 && (
                        <Badge variant="destructive" className="text-xs bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900 dark:text-rose-200">
                          {failedTests} Failed
                        </Badge>
                      )}
                      {passedTests > 0 && (
                        <Badge className="text-xs bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-200">
                          {passedTests} Passed
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="space-y-3">
                    {hostTests.map((test, testIndex) => {
                      // Handle different test result formats
                      const hasError = test.error || (test.data && test.data.status === 'FAILED');
                      const testMessage = test.data?.message || test.data?.info || (test.error ? 'Test failed' : 'Test passed');
                      const testDetails = test.data;
                      
                      return (
                        <div key={testIndex} className={`p-3 rounded-lg border ${
                          hasError 
                            ? 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800' 
                            : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800'
                        }`}>
                          <div className="flex items-start gap-3">
                            {hasError ? (
                              <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
                            ) : (
                              <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-slate-800 dark:text-slate-200">
                                {test.title || `Test ${testIndex + 1}`}
                              </div>
                              
                              {/* Test Result Message */}
                              <div className={`text-sm mt-1 ${hasError ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                {testMessage}
                              </div>
                              
                              {/* Error Details */}
                              {test.error && (
                                <div className="text-rose-700 dark:text-rose-300 text-sm mt-1 font-mono bg-rose-100 dark:bg-rose-900 p-2 rounded border border-rose-200 dark:border-rose-800">
                                  {test.error}
                                </div>
                              )}
                              
                              {/* Legacy data array support */}
                              {test.data && Array.isArray(test.data) && test.data.length > 0 && (
                                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                                  {test.data.length} result rows
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  if (viewMode === 'detailed') {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between">
            <div>
              <CardTitle>Detailed Results</CardTitle>
              <CardDescription>Complete validation data in table format</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant={viewMode === 'summary' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('summary')}>
                <ListChecks className="w-4 h-4 mr-2" /> Summary
              </Button>
              <Button variant={viewMode === 'detailed' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('detailed')}>
                <Table className="w-4 h-4 mr-2" /> Detailed
              </Button>
              <Button variant={viewMode === 'json' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('json')}>
                <FileText className="w-4 h-4 mr-2" /> JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <TableDisplay 
            title="Results Table" 
            data={(() => {
              const tests = [];
              if (!finalResults?.results_by_host) return tests;

              finalResults.results_by_host.forEach((hostData, hostIndex) => {
                const hostname = hostData.hostname || `Host-${hostIndex + 1}`;
                if (hostData.test_results && Array.isArray(hostData.test_results)) {
                  hostData.test_results.forEach((testResult, testIndex) => {
                    const testTitle = testResult.title || `Test ${testIndex + 1}`;
                    
                    if (testResult.headers && Array.isArray(testResult.headers) && testResult.data && Array.isArray(testResult.data)) {
                      testResult.data.forEach((rowData, rowIndex) => {
                        const flatRow = {
                          host: hostname,
                          test_name: testTitle,
                          row_number: rowIndex + 1,
                          ...rowData,
                          _headers: testResult.headers.join(', ')
                        };
                        tests.push(flatRow);
                      });
                    } else {
                      tests.push({
                        host: hostname,
                        test_name: testTitle,
                        status: testResult.error ? 'FAILED' : 'PASSED',
                        result: testResult.error || 'Success',
                      });
                    }
                  });
                }
              });
              return tests;
            })()} 
            isVisible={true} 
            enableSave={true} 
            searchable={true} 
            maxRows={25} 
            saveConfig={{ defaultFilename: `validation-${jobId}` }} 
          />
        </CardContent>
      </Card>
    );
  }

  if (viewMode === 'json') {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between">
            <div>
              <CardTitle>Raw JSON Data</CardTitle>
              <CardDescription>Complete validation results in JSON format</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant={viewMode === 'summary' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('summary')}>
                <ListChecks className="w-4 h-4 mr-2" /> Summary
              </Button>
              <Button variant={viewMode === 'detailed' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('detailed')}>
                <Table className="w-4 h-4 mr-2" /> Detailed
              </Button>
              <Button variant={viewMode === 'json' ? 'default' : 'outline'} size="sm" onClick={() => setViewMode('json')}>
                <FileText className="w-4 h-4 mr-2" /> JSON
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <pre className="bg-gray-50 dark:bg-gray-950 p-4 rounded text-xs font-mono">
              {JSON.stringify(finalResults, null, 2)}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return null;
};

// =========================================================================================
// SECTION 3: MAIN COMPONENT
// =========================================================================================
export default function Validation() {
  // --- STATE MANAGEMENT ---
  const [activeTab, setActiveTab] = useState("config");
  const [validationParams, setValidationParams] = useState({
    username: "", password: "", hostname: "", inventory_file: "", tests: []
  });

  // Workflow State
  const [jobStatus, setJobStatus] = useState("idle"); // idle, running, success, failed
  const [jobId, setJobId] = useState(null);
  const [finalResults, setFinalResults] = useState(null);

  // Logging & UI State
  const [logHistory, setLogHistory] = useState([]);
  const [activeStep, setActiveStep] = useState(null);
  const [showTechnical, setShowTechnical] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Data Fetching
  const { categorizedTests, loading: testsLoading, error: testsError } = useTestDiscovery("validation");

  // WebSocket Hook (Global)
  const { lastMessage, isConnected, sendMessage } = useJobWebSocket();

  // --- HANDLERS ---
  const handleParamChange = (name, value) => setValidationParams(prev => ({ ...prev, [name]: value }));
  
  const handleTestToggle = (testId) => {
    const current = validationParams.tests || [];
    const updated = current.includes(testId) ? current.filter(t => t !== testId) : [...current, testId];
    setValidationParams(prev => ({ ...prev, tests: updated }));
  };

  const resetWorkflow = () => {
    setJobStatus("idle");
    setLogHistory([]);
    setFinalResults(null);
    setJobId(null);
    setActiveTab("config");
    setActiveStep(null);
    setShowResults(false);
  };

  // ---------------------------------------------------------------------------------------
  // WEB SOCKET MESSAGE HANDLING
  // ---------------------------------------------------------------------------------------
  useEffect(() => {
    // 1. Basic Check
    if (!lastMessage || !jobId) return;

    // 2. Filter Logic (Permissive)
    if (lastMessage.job_id && lastMessage.job_id !== jobId) return;

    const normalizedLog = processLogMessage(lastMessage);
    setLogHistory(prev => [...prev, normalizedLog]);

    if (normalizedLog.type === 'STEP_PROGRESS') {
      setActiveStep(normalizedLog.message.replace(/^Step \d+: /, ''));
    }

    // Check for Completion/Results
    const originalEvent = normalizedLog.originalEvent || lastMessage;
    
    // CASE A: Results Received (True Success)
    if (originalEvent.type === 'result' && originalEvent.data) {
        setFinalResults(originalEvent.data);
        setJobStatus('success');
        setShowResults(true);
        if (sendMessage && jobId) sendMessage({ type: "UNSUBSCRIBE" });
    }
    // CASE B: Job Finished Signal
    else if (originalEvent.type === 'job_status' && originalEvent.status === 'finished') {
        // FIX: Check if we actually have results before marking success
        if (finalResults) {
            setJobStatus('success');
        } else {
            // Job finished but no results = FAILURE (e.g., file not found)
            setJobStatus('failed');
            setLogHistory(prev => [...prev, {
                type: 'ERROR',
                message: 'Job finished but produced no results. Check test file paths.',
                id: Date.now(),
                timestamp: new Date().toISOString()
            }]);
        }
    }
    // CASE C: Explicit Error
    else if (originalEvent.type === 'error') {
        setJobStatus('failed');
        if (sendMessage && jobId) sendMessage({ type: "UNSUBSCRIBE" });
    }

  }, [lastMessage, jobId, finalResults]); // <--- Added finalResults dependency

  // --- EXECUTION LOGIC ---
  const startValidation = async () => {
    // 1. Validation
    if (!validationParams.username || !validationParams.password) return alert("Credentials required");
    if (!validationParams.hostname && !validationParams.inventory_file) return alert("Target required");
    if (!validationParams.tests?.length) return alert("Select at least one test");

    // 2. Reset UI
    setJobStatus("running");
    setLogHistory([]);
    setFinalResults(null);
    setActiveTab("execute");
    setActiveStep("Initializing validation job...");

    // 3. Prepare Payload
    const payload = {
      command: "validation",
      hostname: validationParams.hostname?.trim(),
      inventory_file: validationParams.inventory_file?.trim(),
      username: validationParams.username,
      password: validationParams.password,
      tests: validationParams.tests,
      mode: "check"
    };

    try {
      // 4. API Call (Trigger Job)
      const response = await fetch(`${API_URL}/api/operations/validation/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      
      // 5. Store Job ID
      setJobId(data.job_id);

      // 6. IMMEDIATE SUBSCRIPTION (CRITICAL FIX)
      // Subscribe right here to avoid race conditions with useEffect
      if (data.ws_channel && sendMessage) {
          console.log(`Subscribing to channel: ${data.ws_channel}`);
          sendMessage({ 
              type: 'SUBSCRIBE', 
              channel: data.ws_channel 
          });
      } else {
          console.warn("WS Channel missing or sendMessage unavailable");
      }

      // Log start
      setLogHistory(prev => [...prev, processLogMessage({ 
          message: `Job started with ID: ${data.job_id}`, 
          event_type: 'SYSTEM_INFO' 
      })]);

    } catch (error) {
      console.error(error);
      setJobStatus("failed");
      setLogHistory(prev => [...prev, processLogMessage({ message: `API Error: ${error.message}`, event_type: "ERROR" })]);
    }
  };

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  // =========================================================================================
  // RENDER
  // =========================================================================================
  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* HEADER */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Validation Tests</h1>
              <p className="text-sm text-muted-foreground">Run operational checks against network devices</p>
            </div>
            {jobStatus !== 'idle' && (
              <Button onClick={resetWorkflow} variant="outline" size="sm">Start New Validation</Button>
            )}
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="config" disabled={isRunning}>Configure</TabsTrigger>
              <TabsTrigger value="execute" disabled={jobStatus === 'idle'}>Execute</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* TAB 1: CONFIGURATION */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsContent value="config" className="m-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
               <div className="space-y-6">
                  <DeviceTargetSelector parameters={validationParams} onParamChange={handleParamChange} title="Target Device" />
                  <DeviceAuthFields parameters={validationParams} onParamChange={handleParamChange} title="Authentication" />
                  
                  <Card>
                      <CardHeader><CardTitle>Launch</CardTitle></CardHeader>
                      <CardContent>
                          <div className="space-y-4">
                              <div className="flex items-center gap-2 text-sm">
                                  <ListChecks className="w-4 h-4 text-gray-500" />
                                  <span>{validationParams.tests.length} tests selected</span>
                              </div>
                              <Button onClick={startValidation} disabled={!validationParams.tests.length} className="w-full bg-black dark:bg-white text-white dark:text-black" size="lg">
                                  Start Validation <ArrowRight className="w-4 h-4 ml-2" />
                              </Button>
                          </div>
                      </CardContent>
                  </Card>
               </div>

               <div className="flex flex-col h-full">
                  <Card className="flex-1">
                      <CardHeader>
                          <CardTitle>Test Selection</CardTitle>
                          <CardDescription>Select tests to run from the library</CardDescription>
                      </CardHeader>
                      <CardContent>
                          <TestSelectionPanel 
                              categorizedTests={categorizedTests} 
                              selectedTests={validationParams.tests} 
                              onTestToggle={handleTestToggle} 
                              testsLoading={testsLoading} 
                              testsError={testsError} 
                          />
                      </CardContent>
                  </Card>
               </div>
            </div>
          </TabsContent>

          {/* TAB 2: EXECUTION */}
          <TabsContent value="execute" className="m-0">
            <div className="max-w-4xl mx-auto space-y-6">
               <Card>
                  <CardHeader>
                      <CardTitle>Execution Console</CardTitle>
                      <CardDescription>Real-time validation progress</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                      {/* Status Plan */}
                      {!isRunning && jobStatus === 'idle' && (
                          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
                               Waiting to start...
                          </div>
                      )}

                      {/* Status Bar */}
                      {(isRunning || isComplete || hasError) && (
                         <div className={`flex items-center justify-between p-4 rounded-lg border ${
                              isComplete ? 'bg-green-50 border-green-200 text-green-700' : 
                              hasError ? 'bg-red-50 border-red-200 text-red-700' : 
                              'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300'
                         }`}>
                            <div className="flex items-center gap-3">
                                {isRunning ? <Loader2 className="animate-spin w-5 h-5" /> : 
                                 isComplete ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                <span className="font-medium">
                                  {isRunning ? (activeStep || "Processing...") : 
                                   isComplete ? "Validation Completed Successfully" : "Validation Failed"}
                                </span>
                            </div>
                            
                             {/* Actions */}
                             <div className="flex items-center gap-2">
                                 <Button 
                                   size="sm" 
                                   variant={showResults ? "secondary" : "outline"}
                                   onClick={() => finalResults && setShowResults(!showResults)}
                                   className={`border-zinc-300 ${showResults ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900" : "bg-white dark:bg-black text-zinc-600"} ${!finalResults ? "opacity-50 cursor-not-allowed" : ""}`}
                                 >
                                    <CheckCircle2 className={`w-4 h-4 ${finalResults ? (showResults ? "text-green-600" : "text-green-600") : "text-gray-400"}`} />
                                    <span className="ml-2 hidden md:inline">
                                        Results {finalResults ? '' : '(Waiting)'}
                                    </span>
                                 </Button>
                                 <Button
                                   variant={showTechnical ? "secondary" : "outline"}
                                   size="sm"
                                   onClick={() => setShowTechnical(!showTechnical)}
                                   className={`border-zinc-300 ${showTechnical ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900" : "bg-white dark:bg-black text-zinc-600"}`}
                                 >
                                    <Bug className={`w-4 h-4 ${showTechnical ? "text-blue-600" : "text-current"}`} />
                                    <span className="ml-2 hidden md:inline">Debug</span>
                                 </Button>
                             </div>
                         </div>
                      )}

                       {/* Live Log Viewer */}
                       <LiveLogViewer 
                           logs={logHistory} 
                           isConnected={isConnected} 
                           height="h-96" 
                           title="Validation Logs"
                           showTechnical={showTechnical}
                       />

                       {/* Results Section */}
                       {finalResults && showResults && (
                           <div className="space-y-4">
                               <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                   <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                   Validation Results
                               </div>

                               {/* User-Friendly Results Display */}
                               <UserFriendlyResults finalResults={finalResults} jobId={jobId} />
                           </div>
                       )}
                  </CardContent>
               </Card>
            </div>
          </TabsContent>


        </Tabs>
      </div>
    </div>
  );
}
