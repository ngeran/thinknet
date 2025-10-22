// =========================================================================================
//
// COMPONENT:          Validation.jsx (Redesigned)
// OVERVIEW:           Modern validation UI with improved test discovery and layout
//
// =========================================================================================
import React, { useState, useEffect, useRef } from 'react';
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
  X
} from 'lucide-react';

// Shared components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';

// Progress Components
import EnhancedProgressBar from '@/components/realTimeProgress/EnhancedProgressBar';
import EnhancedProgressStep from '@/components/realTimeProgress/EnhancedProgressStep';

// Custom Hooks
import { useJobWebSocket } from '@/hooks/useJobWebSocket';
import { useTestDiscovery } from '@/hooks/useTestDiscovery';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Test Selection Panel Component
 */
function TestSelectionPanel({ categorizedTests, selectedTests, onTestToggle, testsLoading, testsError }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Keep categories collapsed initially to save space
  // They will expand when user clicks or searches

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
            {selectedTests.slice(0, 8).map(testPath => {
              const fileName = testPath.split('/').pop();
              return (
                <Badge key={testPath} variant="secondary" className="text-xs">
                  {fileName}
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
                    {tests.filter(t => selectedTests.includes(t.path)).length} selected
                  </Badge>
                </button>

                {expandedCategories.has(category) && (
                  <div className="p-3 grid grid-cols-1 gap-2">
                    {tests.map((test) => {
                      const isSelected = selectedTests.includes(test.path);
                      return (
                        <label
                          key={test.path}
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
                            onChange={() => onTestToggle(test.path)}
                            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-xs font-mono font-medium">{test.name}</code>
                              {isSelected && (
                                <CheckCircle className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              )}
                            </div>
                            {test.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {test.description}
                              </p>
                            )}
                            {test.display_hints?.type && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {test.display_hints.type}
                              </Badge>
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

/**
 * Main Validation Component
 */
export default function Validation() {
  const [validationParams, setValidationParams] = useState({
    username: "",
    password: "",
    hostname: "",
    inventory_file: "",
    tests: []
  });

  const [activeTab, setActiveTab] = useState("config");
  const [jobStatus, setJobStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [jobOutput, setJobOutput] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [wsChannel, setWsChannel] = useState(null);
  const [finalResults, setFinalResults] = useState(null);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);

  const processedStepsRef = useRef(new Set());
  const latestStepMessageRef = useRef("");
  const loggedMessagesRef = useRef(new Set());
  const scrollAreaRef = useRef(null);

  const { sendMessage, lastMessage, isConnected } = useJobWebSocket();
  const { categorizedTests, loading: testsLoading, error: testsError } = useTestDiscovery("validation");

  const handleParamChange = (name, value) => {
    setValidationParams(prev => ({ ...prev, [name]: value }));
  };

  const handleTestToggle = (testPath) => {
    const currentTests = Array.isArray(validationParams.tests) ? validationParams.tests : [];
    const updatedTests = currentTests.includes(testPath)
      ? currentTests.filter(t => t !== testPath)
      : [...currentTests, testPath];
    handleParamChange('tests', updatedTests);
  };

  const resetWorkflow = () => {
    if (wsChannel) {
      sendMessage({ type: 'UNSUBSCRIBE', channel: wsChannel });
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
    loggedMessagesRef.current.clear();
  };

  const startValidationExecution = async (e) => {
    e.preventDefault();

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

    if (!isConnected) {
      alert("WebSocket not connected. Cannot start validation.");
      setJobStatus("failed");
      setActiveTab("results");
      return;
    }

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
    setCompletedSteps(0);
    setTotalSteps(0);
    processedStepsRef.current.clear();
    latestStepMessageRef.current = "";
    loggedMessagesRef.current.clear();

    const payload = {
      command: "validation",
      hostname: validationParams.hostname?.trim() || "",
      inventory_file: validationParams.inventory_file?.trim() || "",
      username: validationParams.username,
      password: validationParams.password,
      tests: validationParams.tests,
    };

    Object.keys(payload).forEach(key => {
      if (payload[key] === "" || payload[key] == null) {
        delete payload[key];
      }
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
        sendMessage({ type: 'SUBSCRIBE', channel: data.ws_channel });
      } else {
        throw new Error('Invalid response: missing job_id or ws_channel');
      }
    } catch (error) {
      setJobOutput(prev => [...prev, {
        timestamp: new Date().toISOString(),
        message: `Validation start failed: ${error.message}`,
        level: 'error'
      }]);
      setJobStatus("failed");
      setActiveTab("results");
    }
  };

  useEffect(() => {
    if (!lastMessage || !jobId) return;
    // Add your existing WebSocket handling logic here
  }, [lastMessage, jobId]);

  const isRunning = jobStatus === 'running';
  const isComplete = jobStatus === 'success';
  const hasError = jobStatus === 'failed';

  const isFormValid =
    validationParams.username?.trim() &&
    validationParams.password?.trim() &&
    (validationParams.hostname?.trim() || validationParams.inventory_file?.trim()) &&
    validationParams.tests && validationParams.tests.length > 0;

  return (
    <div className="p-8 pt-6">
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
                      disabled={!isFormValid || jobStatus !== 'idle' || !isConnected}
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

        <TabsContent value="execute">
          <div className="space-y-6 p-4 border rounded-lg max-w-6xl">
            <h2 className="text-xl font-semibold mb-4">Validation Progress</h2>
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
                    Waiting for validation to start...
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
          <div className="space-y-6 max-w-6xl">
            <Card className={`border-2 ${jobStatus === 'success' ? 'border-green-200 bg-green-50' :
                jobStatus === 'failed' ? 'border-red-200 bg-red-50' :
                  'border-gray-200'
              }`}>
              <CardContent className="pt-6">
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
                      {jobStatus === 'success' ? 'Validation Completed Successfully' :
                        jobStatus === 'failed' ? 'Validation Failed' :
                          'Awaiting Execution'}
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      {finalResults?.message || 'No results available yet'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
