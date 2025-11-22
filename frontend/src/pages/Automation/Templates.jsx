/**
 * =============================================================================
 * FILE LOCATION: frontend/src/pages/Automation/Templates.jsx
 * DESCRIPTION:   Main UI for Template Deployment. 
 *                FIXED: Diff button visibility and black text styling.
 * =============================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FileCode, Download, Copy, Check, Loader2, Search, ArrowRight, 
  Upload, CheckCircle2, AlertCircle, Terminal, Play, Eye, 
  FileDiff, Bug 
} from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

// Shared & Custom Components
import DeviceAuthFields from '@/shared/DeviceAuthFields';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import LiveLogViewer from '@/components/realTimeProgress/LiveLogViewer';
import ConfigDiff from '@/components/blocks/ConfigDiff';

// Logic Utilities
import { processLogMessage } from '@/lib/logProcessor';

// API Configuration
const API_BASE = 'http://localhost:8000/api';
const WS_BASE = 'ws://localhost:3100/ws';

export default function Templates() {
  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  // Data State
  const [categories, setCategories] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetails, setTemplateDetails] = useState(null);
  const [formValues, setFormValues] = useState({});
  const [generatedConfig, setGeneratedConfig] = useState('');

  // UI State
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Device Configuration
  const [parameters, setParameters] = useState({
    hostname: '',
    inventory_file: '',
    username: '',
    password: ''
  });

  // Deployment & WebSocket State
  const [deploying, setDeploying] = useState(false);
  const [wsConnection, setWsConnection] = useState(null);
  const [deploymentResult, setDeploymentResult] = useState(null);
  
  // Logging & Diff State
  const [logHistory, setLogHistory] = useState([]);
  const [activeStep, setActiveStep] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false); // Controls the "Debug" view

  // Stepper Definitions
  const steps = [
    { id: 1, name: 'Select Template', icon: FileCode },
    { id: 2, name: 'Configure', icon: Terminal },
    { id: 3, name: 'Review', icon: Eye },
    { id: 4, name: 'Deploy', icon: Play }
  ];

  // ===========================================================================
  // LOGIC: CONTEXT DETECTION
  // ===========================================================================
  
  const configContext = useMemo(() => {
    if (!generatedConfig) return "Configuration";
    const lower = generatedConfig.toLowerCase();
    
    if (lower.includes('protocols ospf')) return "OSPF Routing";
    if (lower.includes('protocols bgp')) return "BGP Routing";
    if (lower.includes('ethernet-switching')) return "VLAN/Switching";
    if (lower.includes('interfaces')) return "Interface";
    if (lower.includes('system')) return "System";
    if (lower.includes('security policies')) return "Security Policy";
    if (lower.includes('firewall')) return "Firewall Filter";
    
    return "Device"; 
  }, [generatedConfig]);

  // ===========================================================================
  // DATA FETCHING & PARSING
  // ===========================================================================

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates`);
      const data = await response.json();
      setCategories(data.categories || []);
      setError(null);
    } catch (err) {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplateDetails = useCallback(async (path) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/templates/${path}`);
      const data = await response.json();
      setTemplateDetails(data);

      const variables = extractVariables(data.content);
      const initialValues = {};
      variables.forEach(v => initialValues[v] = '');
      setFormValues(initialValues);

      // Reset downstream state
      setGeneratedConfig('');
      setDeploymentResult(null);
      setLogHistory([]);
      setDiffData(null);
      setActiveStep(null);
      setShowTechnical(false);
      setError(null);
    } catch (err) {
      setError('Failed to load template details');
    } finally {
      setLoading(false);
    }
  }, []);

  const extractVariables = (content) => {
    const deploymentVars = ['username', 'password', 'hostname', 'inventory_file'];
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const variables = new Set();
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (!deploymentVars.includes(match[1])) variables.add(match[1]);
    }
    return Array.from(variables);
  };

  // ===========================================================================
  // EVENT HANDLERS
  // ===========================================================================

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

  const generateConfig = () => {
    if (!templateDetails) return;
    let config = templateDetails.content;
    const allValues = { ...formValues, ...parameters };

    // Jinja2 Processing
    config = config.replace(/\{%\s*if\s+(\w+)\s*%\}(.*?)(?:\{%\s*else\s*%\}(.*?))?\{%\s*endif\s*%\}/gs,
      (match, variable, ifContent, elseContent) => {
        return (formValues[variable] || parameters[variable]) ? (ifContent || '') : (elseContent || '');
      }
    );

    Object.entries(allValues).forEach(([key, value]) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      config = config.replace(new RegExp(`\\{\\{\\s*${escapedKey}\\s*\\}\\}`, 'g'), value || '');
    });

    config = config.replace(/\{#.*?#\}/gs, '').replace(/\{%.*?%\}/g, '');
    config = config.split('\n').filter(line => line.trim()).join('\n');
    
    setGeneratedConfig(config);
    setCurrentStep(3);
  };

  // ===========================================================================
  // DEPLOYMENT & WEBSOCKET LOGIC (Fix for Diff Data)
  // ===========================================================================

  const deployTemplate = async () => {
    if (!generatedConfig || (!parameters.hostname && !parameters.inventory_file)) {
      setError('Cannot deploy. Generate configuration and ensure a target device is selected.');
      return;
    }

    setDeploying(true);
    setDeploymentResult(null);
    setError(null);
    setLogHistory([]);
    setDiffData(null);
    setActiveStep("Initializing connection...");

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
    let intendedClose = false;

    try {
      const response = await fetch(`${API_BASE}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.status !== 202 && response.status !== 200) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Job failed with status ${response.status}.`);
      }

      const queuedJob = await response.json();
      const { ws_channel } = queuedJob;

      ws = new WebSocket(`${WS_BASE}`);
      setWsConnection(ws);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE', channel: ws_channel }));
        setLogHistory(prev => [...prev, processLogMessage({ 
          message: `Connected to channel: ${ws_channel}`, 
          event_type: 'SYSTEM_INFO' 
        })]);
      };

      ws.onmessage = (event) => {
        const normalizedLog = processLogMessage(event.data);
        setLogHistory(prev => [...prev, normalizedLog]);

        // ----------------------------------------------------------------
        // 🌟 CRITICAL FIX: Correctly extract DIFF data from details object
        // ----------------------------------------------------------------
        if (normalizedLog.originalEvent.event_type === 'STEP_COMPLETE') {
             const stepData = normalizedLog.originalEvent.data;
             
             // Check both 'diff' direct property AND 'details.diff'
             const potentialDiff = stepData.diff || stepData.details?.diff;
             
             if (potentialDiff) {
                 console.log("[UI] Diff received:", potentialDiff.substring(0, 50) + "...");
                 setDiffData(potentialDiff);
             }
        }

        // Update Status Bar Message
        if (normalizedLog.type === 'STEP_PROGRESS') {
          const cleanMsg = normalizedLog.message.replace(/^Step \d+: /, '');
          setActiveStep(cleanMsg);
        }

        // Check Completion
        const originalEvent = normalizedLog.originalEvent;
        if (originalEvent.event_type === 'OPERATION_COMPLETE') {
          const success = originalEvent.data?.status === 'SUCCESS';
          setDeploymentResult({
            success,
            message: normalizedLog.message,
            details: originalEvent.data
          });
          setDeploying(false);
          intendedClose = true;
          ws.close();
        }
        else if (originalEvent.success !== undefined) {
            setDeploymentResult({
                success: originalEvent.success,
                message: originalEvent.message || "Deployment Finished",
                details: originalEvent
            });
            setDeploying(false);
            intendedClose = true;
            ws.close();
        }
      };

      ws.onerror = (err) => {
        if (!intendedClose) setError("Real-time connection failed.");
        setDeploying(false);
      };

      ws.onclose = () => {
        if (!intendedClose) {
          setLogHistory(prev => [...prev, processLogMessage({ 
            message: "Connection closed unexpectedly.", 
            event_type: 'ERROR' 
          })]);
        }
      };

    } catch (err) {
      setError(err.message);
      setDeploying(false);
    }
  };

  // ===========================================================================
  // UTILITIES & EFFECTS
  // ===========================================================================

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
    let filtered = categories;
    if (selectedCategory) filtered = filtered.filter(cat => cat.name === selectedCategory);
    if (searchQuery) {
      filtered = filtered.map(category => ({
        ...category,
        templates: category.templates.filter(t => 
          t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          category.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(cat => cat.templates.length > 0);
    }
    return filtered;
  }, [categories, searchQuery, selectedCategory]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);
  useEffect(() => { return () => { if (wsConnection) wsConnection.close(); }; }, [wsConnection]);

  if (loading && categories.length === 0) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* HEADER */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-black dark:text-white">Template Deployment</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Configure and deploy network templates</p>
            </div>
          </div>
          {/* Steps */}
          <div className="flex items-center justify-center space-x-4">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  currentStep === step.id || currentStep > step.id 
                  ? 'bg-black dark:bg-white border-black dark:border-white text-white dark:text-black' 
                  : 'border-gray-300 text-gray-400'
                }`}>
                  {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : <step.icon className="w-5 h-5" />}
                </div>
                <span className={`text-xs mt-2 ml-2 font-medium hidden md:block ${currentStep === step.id ? 'text-black dark:text-white' : 'text-gray-400'}`}>{step.name}</span>
                {idx < steps.length - 1 && <div className="w-12 h-0.5 bg-gray-300 mx-2 hidden md:block" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 p-4 border border-red-500 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> <p className="text-sm">{error}</p>
          </div>
        )}

        {/* STEP 1: SELECTION */}
        {currentStep === 1 && (
          <div className="flex gap-6 h-[calc(100vh-20rem)]">
            <div className="w-64 flex-shrink-0 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="Search templates..." 
                  value={searchQuery} 
                  onChange={(e) => { setSearchQuery(e.target.value); setSelectedCategory(null); }} 
                  className="pl-9"
                />
              </div>
              <Card className="h-[calc(100%-3rem)]">
                <CardContent className="p-0">
                  <ScrollArea className="h-[calc(100vh-28rem)]">
                    <div className="p-2 space-y-1">
                      <Button 
                        variant="ghost" 
                        className={`w-full justify-start ${!selectedCategory ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                        onClick={() => setSelectedCategory(null)}
                      >
                        All Templates
                      </Button>
                      {categories.map((cat) => (
                        <Button
                          key={cat.name}
                          variant="ghost"
                          className={`w-full justify-start justify-between ${selectedCategory === cat.name ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                          onClick={() => setSelectedCategory(cat.name)}
                        >
                          <span>{cat.name}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{cat.templates.length}</Badge>
                        </Button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <div className="flex-1">
               <Card className="h-full flex flex-col border-0 shadow-none">
                 <ScrollArea className="h-full">
                   <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
                     {filteredCategories.map(cat => cat.templates.map(template => (
                       <button
                         key={template.path}
                         onClick={() => handleTemplateSelect(template)}
                         className="group relative p-5 text-left border-2 border-gray-200 dark:border-gray-800 rounded-lg hover:border-black dark:hover:border-white transition-all bg-white dark:bg-black hover:shadow-md"
                       >
                         <div className="absolute top-4 right-4 p-2 rounded bg-gray-100 dark:bg-gray-900 group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-colors">
                           <FileCode className="w-4 h-4" />
                         </div>
                         <div className="mt-4">
                           <h4 className="font-semibold truncate pr-8">{template.name.replace('.j2', '')}</h4>
                           <p className="text-xs text-gray-500 font-mono mt-1 truncate">{cat.name}</p>
                           <div className="flex items-center gap-1 text-xs font-medium mt-4 text-gray-400 group-hover:text-black dark:group-hover:text-white">
                             Configure <ArrowRight className="w-3 h-3" />
                           </div>
                         </div>
                       </button>
                     )))}
                   </div>
                 </ScrollArea>
               </Card>
            </div>
          </div>
        )}

        {/* STEP 2: CONFIGURATION */}
        {currentStep === 2 && selectedTemplate && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle>{selectedTemplate.name.replace('.j2', '')}</CardTitle>
                        <CardDescription>Configure variables and target device</CardDescription>
                    </div>
                    <Button variant="outline" onClick={() => setCurrentStep(1)} size="sm">Change Template</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.keys(formValues).length > 0 ? (
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Terminal className="w-4 h-4" /> Template Variables
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-800">
                            {Object.keys(formValues).map((varName) => (
                                <div key={varName} className="space-y-1.5">
                                    <Label htmlFor={varName} className="text-xs font-bold uppercase text-gray-500 tracking-wide">
                                        {varName.replace(/_/g, ' ')}
                                    </Label>
                                    <Input
                                        id={varName}
                                        value={formValues[varName] || ''}
                                        onChange={(e) => handleInputChange(varName, e.target.value)}
                                        placeholder={`Value for {{ ${varName} }}`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="p-4 bg-blue-50 text-blue-700 rounded-lg text-sm flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4"/> No variables detected in this template.
                    </div>
                )}
                <Separator />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DeviceTargetSelector parameters={parameters} onParamChange={handleParamChange} />
                    <DeviceAuthFields parameters={parameters} onParamChange={handleParamChange} />
                </div>
                <div className="flex justify-end pt-4">
                  <Button onClick={generateConfig} disabled={!selectedTemplate}>
                    Generate Configuration <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 3: REVIEW */}
        {currentStep === 3 && generatedConfig && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex justify-between">
                  <CardTitle>Review Configuration</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentStep(2)}>Back to Edit</Button>
                    <Button variant="outline" size="sm" onClick={copyToClipboard}>
                        {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />} Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadConfig}><Download className="w-4 h-4 mr-1"/> Download</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96 w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <pre className="p-4 text-xs font-mono text-black dark:text-white">{generatedConfig}</pre>
                </ScrollArea>
                <div className="flex justify-end gap-2 pt-4">
                  <Button onClick={() => setCurrentStep(4)}>Proceed to Deployment <ArrowRight className="w-4 h-4 ml-2" /></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* STEP 4: DEPLOY */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Deploy Configuration</CardTitle>
                <CardDescription>
                   {!deploying && !deploymentResult 
                     ? "Review the execution plan and confirm to proceed." 
                     : "Configuration deployment in progress."}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="space-y-6">
                {/* 1. Execution Plan */}
                {!deploying && !deploymentResult && (
                  <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3">
                     <div className="flex items-center gap-2 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                        <Terminal className="w-4 h-4" /> Execution Plan
                     </div>
                     <ul className="text-sm space-y-2 text-zinc-600 dark:text-zinc-400 list-disc pl-5">
                        <li>Check connectivity to <strong>{parameters.hostname || parameters.inventory_file}</strong></li>
                        <li>Lock configuration database</li>
                        <li>Load <strong>{configContext}</strong> configuration ({generatedConfig.split('\n').length} lines)</li>
                        <li><strong>Calculate and display diff</strong></li>
                        <li>Validate syntax (Commit Check)</li>
                        <li>Commit changes to active configuration</li>
                     </ul>
                     <div className="flex justify-center pt-4">
                        <Button onClick={deployTemplate} size="lg" className="bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black">
                          <Upload className="w-5 h-5 mr-2" /> Confirm & Deploy
                        </Button>
                     </div>
                  </div>
                )}

                {/* 2. STATUS BAR */}
                {(deploying || deploymentResult) && (
                   <div className={`flex flex-col md:flex-row items-center justify-between p-4 rounded-lg border gap-4 ${
                        deploymentResult?.success ? 'bg-green-50 border-green-200 text-green-700' : 
                        deploymentResult?.success === false ? 'bg-red-50 border-red-200 text-red-700' : 
                        'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300'
                   }`}>
                      <div className="flex items-center gap-3 w-full md:w-auto">
                          {deploying ? <Loader2 className="animate-spin w-5 h-5" /> : 
                           deploymentResult?.success ? <CheckCircle2 className="w-5 h-5" /> : 
                           <AlertCircle className="w-5 h-5" />}
                          <span className="font-medium truncate">
                            {deploying ? (activeStep || "Initializing...") : deploymentResult?.message}
                          </span>
                      </div>
                      
                      {/* ACTION TOOLBAR: DIFF & DEBUG */}
                      <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                          {/* VIEW CHANGES BUTTON */}
                          {diffData && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => setShowDiff(true)}
                              className="bg-white dark:bg-black hover:bg-gray-100 border-zinc-300 text-zinc-900"
                            >
                              <FileDiff className="w-4 h-4 mr-2" /> 
                              Changes
                            </Button>
                          )}
                          
                          {/* DEBUG BUTTON */}
                          <Button
                            variant={showTechnical ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => setShowTechnical(!showTechnical)}
                            className={`border-zinc-300 ${showTechnical 
                              ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-900" 
                              : "bg-white dark:bg-black text-zinc-600"}`}
                            title="Toggle Raw/Technical Logs"
                          >
                             <Bug className={`w-4 h-4 ${showTechnical ? "text-blue-600" : "text-current"}`} />
                             <span className="ml-2 hidden md:inline">Debug</span>
                          </Button>
                      </div>
                   </div>
                )}

                {/* 3. LIVE LOGS */}
                {(deploying || deploymentResult) && (
                  <LiveLogViewer 
                    logs={logHistory} 
                    isConnected={!!wsConnection} 
                    height="h-96"
                    title="Deployment Logs"
                    showTechnical={showTechnical}
                  />
                )}

                {/* 4. RESET */}
                {deploymentResult && (
                  <div className="pt-2">
                    <Button variant="ghost" onClick={() => setCurrentStep(1)} className="w-full text-gray-500">
                      Start New Deployment
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* DIFF MODAL */}
            <ConfigDiff 
              diff={diffData} 
              isOpen={showDiff} 
              onClose={() => setShowDiff(false)} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
