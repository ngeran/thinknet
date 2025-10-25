import { useState, useEffect, useCallback, useMemo } from 'react'; // Added useCallback and useMemo for performance/correctness
import { FileCode, Download, Copy, Check, Loader2, ChevronRight, Search, ArrowRight, Upload, CheckCircle2, Circle, AlertCircle, Terminal, Play, Eye, ChevronDown } from 'lucide-react';

// --- UI Component Imports ---
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// --- Shared Component Imports (Note: Assumed existing components use onParamChange) ---
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';

// --- Constants ---
// Define API Base (FastAPI Gateway)
const API_BASE = 'http://localhost:8000/api';
// Define WebSocket Base (Rust Hub/WebSocket Server)
const WS_BASE = 'ws://localhost:3100/ws';

export default function Templates() {
  // --- Core State Hooks ---
  const [categories, setCategories] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetails, setTemplateDetails] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [generatedConfig, setGeneratedConfig] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [expandedCategories, setExpandedCategories] = useState({});

  // --- Device Parameters State ---
  const [parameters, setParameters] = useState({
    hostname: '',
    inventory_file: '',
    username: '',
    password: ''
  });

  // --- Deployment State (Real-Time) ---
  const [deploying, setDeploying] = useState(false);
  // Status will now use backend contract: 'IN_PROGRESS', 'COMPLETE', 'FAILED'
  const [deploymentSteps, setDeploymentSteps] = useState([]);
  const [deploymentResult, setDeploymentResult] = useState(null);
  const [wsConnection, setWsConnection] = useState(null); // Tracks the active WebSocket connection

  // --- Stepper Configuration (Kept from original file) ---
  const steps = [
    { id: 1, name: 'Select Template', icon: FileCode },
    { id: 2, name: 'Configure', icon: Terminal },
    { id: 3, name: 'Review', icon: Eye },
    { id: 4, name: 'Deploy', icon: Play }
  ];

  // --- Data Fetching and Logic ---

  // Fetches template categories
  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      // NOTE: Using the original endpoint from your working file
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      setCategories(data.categories || []);
      setError(null);
    } catch (err) {
      setError('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetches specific template content
  const fetchTemplateDetails = useCallback(async (path) => {
    try {
      setLoading(true);
      // NOTE: Using the original endpoint from your working file
      const response = await fetch(`${API_BASE}/templates/${path}`);
      const data = await response.json();
      setTemplateDetails(data);

      // Reuse original variable extraction logic since your backend returns raw content
      const variables = extractVariables(data.content);
      const initialValues = {};
      variables.forEach(v => initialValues[v] = '');
      setFormValues(initialValues);

      setGeneratedConfig('');
      setDeploymentResult(null);
      setDeploymentSteps([]);
      setError(null);
    } catch (err) {
      setError('Failed to load template details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reused variable extraction logic
  const extractVariables = (content) => {
    const deploymentVars = ['username', 'password', 'hostname', 'inventory_file'];
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const variables = new Set();
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!deploymentVars.includes(match[1])) {
        variables.add(match[1]);
      }
    }
    return Array.from(variables);
  };

  const handleTemplateSelect = (template) => {
    setSelectedTemplate(template);
    fetchTemplateDetails(template.path);
    setCurrentStep(2);
  };

  const handleInputChange = (variable, value) => {
    setFormValues(prev => ({ ...prev, [variable]: value }));
  };

  const handleParamChange = (name, value) => {
    setParameters(prev => ({ ...prev, [name]: value }));
  };

  // Reused configuration generation logic
  const generateConfig = () => {
    if (!templateDetails) return;
    let config = templateDetails.content;
    const allValues = { ...formValues, ...parameters };

    Object.entries(allValues).forEach(([key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g');
      config = config.replace(regex, value || '');
    });

    // Simple Jinja-like block stripping (Kept from original logic)
    config = config.replace(/\{#.*?#\}/gs, '');
    config = config.replace(/\{%\s*if\s+(\w+)\s*%\}(.*?)\{%\s*endif\s*%\}/gs, (match, variable, content) => {
      const variableValue = formValues[variable] || parameters[variable];
      return variableValue ? content : '';
    });
    config = config.replace(/\{%.*?%\}/g, '');
    config = config.split('\n').filter(line => line.trim()).join('\n');

    setGeneratedConfig(config);
    setCurrentStep(3);
  };

  const proceedToDeployment = () => {
    setCurrentStep(4);
  };

  // --- Nested JSON Extraction Logic (Compatible with fastapi_worker.py) ---
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
              console.warn('[TEMPLATES] Failed to parse nested JSON:', jsonMatch[2].substring(0, 200));
            }
          }
        }
      } catch (error) {
        console.warn('[TEMPLATES] Failed to parse data field:', error.message);
      }
    }

    return {
      payload: deepestNestedData || currentPayload,
      isNested: !!deepestNestedData
    };
  };

  // --- REAL-TIME DEPLOYMENT IMPLEMENTATION (Updated with WebSocket Subscription Fix) ---
  const deployTemplate = async () => {
    if (!generatedConfig || (!parameters.hostname && !parameters.inventory_file)) {
      setError('Cannot deploy. Generate configuration and ensure a target device is selected.');
      return;
    }

    // 1. Reset state
    setDeploying(true);
    setDeploymentResult(null);
    setError(null);
    setDeploymentSteps([]);

    // Ensure any previous WS connection is closed before starting a new one
    if (wsConnection) {
      wsConnection.close();
      setWsConnection(null);
    }

    const payload = {
      template_path: selectedTemplate.path,
      config: generatedConfig,
      hostname: parameters.hostname,
      inventory_file: parameters.inventory_file,
      username: parameters.username,
      password: parameters.password,
      template_vars: formValues
    };

    let ws;
    let intendedClose = false; // <-- FLAG TO BYPASS RACE CONDITION IN ONCLOSE

    try {
      // A. Send job request to FastAPI Gateway (returns 202 Accepted)
      const response = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // FIX 1: Allow both 202 (Ideal Async) and 200 (Current Backend Behavior)
      if (response.status !== 202 && response.status !== 200) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Job queuing failed with status ${response.status}.`);
      }

      const queuedJob = await response.json();
      const { job_id, ws_channel } = queuedJob;

      // Initial state update: Job Queued
      setDeploymentSteps([{
        message: `Job ${job_id} successfully queued. Connecting to real-time stream on channel: ${ws_channel}`,
        // NOTE: Using 'IN_PROGRESS' status which maps to the real-time backend contract
        status: 'IN_PROGRESS',
        id: 'job-queue'
      }]);

      // B. Establish WebSocket connection to the Rust Hub
      // FIX: Use correct WebSocket endpoint (without /subscribe)
      ws = new WebSocket(`${WS_BASE}`);
      setWsConnection(ws);

      ws.onopen = () => {
        // 🔑 CRITICAL FIX: Send SUBSCRIBE command after connection is established
        const subscribeCommand = {
          type: 'SUBSCRIBE',
          channel: ws_channel // This should be 'job:config-deploy-UUID'
        };
        ws.send(JSON.stringify(subscribeCommand));

        // Update the queue step to COMPLETE after connection is established
        setDeploymentSteps(prev => prev.map(step =>
          step.id === 'job-queue' ? { ...step, status: 'COMPLETE' } : step
        ));
        setDeploymentSteps(prev => [...prev, {
          message: 'Real-time connection established. Subscribed to job channel.',
          status: 'COMPLETE',
          id: 'ws-connected'
        }]);
        console.log(`Subscribed to job channel: ${ws_channel}`);
      };

      ws.onmessage = (event) => {
        // Debug logging to see raw WebSocket messages
        console.log('[TEMPLATES] Raw WebSocket message received:', event.data);

        // C. Process real-time updates from the worker
        let realTimeData;
        try {
          realTimeData = JSON.parse(event.data);
          console.log('[TEMPLATES] Parsed WebSocket message:', realTimeData);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", event.data, e);
          return;
        }

        // 🔑 CRITICAL FIX: Extract nested progress data from ORCHESTRATOR_LOG wrapper
        // This handles the double-wrapped JSON format produced by fastapi_worker.py
        const { payload: finalPayload, isNested } = extractNestedProgressData(realTimeData);

        // Debug logging (optional)
        console.log('[TEMPLATES] Final payload after extraction:', finalPayload);
        console.log('[TEMPLATES] Event type:', finalPayload.event_type);
        console.log('[TEMPLATES] Was nested:', isNested);

        // Process events using the final extracted payload
        if (finalPayload.event_type === 'STEP_START') {
          setDeploymentSteps(prev => {
            // Mark the last 'IN_PROGRESS' step (if any) as 'COMPLETE' before adding the new one
            const newSteps = prev.map(step =>
              step.status === 'IN_PROGRESS' ? { ...step, status: 'COMPLETE' } : step
            );
            // Add the new step with status 'IN_PROGRESS'
            return [...newSteps, {
              message: finalPayload.message,
              status: 'IN_PROGRESS',
              id: finalPayload.data?.name || `step-${finalPayload.data?.step}`
            }];
          });
        }
        else if (finalPayload.event_type === 'STEP_COMPLETE') {
          // Mark the current in-progress step as COMPLETE (if STEP_START was missed or out of order)
          setDeploymentSteps(prev => prev.map(step =>
            step.status === 'IN_PROGRESS' ? { ...step, status: 'COMPLETE' } : step
          ));
        }
        else if (finalPayload.event_type === 'OPERATION_COMPLETE') {
          const finalStatus = finalPayload.data?.status; // SUCCESS or FAILED
          const finalMessage = finalPayload.message || `Deployment ${finalStatus}.`;

          // Finalize last running step
          setDeploymentSteps(prev => prev.map(step =>
            step.status === 'IN_PROGRESS' ? {
              ...step,
              status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED'
            } : step
          ));

          // Add the final step message
          setDeploymentSteps(prev => [...prev, {
            message: finalMessage,
            status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED',
            id: 'final-result'
          }]);

          // Set the final result state
          setDeploymentResult({
            success: finalStatus === 'SUCCESS',
            message: finalMessage,
            details: finalPayload.data // Full result payload from worker
          });

          setDeploying(false);
          intendedClose = true; // <-- SET FLAG HERE
          ws.close(); // Close connection on completion
        }
        // Also handle ORCHESTRATOR_LOG messages that might contain progress
        else if (finalPayload.event_type === 'ORCHESTRATOR_LOG' && isNested) {
          // This handles cases where we have nested progress events
          console.log('[TEMPLATES] Processing nested progress event:', finalPayload.event_type);
        }
        // Handle raw success messages that might come through
        else if (finalPayload.success !== undefined) {
          const finalStatus = finalPayload.success ? 'SUCCESS' : 'FAILED';
          const finalMessage = finalPayload.message || `Deployment ${finalStatus}.`;

          setDeploymentSteps(prev => [...prev, {
            message: finalMessage,
            status: finalStatus === 'SUCCESS' ? 'COMPLETE' : 'FAILED',
            id: 'final-result'
          }]);

          setDeploymentResult({
            success: finalPayload.success,
            message: finalMessage,
            details: finalPayload
          });

          setDeploying(false);
          intendedClose = true;
          ws.close();
        }
        // Ignore ORCHESTRATOR_LOG or other internal messages for the main progress view
      };

      ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        // Only set error if we weren't intending to close successfully
        if (!intendedClose) {
          setError("Real-time stream connection failed. Check Rust Hub/Worker status.");
        }
        setDeploying(false);
        if (ws) ws.close();
      };

      ws.onclose = () => {
        console.log("WebSocket connection closed.");
        // Only error if the close was not intended by the OPERATION_COMPLETE message
        if (!intendedClose) { // <-- CHECK FLAG HERE
          setError(prev => prev || "Stream closed unexpectedly before job completion. Check logs for details.");
          setDeploying(false);
        }
      };

    } catch (err) {
      console.error('Job Submission Failed:', err);
      setError(err.message || "An error occurred during job submission to FastAPI.");
      setDeploying(false);
      // Clean up connection if it was started but failed during handshake
      if (ws && ws.readyState < 2) ws.close();
    }
  };
  // --- END REAL-TIME DEPLOYMENT IMPLEMENTATION ---

  // --- Helper Functions and Effects ---

  // Effect to fetch templates on component mount
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Effect to close WS connection on component unmount
  useEffect(() => {
    return () => {
      if (wsConnection) {
        wsConnection.close();
      }
    };
  }, [wsConnection]);

  // UI helpers
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(generatedConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadConfig = () => {
    const blob = new Blob([generatedConfig], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTemplate.name.replace('.j2', '')}_config.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredCategories = useMemo(() => {
    return categories.map(category => {
      const filteredTemplates = category.templates.filter(template =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        category.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      return { ...category, templates: filteredTemplates };
    }).filter(category => category.templates.length > 0);
  }, [categories, searchQuery]);

  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  const canProceedToReview = selectedTemplate &&
    (parameters.hostname || parameters.inventory_file) &&
    parameters.username &&
    parameters.password;

  // Custom Icon/Status mapping for Step 4
  const StepIcon = ({ status }) => {
    if (status === 'COMPLETE') return <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
    if (status === 'IN_PROGRESS') return <Loader2 className="w-5 h-5 animate-spin text-black dark:text-white flex-shrink-0" />;
    if (status === 'FAILED') return <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />;
    // Default/Pending status
    return <Circle className="w-5 h-5 text-gray-300 dark:text-gray-700 flex-shrink-0" />;
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-black dark:text-white" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header with Stepper */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white">Template Deployment</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Configure and deploy network templates</p>
            </div>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center space-x-4">
            {steps.map((step, idx) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.id;
              const isComplete = currentStep > step.id;

              return (
                <div key={step.id} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${isComplete ? 'bg-black dark:bg-white border-black dark:border-white' :
                      isActive ? 'border-black dark:border-white bg-white dark:bg-black' :
                        'border-gray-300 dark:border-gray-700 bg-white dark:bg-black'
                      }`}>
                      {isComplete ? (
                        <CheckCircle2 className="w-5 h-5 text-white dark:text-black" />
                      ) : (
                        <StepIcon className={`w-5 h-5 ${isActive ? 'text-black dark:text-white' : 'text-gray-400 dark:text-gray-600'}`} />
                      )}
                    </div>
                    <span className={`text-xs mt-2 font-medium ${isActive || isComplete ? 'text-black dark:text-white' : 'text-gray-400 dark:text-gray-600'
                      }`}>
                      {step.name}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div className={`w-20 h-0.5 mb-6 mx-4 ${currentStep > step.id ? 'bg-black dark:bg-white' : 'bg-gray-300 dark:bg-gray-700'
                      }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 p-4 border border-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Step 1: Template Selection */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {/* Search Bar */}
            <Card className="border-gray-200 dark:border-gray-800">
              <CardContent className="pt-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 border-gray-300 dark:border-gray-700"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Compact Template List */}
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Available Templates</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {categories.reduce((acc, cat) => acc + cat.templates.length, 0)} total
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[calc(100vh-20rem)]">
                  <div className="space-y-1 pr-4">
                    {filteredCategories.map((category) => (
                      <div key={category.name} className="space-y-1">
                        {/* Category Header - Collapsible */}
                        <button
                          onClick={() => toggleCategory(category.name)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-md transition-colors group"
                        >
                          <div className="flex items-center gap-2">
                            {expandedCategories[category.name] ? (
                              <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            )}
                            <h3 className="text-xs font-bold uppercase tracking-wider text-black dark:text-white">
                              {category.name}
                            </h3>
                          </div>
                          <Badge variant="secondary" className="text-xs h-5">
                            {category.templates.length}
                          </Badge>
                        </button>

                        {/* Template Items - Collapsible */}
                        {expandedCategories[category.name] && (
                          <div className="space-y-0.5 pl-6">
                            {category.templates.map((template) => (
                              <button
                                key={template.path}
                                onClick={() => handleTemplateSelect(template)}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-gray-50 dark:hover:bg-gray-900 border border-transparent hover:border-gray-200 dark:hover:border-gray-800 transition-all group text-left"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-gray-100 dark:bg-gray-900 flex items-center justify-center group-hover:bg-black dark:group-hover:bg-white transition-colors">
                                    <FileCode className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-white dark:group-hover:text-black transition-colors" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-black dark:text-white truncate">
                                      {template.name.replace('.j2', '')}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                                      {template.path}
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-black dark:group-hover:text-white flex-shrink-0 ml-2" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {filteredCategories.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Search className="w-12 h-12 text-gray-300 dark:text-gray-700 mb-3" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No templates found matching "{searchQuery}"
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 2: Configuration */}
        {currentStep === 2 && selectedTemplate && (
          <div className="space-y-4">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">{selectedTemplate.name.replace('.j2', '')}</CardTitle>
                    <CardDescription>Configure template parameters and target device</CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => setCurrentStep(1)} size="sm">
                    Change Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Template Parameters */}
                {Object.keys(formValues).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">Template Parameters</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.keys(formValues).map((variable) => (
                        <div key={variable} className="space-y-1.5">
                          <Label htmlFor={variable} className="text-xs font-medium">
                            {variable.replace(/_/g, ' ').toUpperCase()}
                          </Label>
                          <Input
                            id={variable}
                            type="text"
                            value={formValues[variable]}
                            onChange={(e) => handleInputChange(variable, e.target.value)}
                            placeholder={`Enter ${variable.replace(/_/g, ' ')}`}
                            className="border-gray-300 dark:border-gray-700"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="bg-gray-200 dark:bg-gray-800" />

                {/* Target Device */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Target Device</h3>
                  <DeviceTargetSelector
                    parameters={parameters}
                    onParamChange={handleParamChange}
                  />
                </div>

                <Separator className="bg-gray-200 dark:bg-gray-800" />

                {/* Authentication */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Authentication</h3>
                  <DeviceAuthFields
                    parameters={parameters}
                    onParamChange={handleParamChange}
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    onClick={generateConfig}
                    disabled={!canProceedToReview}
                    className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                  >
                    Generate Configuration
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 3: Review Configuration */}
        {currentStep === 3 && generatedConfig && (
          <div className="space-y-4">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Review Configuration</CardTitle>
                    <CardDescription>Verify the generated configuration before proceeding to deployment</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setCurrentStep(2)} size="sm">
                      Back to Edit
                    </Button>
                    <Button onClick={copyToClipboard} variant="outline" size="sm">
                      {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button onClick={downloadConfig} variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Configuration Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Template</div>
                    <div className="text-sm font-medium">{selectedTemplate.name.replace('.j2', '')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target</div>
                    <div className="text-sm font-medium">{parameters.hostname || parameters.inventory_file}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Username</div>
                    <div className="text-sm font-medium">{parameters.username}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Lines</div>
                    <div className="text-sm font-medium">{generatedConfig.split('\n').length}</div>
                  </div>
                </div>

                {/* Configuration Preview */}
                <ScrollArea className="h-96 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <pre className="p-4 text-xs font-mono text-black dark:text-white">
                    {generatedConfig}
                  </pre>
                </ScrollArea>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    onClick={proceedToDeployment}
                    className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                  >
                    Proceed to Deployment
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Step 4: Deploy (Now handles Real-Time Progress) */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <Card className="border-gray-200 dark:border-gray-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Deploy Configuration</CardTitle>
                    <CardDescription>Execute deployment to target device</CardDescription>
                  </div>
                  {!deploying && !deploymentResult && (
                    <Button variant="outline" onClick={() => setCurrentStep(3)} size="sm">
                      Back to Review
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Deployment Summary */}
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Template</div>
                      <div className="text-sm font-medium">{selectedTemplate.name.replace('.j2', '')}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target Device</div>
                      <div className="text-sm font-medium">{parameters.hostname || parameters.inventory_file}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Ready to deploy {generatedConfig.split('\n').length} lines of configuration
                  </div>
                </div>

                {/* Deploy Button */}
                {!deploying && !deploymentResult && (
                  <div className="flex justify-center py-8">
                    <Button
                      onClick={deployTemplate}
                      size="lg"
                      className="bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200"
                    >
                      <Upload className="w-5 h-5 mr-2" />
                      Start Deployment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Deployment Progress */}
            {(deploying || deploymentResult) && (
              <Card className={`border-2 ${deploymentResult?.success ? 'border-green-500' :
                deploymentResult ? 'border-red-500' :
                  'border-gray-200 dark:border-gray-800'
                }`}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {deploymentResult?.success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        Deployment Successful
                      </>
                    ) : deploymentResult?.success === false ? ( // Check explicitly for false
                      <>
                        <AlertCircle className="w-5 h-5 text-red-600" />
                        Deployment Failed
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Deploying Configuration
                      </>
                    )}
                  </CardTitle>
                  {deploymentResult && (
                    <CardDescription>{deploymentResult.message}</CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {deploymentSteps.map((step, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                        {/* Use the new StepIcon helper with backend status names */}
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
                    {/* Visual indicator when still deploying and awaiting new steps */}
                    {deploying && deploymentSteps.length > 0 && deploymentSteps[deploymentSteps.length - 1].status !== 'IN_PROGRESS' && (
                      <div className="flex items-center gap-3 p-3 text-sm text-gray-500 dark:text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Waiting for next step update...</span>
                      </div>
                    )}
                  </div>

                  {deploymentResult && (
                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-800 space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Deployment Details</h4>
                      <ScrollArea className="h-40">
                        <pre className="p-4 text-xs rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 font-mono overflow-auto">
                          {/* Display the full details payload */}
                          {JSON.stringify(deploymentResult.details, null, 2)}
                        </pre>
                      </ScrollArea>

                      {(deploymentResult.success || deploymentResult.success === false) && (
                        <div className="flex justify-center pt-4">
                          <Button
                            onClick={() => {
                              setCurrentStep(1);
                              setSelectedTemplate(null);
                              setGeneratedConfig('');
                              setDeploymentResult(null);
                              setDeploymentSteps([]);
                              if (wsConnection) wsConnection.close(); // Ensure cleanup on reset
                            }}
                            variant="outline"
                          >
                            Deploy Another Template
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
