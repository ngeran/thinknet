import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Search,
  ChevronDown,
  ChevronRight,
  X,
  CheckCircle2,
  Circle,
  AlertCircle,
  Download
} from 'lucide-react';

// Shared components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';

// Custom Hooks
import { useTestDiscovery } from '@/hooks/useTestDiscovery';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

// =========================================================================================
// DIRECT WEBSOCKET HOOK
// =========================================================================================
const useDirectWebSocket = () => {
  const [lastMessage, setLastMessage] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);

  const connect = useCallback((channel) => {
    return new Promise((resolve, reject) => {
      if (wsRef.current) {
        wsRef.current.close();
      }

      const WS_URL = import.meta.env.VITE_WS_GATEWAY_URL || 'ws://localhost:3100/ws';
      console.log(`[WS] Connecting to: ${WS_URL}`);

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] ✅ Connected, subscribing to: ${channel}`);
        setIsConnected(true);

        const subscribeCommand = {
          type: 'SUBSCRIBE',
          channel: channel
        };
        ws.send(JSON.stringify(subscribeCommand));
        resolve(ws);
      };

      ws.onmessage = (event) => {
        console.log('[WS] 📨 Message received:', event.data);
        setLastMessage(event.data);
      };

      ws.onclose = (event) => {
        console.log(`[WS] 🔌 Connection closed:`, event.code, event.reason);
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        console.error('[WS] ❌ Error:', error);
        setIsConnected(false);
        reject(error);
      };

      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 5000);
    });
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setLastMessage(null);
  }, []);

  return {
    connect,
    disconnect,
    lastMessage,
    isConnected
  };
};

// TestSelectionPanel component
function TestSelectionPanel({ categorizedTests, selectedTests, onTestToggle, testsLoading, testsError }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState('all');

  const toggleCategory = (category) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const filteredTests = React.useMemo(() => {
    let filtered = { ...categorizedTests };
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = Object.entries(filtered).reduce((acc, [category, tests]) => {
        const matchingTests = tests.filter(test =>
          test.name?.toLowerCase().includes(query) ||
          test.description?.toLowerCase().includes(query) ||
          test.path?.toLowerCase().includes(query)
        );
        if (matchingTests.length > 0) {
          acc[category] = matchingTests;
        }
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

  if (testsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-muted-foreground">Loading tests...</span>
      </div>
    );
  }

  if (testsError) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Failed to load tests</p>
            <p className="text-sm text-destructive/80 mt-1">{testsError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSelectedCategory('all')}
            >
              All ({totalTests})
            </Badge>
            {categories.map(category => {
              const count = categorizedTests[category].length;
              return (
                <Badge
                  key={category}
                  variant={selectedCategory === category ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category} ({count})
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {selectedTests.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {selectedTests.length} test{selectedTests.length !== 1 ? 's' : ''} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => selectedTests.forEach(test => onTestToggle(test))}
              className="h-7 text-xs"
            >
              Clear all
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedTests.slice(0, 8).map(testId => {
              const testName = testId.split('/').pop()?.split('.').shift() || testId;
              return (
                <Badge key={testId} variant="secondary" className="text-xs">
                  {testName}
                </Badge>
              );
            })}
            {selectedTests.length > 8 && (
              <Badge variant="secondary" className="text-xs">
                +{selectedTests.length - 8} more
              </Badge>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="h-[500px] pr-4">
        <div className="space-y-3">
          {Object.keys(filteredTests).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No tests match your search</p>
            </div>
          ) : (
            Object.entries(filteredTests).map(([category, tests]) => (
              <div key={category} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {expandedCategories.has(category) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-medium text-sm">{category}</span>
                    <Badge variant="secondary" className="text-xs">
                      {tests.length}
                    </Badge>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {tests.filter(t => selectedTests.includes(t.id)).length} selected
                  </Badge>
                </button>

                {expandedCategories.has(category) && (
                  <div className="p-3 grid grid-cols-1 gap-2">
                    {tests.map((test) => {
                      const isSelected = selectedTests.includes(test.id);
                      return (
                        <label
                          key={test.id}
                          className={`
                            flex items-start gap-3 p-3 rounded-md cursor-pointer transition-all
                            border ${isSelected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-transparent hover:border-muted-foreground/20 hover:bg-muted/30'
                            }
                          `}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => onTestToggle(test.id)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono font-medium">{test.id}</code>
                              {isSelected && (
                                <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              )}
                            </div>
                            {test.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {test.description}
                              </p>
                            )}
                          </div>
                        </label>
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

// Status Icon Component (matching Templates.jsx)
const StepIcon = ({ status }) => {
  if (status === 'COMPLETE') return <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
  if (status === 'IN_PROGRESS') return <Loader2 className="w-5 h-5 animate-spin text-black dark:text-white flex-shrink-0" />;
  if (status === 'FAILED') return <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />;
  return <Circle className="w-5 h-5 text-gray-300 dark:text-gray-700 flex-shrink-0" />;
};

export default function Validation() {
  // State Management
  const [validationParams, setValidationParams] = useState({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
    tests: []
  });

  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");
  const [validationSteps, setValidationSteps] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);
  const [rawDataOpen, setRawDataOpen] = useState(false);
  const [rawDataView, setRawDataView] = useState('json');

  // Custom Hooks
  const {
    connect: connectWS,
    disconnect: disconnectWS,
    lastMessage: wsLastMessage,
    isConnected: wsConnected
  } = useDirectWebSocket();

  const { categorizedTests, loading: testsLoading, error: testsError } = useTestDiscovery("validation");

  // Event Handlers
  const handleParamChange = (name, value) => {
    setValidationParams(prev => ({ ...prev, [name]: value }));
  };

  const handleTestToggle = (testId) => {
    const currentTests = Array.isArray(validationParams.tests) ? validationParams.tests : [];
    const updatedTests = currentTests.includes(testId)
      ? currentTests.filter(t => t !== testId)
      : [...currentTests, testId];
    handleParamChange('tests', updatedTests);
  };

  const resetWorkflow = () => {
    disconnectWS();
    setJobStatus("idle");
    setValidationSteps([]);
    setJobId(null);
    setWsChannel(null);
    setFinalResults(null);
    setActiveTab("config");
    setRawDataOpen(false);
    setRawDataView('json');
  };

  const startValidationExecution = async (e) => {
    e.preventDefault();

    // Validation checks
    if (!validationParams.username || !validationParams.password) {
      alert("Username and password are required.");
      return;
    }
    if (!validationParams.hostname && !validationParams.inventory_file) {
      alert("A target host or inventory file is required.");
      return;
    }
    if (!validationParams.tests || validationParams.tests.length === 0) {
      alert("At least one validation test must be selected.");
      return;
    }
    if (jobStatus === 'running') return;

    // Reset state
    disconnectWS();
    setActiveTab("execute");
    setJobStatus("running");
    setValidationSteps([]);
    setFinalResults(null);
    setJobId(null);
    setWsChannel(null);

    // Prepare payload
    const payload = {
      command: "validation",
      hostname: validationParams.hostname?.trim() || "",
      inventory_file: validationParams.inventory_file?.trim() || "",
      username: validationParams.username,
      password: validationParams.password,
      tests: validationParams.tests,
    };

    Object.keys(payload).forEach(key => {
      if (payload[key] === "" || payload[key] == null) delete payload[key];
    });

    try {
      const response = await fetch(`${API_URL}/api/operations/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.job_id && data.ws_channel) {
        setJobId(data.job_id);
        setWsChannel(data.ws_channel);

        // Connect to WebSocket
        connectWS(data.ws_channel).catch(error => {
          console.error(`WebSocket connection failed:`, error);
          setValidationSteps(prev => [...prev, {
            message: `WebSocket connection failed: ${error.message}`,
            status: 'FAILED',
            id: 'ws-error'
          }]);
        });

        setValidationSteps([{
          message: `Job ${data.job_id} successfully queued. Connecting to real-time stream...`,
          status: 'IN_PROGRESS',
          id: 'job-queue'
        }]);
      } else {
        throw new Error('Invalid response: missing job_id or ws_channel');
      }
    } catch (error) {
      console.error('API call failed:', error);
      setValidationSteps([{
        message: `Validation start failed: ${error.message}`,
        status: 'FAILED',
        id: 'start-error'
      }]);
      setJobStatus("failed");
      setTimeout(() => setActiveTab("results"), 1000);
    }
  };

  // WebSocket Message Handler
  useEffect(() => {
    if (!wsLastMessage || !jobId) return;

    console.log(`[VALIDATION] Processing WebSocket message for job: ${jobId}`);

    try {
      const wrapper = JSON.parse(wsLastMessage);

      if (wrapper.data) {
        try {
          const dataWrapper = JSON.parse(wrapper.data);

          if (dataWrapper.event_type === 'ORCHESTRATOR_LOG' && dataWrapper.message) {
            let messageText = dataWrapper.message;

            if (messageText.startsWith('[STDOUT] ')) {
              messageText = messageText.substring('[STDOUT] '.length);
            }
            if (messageText.startsWith('[STDERR] ')) {
              messageText = messageText.substring('[STDERR] '.length);
            }

            try {
              const actualMessage = JSON.parse(messageText);
              processActualMessage(actualMessage);
            } catch (innerParseError) {
              console.error(`Failed to parse inner message:`, innerParseError);
              setValidationSteps(prev => [...prev, {
                message: `Parse error: ${messageText.substring(0, 100)}...`,
                status: 'FAILED',
                id: `parse-error-${Date.now()}`
              }]);
            }
          }
        } catch (dataParseError) {
          console.error(`Failed to parse data field:`, dataParseError);
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }, [wsLastMessage, jobId]);

  const processActualMessage = (actualMessage) => {
    console.log(`[VALIDATION] Processing message type: ${actualMessage.type}`);

    if (actualMessage.type === 'progress') {
      const { event_type, message: progressMessage } = actualMessage;

      switch (event_type) {
        case 'OPERATION_START':
          setValidationSteps(prev => prev.map(step =>
            step.id === 'job-queue' ? { ...step, status: 'COMPLETE' } : step
          ));
          setValidationSteps(prev => [...prev, {
            message: progressMessage,
            status: 'IN_PROGRESS',
            id: 'operation-start'
          }]);
          break;

        case 'STEP_START':
          setValidationSteps(prev => {
            const newSteps = prev.map(step =>
              step.status === 'IN_PROGRESS' ? { ...step, status: 'COMPLETE' } : step
            );
            return [...newSteps, {
              message: progressMessage,
              status: 'IN_PROGRESS',
              id: `step-${Date.now()}`
            }];
          });
          break;

        case 'STEP_COMPLETE':
          setValidationSteps(prev => prev.map(step =>
            step.status === 'IN_PROGRESS' ? { ...step, status: 'COMPLETE' } : step
          ));
          break;

        case 'OPERATION_COMPLETE':
          const finalStatus = actualMessage.data?.status;

          setValidationSteps(prev => prev.map(step =>
            step.status === 'IN_PROGRESS' ? {
              ...step,
              status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED'
            } : step
          ));

          setValidationSteps(prev => [...prev, {
            message: progressMessage,
            status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED',
            id: 'final-result'
          }]);

          setJobStatus(finalStatus === 'SUCCESS' ? 'success' : 'failed');
          break;
      }
    }

    if (actualMessage.type === 'result') {
      console.log('Final result message received!');
      setFinalResults(actualMessage.data);
      setJobStatus('success');
      setTimeout(() => setActiveTab('results'), 1000);
    }

    if (actualMessage.type === 'error') {
      setValidationSteps(prev => [...prev, {
        message: `Error: ${actualMessage.message}`,
        status: 'FAILED',
        id: `error-${Date.now()}`
      }]);
      setJobStatus('failed');
      setTimeout(() => setActiveTab('results'), 1000);
    }
  };

  // Derived state
  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';
  const isFormValid = validationParams.username?.trim() &&
    validationParams.password?.trim() &&
    (validationParams.hostname?.trim() || validationParams.inventory_file?.trim()) &&
    validationParams.tests && validationParams.tests.length > 0;
  const canStartValidation = isFormValid && jobStatus === 'idle';

  return (
    <div className="p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Validation Tests</h1>
          <p className="text-muted-foreground">Run validation tests against network devices</p>
        </div>
        {jobStatus !== 'idle' && (
          <Button onClick={resetWorkflow} variant="outline" size="sm">
            Start New Validation
          </Button>
        )}
      </div>
      <Separator className="mb-8" />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="config" disabled={jobStatus === 'running'}>
            Configure
          </TabsTrigger>
          <TabsTrigger value="execute">Execute</TabsTrigger>
          <TabsTrigger value="results" disabled={jobStatus === 'running'}>
            Results
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-7xl">
            <div className="space-y-6 flex flex-col">
              <DeviceTargetSelector
                parameters={validationParams}
                onParamChange={handleParamChange}
                title="Target Device"
                description="Choose the device to validate"
              />

              <DeviceAuthFields
                parameters={validationParams}
                onParamChange={handleParamChange}
                title="Device Authentication"
                description="Enter credentials for device access"
              />

              <Card className="flex-1 flex flex-col">
                <CardContent className="pt-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-lg font-semibold mb-3">Ready to Validate</h4>
                      <div className="space-y-2 text-sm">
                        {validationParams.tests && validationParams.tests.length > 0 && (
                          <p className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="font-medium">{validationParams.tests.length} test(s) selected</span>
                          </p>
                        )}
                        {(validationParams.hostname || validationParams.inventory_file) && (
                          <p className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>Target configured</span>
                          </p>
                        )}
                        {validationParams.username && validationParams.password && (
                          <p className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span>Authentication ready</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <Button
                      onClick={startValidationExecution}
                      disabled={!canStartValidation}
                      size="lg"
                      className="w-full"
                    >
                      {jobStatus === 'running' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Running...
                        </>
                      ) : (
                        <>
                          Start Validation
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-col">
              <Card className="flex-1 flex flex-col">
                <CardHeader>
                  <CardTitle>Validation Tests</CardTitle>
                  <CardDescription>
                    Select tests to run against the target device(s)
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <TestSelectionPanel
                    categorizedTests={categorizedTests}
                    selectedTests={validationParams.tests || []}
                    onTestToggle={handleTestToggle}
                    testsLoading={testsLoading}
                    testsError={testsError}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Execution Tab - REDESIGNED to match Templates.jsx */}
        <TabsContent value="execute">
          <div className="space-y-4 max-w-4xl mx-auto">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Execute Validation Tests</CardTitle>
                    <CardDescription>Real-time progress of validation execution</CardDescription>
                  </div>
                  {!isRunning && jobStatus === 'idle' && (
                    <Button variant="outline" onClick={() => setActiveTab('config')} size="sm">
                      Back to Config
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Validation Summary */}
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target Device</div>
                      <div className="text-sm font-medium">{validationParams.hostname || validationParams.inventory_file}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tests Selected</div>
                      <div className="text-sm font-medium">{validationParams.tests?.length || 0} tests</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {isRunning ? 'Validation in progress...' : isComplete ? 'Validation completed' : hasError ? 'Validation failed' : 'Ready to start validation'}
                  </div>
                </div>

                {/* Start Button (shown only before execution) */}
                {!isRunning && jobStatus === 'idle' && validationSteps.length === 0 && (
                  <div className="flex justify-center py-8">
                    <Button
                      onClick={startValidationExecution}
                      disabled={!canStartValidation}
                      size="lg"
                      className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                    >
                      <ArrowRight className="w-5 h-5 mr-2" />
                      Start Validation
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Validation Progress - Matching Templates.jsx style */}
            {(isRunning || isComplete || hasError) && validationSteps.length > 0 && (
              <Card className={`border-2 ${isComplete ? 'border-green-500' :
                  hasError ? 'border-red-500' :
                    'border-gray-200 dark:border-gray-800'
                }`}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isComplete ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        Validation Successful
                      </>
                    ) : hasError ? (
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        Validation Failed
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Running Validation Tests
                      </>
                    )}
                  </CardTitle>
                  {(isComplete || hasError) && finalResults?.message && (
                    <CardDescription>{finalResults.message}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {validationSteps.map((step, index) => (
                      <div
                        key={step.id || index}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                      >
                        <StepIcon status={step.status} />
                        <span className={`text-sm ${step.status === 'COMPLETE' ? 'text-green-600' :
                            step.status === 'IN_PROGRESS' ? 'text-black dark:text-white font-medium' :
                              step.status === 'FAILED' ? 'text-red-600 font-medium' :
                                'text-gray-400 dark:text-gray-600'
                          }`}>
                          {step.message}
                        </span>
                      </div>
                    ))}

                    {/* Waiting indicator when running but no new steps */}
                    {isRunning && validationSteps.length > 0 &&
                      validationSteps[validationSteps.length - 1].status !== 'IN_PROGRESS' && (
                        <div className="flex items-center gap-3 p-3 text-sm text-gray-500 dark:text-gray-400">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Waiting for next update...</span>
                        </div>
                      )}
                  </div>

                  {/* Show results summary when complete */}
                  {(isComplete || hasError) && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                          Execution Summary
                        </h4>
                        <Button
                          onClick={() => setActiveTab('results')}
                          variant="outline"
                          size="sm"
                        >
                          View Full Results
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>

                      {finalResults && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</div>
                            <div className={`text-sm font-medium ${isComplete ? 'text-green-600' : 'text-red-600'}`}>
                              {isComplete ? 'Success' : 'Failed'}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tests Run</div>
                            <div className="text-sm font-medium">{validationParams.tests?.length || 0}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target</div>
                            <div className="text-sm font-medium truncate">
                              {validationParams.hostname || validationParams.inventory_file}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Steps</div>
                            <div className="text-sm font-medium">{validationSteps.length}</div>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-center pt-4">
                        <Button
                          onClick={resetWorkflow}
                          variant="outline"
                        >
                          Run Another Validation
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Results Tab - ENHANCED MODERN DESIGN */}
        <TabsContent value="results">
          <div className="space-y-6 max-w-7xl mx-auto">
            {/* Summary Header Card */}
            <Card className={`border-2 ${jobStatus === 'success' ? 'border-green-500' :
                jobStatus === 'failed' ? 'border-red-500' :
                  'border-gray-200'
              }`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {jobStatus === 'success' ? (
                      <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                    ) : jobStatus === 'failed' ? (
                      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                        <XCircle className="h-8 w-8 text-red-600" />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
                      </div>
                    )}
                    <div>
                      <h2 className="text-2xl font-bold mb-1">
                        {jobStatus === 'success' ? 'Validation Completed' :
                          jobStatus === 'failed' ? 'Validation Failed' :
                            'Awaiting Execution'}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {finalResults?.message || 'Results will appear here after execution'}
                      </p>
                      {jobId && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Job ID: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{jobId}</code>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Export Actions */}
                  {finalResults && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const dataStr = JSON.stringify(finalResults, null, 2);
                          const blob = new Blob([dataStr], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `validation-results-${jobId || Date.now()}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const results = finalResults.results_by_host || {};
                          let csv = 'Host,Test,Status,Message,Duration\n';
                          Object.entries(results).forEach(([host, hostResults]) => {
                            if (hostResults.tests) {
                              hostResults.tests.forEach(test => {
                                csv += `"${host}","${test.test_name || test.test_id || 'N/A'}","${test.status || 'N/A'}","${(test.message || '').replace(/"/g, '""')}","${test.duration || 'N/A'}"\n`;
                              });
                            }
                          });
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `validation-results-${jobId || Date.now()}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        CSV
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Statistics Overview */}
            {finalResults && finalResults.results_by_host && (() => {
              const hosts = Object.keys(finalResults.results_by_host);
              let totalTests = 0;
              let passedTests = 0;
              let failedTests = 0;
              let skippedTests = 0;

              hosts.forEach(host => {
                const hostResults = finalResults.results_by_host[host];
                if (hostResults.tests && Array.isArray(hostResults.tests)) {
                  hostResults.tests.forEach(test => {
                    totalTests++;
                    const status = (test.status || '').toUpperCase();
                    if (status === 'PASSED' || status === 'SUCCESS' || status === 'PASS') {
                      passedTests++;
                    } else if (status === 'FAILED' || status === 'FAILURE' || status === 'FAIL') {
                      failedTests++;
                    } else if (status === 'SKIPPED' || status === 'SKIP') {
                      skippedTests++;
                    }
                  });
                }
              });

              return (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Tests</p>
                          <p className="text-3xl font-bold mt-1">{totalTests}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <CheckCircle className="w-6 h-6 text-blue-600" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Passed</p>
                          <p className="text-3xl font-bold mt-1 text-green-600">{passedTests}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: `${totalTests > 0 ? (passedTests / totalTests) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Failed</p>
                          <p className="text-3xl font-bold mt-1 text-red-600">{failedTests}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                          <XCircle className="w-6 h-6 text-red-600" />
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-500 transition-all duration-500"
                          style={{ width: `${totalTests > 0 ? (failedTests / totalTests) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Skipped</p>
                          <p className="text-3xl font-bold mt-1 text-gray-600">{skippedTests}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                          <Circle className="w-6 h-6 text-gray-600" />
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gray-400 transition-all duration-500"
                          style={{ width: `${totalTests > 0 ? (skippedTests / totalTests) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {/* Detailed Results by Host */}
            {finalResults && finalResults.results_by_host && (() => {
              // Collect all tests across all hosts
              const allTestsAcrossHosts = [];
              Object.entries(finalResults.results_by_host).forEach(([host, hostResults]) => {
                if (hostResults.tests && Array.isArray(hostResults.tests) && hostResults.tests.length > 0) {
                  hostResults.tests.forEach(test => {
                    allTestsAcrossHosts.push({ host, ...test });
                  });
                }
              });

              // If we have tests, show them in a unified table
              if (allTestsAcrossHosts.length > 0) {
                return (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-lg">Test Results</CardTitle>
                          <CardDescription>
                            {allTestsAcrossHosts.length} test(s) executed across all hosts
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Host
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Test Name
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Message
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Duration
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-black divide-y divide-gray-200 dark:divide-gray-800">
                              {allTestsAcrossHosts.map((test, idx) => {
                                const status = (test.status || '').toUpperCase();
                                const isPassed = status === 'PASSED' || status === 'SUCCESS' || status === 'PASS';
                                const isFailed = status === 'FAILED' || status === 'FAILURE' || status === 'FAIL';
                                const isSkipped = status === 'SKIPPED' || status === 'SKIP';

                                return (
                                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <div className="text-sm font-mono font-medium text-gray-900 dark:text-gray-100">
                                        {test.host}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <div className="flex items-center gap-2">
                                        {isPassed ? (
                                          <>
                                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                                            <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
                                              Passed
                                            </Badge>
                                          </>
                                        ) : isFailed ? (
                                          <>
                                            <XCircle className="w-4 h-4 text-red-600" />
                                            <Badge variant="outline" className="border-red-500 text-red-700 bg-red-50">
                                              Failed
                                            </Badge>
                                          </>
                                        ) : isSkipped ? (
                                          <>
                                            <Circle className="w-4 h-4 text-gray-600" />
                                            <Badge variant="outline" className="border-gray-500 text-gray-700 bg-gray-50">
                                              Skipped
                                            </Badge>
                                          </>
                                        ) : (
                                          <Badge variant="outline">{test.status}</Badge>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {test.test_name || test.test_id || 'Unnamed Test'}
                                      </div>
                                      {test.test_id && test.test_name !== test.test_id && (
                                        <div className="text-xs text-gray-500 font-mono mt-0.5">
                                          {test.test_id}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="text-sm text-gray-700 dark:text-gray-300 max-w-md">
                                        {test.message || test.error || 'No message provided'}
                                      </div>
                                      {test.details && (
                                        <details className="mt-2">
                                          <summary className="text-xs text-blue-600 cursor-pointer hover:underline">
                                            View Details
                                          </summary>
                                          <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-auto max-h-40">
                                            {typeof test.details === 'string' ? test.details : JSON.stringify(test.details, null, 2)}
                                          </pre>
                                        </details>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <div className="text-sm text-gray-700 dark:text-gray-300">
                                        {test.duration ? `${test.duration}s` : 'N/A'}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Show host-level errors if any */}
                      {Object.entries(finalResults.results_by_host).map(([host, hostResults]) =>
                        hostResults.error ? (
                          <div key={host} className="mt-4 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="text-sm font-medium text-red-900 dark:text-red-100">
                                  Error on host: {host}
                                </p>
                                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{hostResults.error}</p>
                              </div>
                            </div>
                          </div>
                        ) : null
                      )}
                    </CardContent>
                  </Card>
                );
              }

              // If no tests found, show a message
              return (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No test results available</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* Raw Data Viewer - Collapsible with Table View */}
            {finalResults && (() => {
              const allTests = [];
              if (finalResults.results_by_host) {
                Object.entries(finalResults.results_by_host).forEach(([host, hostResults]) => {
                  if (hostResults.tests && Array.isArray(hostResults.tests)) {
                    hostResults.tests.forEach(test => {
                      allTests.push({ host, ...test });
                    });
                  }
                });
              }

              return (
                <Card>
                  <CardHeader
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                    onClick={() => setRawDataOpen(!rawDataOpen)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          {rawDataOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          Raw Results Data
                        </CardTitle>
                        <CardDescription>
                          {rawDataOpen ? 'Click to collapse' : 'Click to expand - View complete JSON response or table format'}
                        </CardDescription>
                      </div>
                      {rawDataOpen && allTests.length > 1 && (
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant={rawDataView === 'table' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setRawDataView('table')}
                          >
                            Table View
                          </Button>
                          <Button
                            variant={rawDataView === 'json' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setRawDataView('json')}
                          >
                            JSON View
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  {rawDataOpen && (
                    <CardContent>
                      {rawDataView === 'table' && allTests.length > 1 ? (
                        <div className="border rounded-lg overflow-hidden">
                          <ScrollArea className="h-[400px]">
                            <table className="w-full">
                              <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Host</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test ID</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test Name</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-black divide-y divide-gray-200 dark:divide-gray-800">
                                {allTests.map((test, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                                    <td className="px-4 py-3 text-sm font-mono">{test.host}</td>
                                    <td className="px-4 py-3 text-sm font-mono">{test.test_id || 'N/A'}</td>
                                    <td className="px-4 py-3 text-sm">{test.test_name || 'N/A'}</td>
                                    <td className="px-4 py-3 text-sm">
                                      <Badge variant="outline">{test.status || 'N/A'}</Badge>
                                    </td>
                                    <td className="px-4 py-3 text-sm max-w-xs truncate" title={test.message || test.error}>
                                      {test.message || test.error || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-sm">{test.duration ? `${test.duration}s` : 'N/A'}</td>
                                    <td className="px-4 py-3 text-sm">
                                      {test.details ? (
                                        <details>
                                          <summary className="text-xs text-blue-600 cursor-pointer hover:underline">View</summary>
                                          <pre className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-auto max-h-40 max-w-md">
                                            {typeof test.details === 'string' ? test.details : JSON.stringify(test.details, null, 2)}
                                          </pre>
                                        </details>
                                      ) : 'N/A'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </ScrollArea>
                        </div>
                      ) : (
                        <ScrollArea className="h-[400px]">
                          <pre className="bg-gray-50 dark:bg-gray-950 p-4 rounded-md text-xs font-mono">
                            {JSON.stringify(finalResults, null, 2)}
                          </pre>
                        </ScrollArea>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
