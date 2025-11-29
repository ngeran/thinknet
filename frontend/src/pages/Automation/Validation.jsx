/**
 * =========================================================================================
 * FILE:                  Validation.jsx
 * LOCATION:              frontend/src/pages/Automation/Validation.jsx
 * PURPOSE:               JSNAPy validation workflow component with step-based UI
 *
 * UI PATTERN: Matches Templates.jsx step-based wizard design
 * STEPS: 1. Test Selection → 2. Device Configuration → 3. Execute → 4. Results
 * =========================================================================================
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    CheckCircle2, Search, ArrowRight, Loader2, Bug, FileText,
    AlertCircle, PlayCircle, Terminal, ListChecks, Eye
} from 'lucide-react';

// UI Components
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';

// Shared Components
import DeviceAuthFields from '../../shared/DeviceAuthFields';
import DeviceTargetSelector from '../../shared/DeviceTargetSelector';
import TableDisplay from '../../shared/TableDisplay';
import LiveLogViewer from '../../components/realTimeProgress/LiveLogViewer';
import ValidationReport from './ValidationReport';

// Custom Hooks & Utils
import { useTestDiscovery } from '../../hooks/useTestDiscovery';
import { useJobWebSocket } from '../../hooks/useJobWebSocket';
import { processLogMessage } from '../../lib/logProcessor';

// API Configuration
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
const WS_BASE = 'ws://localhost:3100/ws';

// Step configuration
const steps = [
    { id: 1, name: 'Select Tests', icon: ListChecks },
    { id: 2, name: 'Configure Device', icon: Bug },
    { id: 3, name: 'Execute', icon: PlayCircle },
    { id: 4, name: 'Results', icon: Eye }
];

export default function Validation() {
    console.log('🚀 [Validation] Component mounted');

    // Test Discovery
    const {
        categorizedTests,
        testsLoading,
        testsError,
        refreshTests
    } = useTestDiscovery('validation');

    // Step navigation
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form state
    const [selectedTests, setSelectedTests] = useState([]);
    const [parameters, setParameters] = useState({
        hostname: '',
        username: 'admin',
        password: ''
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [selectedCategory, setSelectedCategory] = useState('all');

    // Job state
    const [jobId, setJobId] = useState(null);
    const [validationResults, setValidationResults] = useState(null);

    // Execution state
    const [isValidating, setIsValidating] = useState(false);
    const [validationProgress, setValidationProgress] = useState(0);
    const [validationComplete, setValidationComplete] = useState(false);
    const [validationLogs, setValidationLogs] = useState([]);
    const [activeValidationStep, setActiveValidationStep] = useState('');

    // WebSocket Connection using centralized service
    const { lastMessage, isConnected, sendMessage } = useJobWebSocket();

    // Subscribe to job-specific channel when jobId changes
    useEffect(() => {
        if (!jobId || !sendMessage) return;

        const ws_channel = `job:${jobId}`;
        console.log('🔗 [Validation] Subscribing to WebSocket channel:', ws_channel);

        // Send subscription message
        const subscriptionMessage = {
            type: 'SUBSCRIBE',
            channel: ws_channel
        };

        sendMessage(subscriptionMessage);

    }, [jobId, sendMessage]);

    // Process WebSocket messages
    useEffect(() => {
        if (!lastMessage || !jobId) return;

        console.log('🔍 [Validation] Processing WebSocket message:', lastMessage);

        try {
            let messageData = lastMessage;
            if (typeof lastMessage === 'string') {
                messageData = JSON.parse(lastMessage);
            }

            // Filter messages for our job
            const isJobMessage = messageData.job_id === jobId ||
                                 (messageData.channel && messageData.channel.includes(jobId));

            if (!isJobMessage) return;

            console.log('🔍 [Validation] Processing job message:', messageData);

            // Use the centralized log processor to handle nested JSON and normalization
            let normalizedLog;
            try {
                normalizedLog = processLogMessage(messageData);
            } catch (processorError) {
                console.error('❌ [Validation] Log processor error:', processorError);
                // Create a fallback log entry
                normalizedLog = {
                    id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    timestamp: new Date().toLocaleTimeString(),
                    type: 'INFO',
                    message: 'Processing validation message...',
                    isTechnical: false,
                    originalEvent: messageData
                };
            }
            setValidationLogs(prev => [...prev, normalizedLog]);

            const originalEvent = normalizedLog.originalEvent;

            // Handle different log types from the processor
            if (normalizedLog.type === 'STEP_PROGRESS') {
                const stepName = normalizedLog.message.replace(/^Step \d+: /, '');
                setActiveValidationStep(stepName);
            }

            // Progress updates (if any)
            if (originalEvent?.data?.progress !== undefined) {
                const progress = parseFloat(originalEvent.data.progress);
                if (!isNaN(progress) && progress >= 0 && progress <= 100) {
                    setValidationProgress(progress);
                }
            }

            // Storage validation passed - show success and store results
            if (normalizedLog.type === 'SUCCESS' && originalEvent?.event_type === 'PRE_CHECK_COMPLETE') {
                console.log('✅ [Validation] Pre-check completed successfully');
                setActiveValidationStep('Storage validation passed');

                // Store results for display in Step 4
                if (originalEvent.data) {
                    setValidationResults(originalEvent.data);
                }
            }

            // Job completion - transition to results
            if (originalEvent?.status === 'finished' || originalEvent?.type === 'job_status') {
                console.log('🎉 [Validation] Validation completed successfully');
                setValidationComplete(true);
                setIsValidating(false);
                setValidationProgress(100);
                setCurrentStep(4);
            }

            // Error handling
            if (normalizedLog.type === 'ERROR') {
                console.log('❌ [Validation] Validation failed');
                setError(normalizedLog.message || 'Validation failed');
                setIsValidating(false);
                setValidationComplete(true);
            }

        } catch (error) {
            console.error('❌ [Validation] Error processing message:', error);
        }
    }, [lastMessage, jobId]);

    // Parameter change handler
    const handleParamChange = (name, value) => {
        setParameters(prev => ({ ...prev, [name]: value }));
    };

    // Test selection handlers
    const toggleCategory = (category) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(category)) {
            newExpanded.delete(category);
        } else {
            newExpanded.add(category);
        }
        setExpandedCategories(newExpanded);
    };

    const toggleTestSelection = (testPath) => {
        setSelectedTests(prev => {
            if (prev.includes(testPath)) {
                return prev.filter(t => t !== testPath);
            } else {
                return [...prev, testPath];
            }
        });
    };

    const selectAllTestsInCategory = (category) => {
        const categoryTests = categorizedTests[category] || [];
        const categoryPaths = categoryTests.map(test => test.path);

        setSelectedTests(prev => {
            const newSelection = prev.filter(t => !categoryPaths.includes(t));
            return [...newSelection, ...categoryPaths];
        });
    };

    // Filter tests
    const filteredTests = useMemo(() => {
        let filtered = { ...categorizedTests };

        if (selectedCategory !== 'all') {
            filtered = { [selectedCategory]: categorizedTests[selectedCategory] || [] };
        }

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

        return filtered;
    }, [categorizedTests, selectedCategory, searchQuery]);

    const allCategories = useMemo(() => {
        return Object.keys(categorizedTests);
    }, [categorizedTests]);

    const totalTests = useMemo(() => {
        return Object.values(categorizedTests).flat().length;
    }, [categorizedTests]);

    // Execute validation
    const executeValidation = async () => {
        if (!parameters.hostname || selectedTests.length === 0) {
            setError('Please enter hostname and select at least one test');
            return;
        }

        try {
            setIsValidating(true);
            setError(null);
            setValidationResults(null);
            setValidationLogs([]);
            setValidationProgress(0);

            console.log('🚀 [Validation] Starting validation execution');

            const response = await fetch(`${API_URL}/api/operations/validation/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    hostname: parameters.hostname,
                    username: parameters.username,
                    password: parameters.password,
                    tests: selectedTests,
                    mode: 'check',
                    tag: 'validation'
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ [Validation] Job started:', data);

            setJobId(data.job_id);

        } catch (error) {
            console.error('❌ [Validation] Error starting validation:', error);
            setError(error.message);
            setIsValidating(false);
        }
    };

    // Reset validation
    const resetValidation = () => {
        setJobId(null);
        setValidationProgress(0);
        setIsValidating(false);
        setValidationComplete(false);
        setError(null);
        setValidationLogs([]);
        setActiveValidationStep('');
        setValidationResults(null);
        setCurrentStep(1);
    };

    // Loading state
    if (loading && Object.keys(categorizedTests).length === 0) {
        return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    return (
        <div className="min-h-screen bg-white dark:bg-black">
            {/* HEADER */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-black dark:text-white">JSNAPy Validation</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Run network validation tests using JSNAPy automation</p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={refreshTests}
                                disabled={testsLoading}
                            >
                                {testsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
                                Refresh Tests
                            </Button>
                            {jobId && (
                                <Button variant="outline" onClick={resetValidation}>
                                    Reset
                                </Button>
                            )}
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
                {/* Error Display */}
                {(testsError || error) && (
                    <div className="mb-4 p-4 border border-red-500 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <p className="text-sm">{testsError || error}</p>
                    </div>
                )}

                {/* STEP 1: TEST SELECTION */}
                {currentStep === 1 && (
                    <div className="space-y-6">
                        {/* Navigation Button - Moved to top */}
                        <div className="flex justify-end">
                            <Button
                                onClick={() => setCurrentStep(2)}
                                disabled={selectedTests.length === 0}
                                className="bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black"
                            >
                                Configure Device <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>

                        <div className="flex gap-6 h-[calc(100vh-24rem)]">
                        {/* Test Categories */}
                        <Card className="w-1/3">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-5 h-5" />
                                    Test Categories
                                </CardTitle>
                                <CardDescription>
                                    Choose validation tests to execute ({selectedTests.length} of {totalTests} selected)
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* Search */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                    <Input
                                        placeholder="Search tests..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9"
                                    />
                                </div>

                                {/* Category Filter */}
                                <div className="flex flex-wrap gap-1">
                                    <Badge
                                        variant={selectedCategory === 'all' ? 'default' : 'outline'}
                                        className="cursor-pointer"
                                        onClick={() => setSelectedCategory('all')}
                                    >
                                        All ({totalTests})
                                    </Badge>
                                    {allCategories.map(category => (
                                        <Badge
                                            key={category}
                                            variant={selectedCategory === category ? 'default' : 'outline'}
                                            className="cursor-pointer"
                                            onClick={() => setSelectedCategory(category)}
                                        >
                                            {category} ({(categorizedTests[category] || []).length})
                                        </Badge>
                                    ))}
                                </div>

                                {/* Test List */}
                                <ScrollArea className="h-96 border rounded-md p-3">
                                    {testsLoading ? (
                                        <div className="flex items-center justify-center h-32">
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {Object.entries(filteredTests).map(([category, tests]) => (
                                                <div key={category} className="space-y-1">
                                                    <div className="flex items-center justify-between">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => toggleCategory(category)}
                                                            className="p-1 h-auto font-medium"
                                                        >
                                                            {expandedCategories.has(category) ?
                                                                <span className="mr-1">▼</span> :
                                                                <span className="mr-1">▶</span>
                                                            }
                                                            {category} ({tests.length})
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => selectAllTestsInCategory(category)}
                                                        >
                                                            Select All
                                                        </Button>
                                                    </div>
                                                    {expandedCategories.has(category) && (
                                                        <div className="ml-4 space-y-1">
                                                            {tests.map(test => (
                                                                <div
                                                                    key={test.path}
                                                                    className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                                                                    onClick={() => toggleTestSelection(test.path)}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedTests.includes(test.path)}
                                                                        onChange={() => {}} // Handled by div click
                                                                        className="rounded"
                                                                    />
                                                                    <div className="flex-1">
                                                                        <div className="font-medium text-sm">
                                                                            {test.name}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500">
                                                                            {test.description}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </CardContent>
                        </Card>

                        {/* Selected Tests Preview */}
                        <Card className="w-2/3">
                            <CardHeader>
                                <CardTitle>Selected Tests Preview</CardTitle>
                                <CardDescription>
                                    Tests that will be executed on the target device ({selectedTests.length} selected)
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {selectedTests.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium">{selectedTests.length} tests selected:</div>
                                        <ScrollArea className="h-96 border rounded-md p-3">
                                            {selectedTests.map(testPath => {
                                                const test = Object.values(categorizedTests).flat().find(t => t.path === testPath);
                                                return (
                                                    <div key={testPath} className="p-2 border-b last:border-b-0">
                                                        <div className="font-medium text-sm">{test?.name || testPath}</div>
                                                        <div className="text-xs text-gray-500">{testPath}</div>
                                                    </div>
                                                );
                                            })}
                                        </ScrollArea>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-gray-500">
                                        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                                        <p>No tests selected</p>
                                        <p className="text-sm">Select tests from the categories on the left</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        </div>
                    </div>
                )}

                {/* STEP 2: DEVICE CONFIGURATION */}
                {currentStep === 2 && (
                    <div className="w-full">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Bug className="w-5 h-5" />
                                    Device Configuration
                                </CardTitle>
                                <CardDescription>
                                    Configure target device and credentials for validation
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <DeviceTargetSelector
                                        parameters={parameters}
                                        onParamChange={handleParamChange}
                                    />
                                    <DeviceAuthFields
                                        parameters={parameters}
                                        onParamChange={handleParamChange}
                                    />
                                </div>

                                {/* Execution Plan */}
                                <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-3">
                                    <div className="flex items-center gap-2 font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                                        <Terminal className="w-4 h-4" /> Execution Plan
                                    </div>
                                    <ul className="text-sm space-y-2 text-zinc-600 dark:text-zinc-400 list-disc pl-5">
                                        <li>Connect to <strong>{parameters.hostname || 'target device'}</strong></li>
                                        <li>Execute <strong>{selectedTests.length}</strong> validation tests</li>
                                        <li>Collect and analyze results</li>
                                        <li>Generate validation report</li>
                                    </ul>
                                </div>

                                <div className="flex justify-between pt-4">
                                    <Button variant="outline" onClick={() => setCurrentStep(1)}>
                                        Back to Test Selection
                                    </Button>
                                    <Button
                                        onClick={() => setCurrentStep(3)}
                                        disabled={!parameters.hostname || selectedTests.length === 0}
                                    >
                                        Proceed to Execute <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* STEP 3: EXECUTE */}
                {currentStep === 3 && (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <PlayCircle className="w-5 h-5" />
                                    Execute Validation
                                </CardTitle>
                                <CardDescription>
                                    {!isValidating && !validationComplete
                                        ? "Ready to execute validation tests"
                                        : "Validation execution in progress"}
                                </CardDescription>
                            </CardHeader>

                            <CardContent className="space-y-6">
                                {!isValidating && !validationComplete && (
                                    <div className="space-y-6">
                                        {/* Execution Summary */}
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
                                            <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                                                <FileText className="w-5 h-5" />
                                                Execution Summary
                                            </h4>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">Tests to Run</div>
                                                    <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                                                        {selectedTests.length}
                                                    </div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">Target Device</div>
                                                    <div className="text-xl font-bold text-green-600 dark:text-green-400 truncate">
                                                        {parameters.hostname}
                                                    </div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">Test Type</div>
                                                    <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                                                        JSNAPy
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Selected Tests Details */}
                                        <div className="border rounded-lg p-4">
                                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                                <ListChecks className="w-4 h-4" />
                                                Selected Tests
                                            </h5>
                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                {selectedTests.map((testPath, index) => {
                                                    const test = Object.values(categorizedTests).flat().find(t => t.path === testPath);
                                                    return (
                                                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                                    {index + 1}.
                                                                </span>
                                                                <div>
                                                                    <div className="font-medium">{test?.name || testPath}</div>
                                                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                                                        {test?.description || testPath}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <Badge variant="secondary" className="text-xs">
                                                                {testPath.split('/').pop()}
                                                            </Badge>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Device Configuration */}
                                        <div className="border rounded-lg p-4">
                                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                                <Bug className="w-4 h-4" />
                                                Device Configuration
                                            </h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Hostname</label>
                                                    <div className="font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                                                        {parameters.hostname}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                                                    <div className="font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                                                        {parameters.username}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Execution Button */}
                                        <div className="text-center py-4">
                                            <Button
                                                onClick={executeValidation}
                                                size="lg"
                                                className="bg-black hover:bg-gray-800 text-white dark:bg-white dark:text-black px-8"
                                            >
                                                <PlayCircle className="w-5 h-5 mr-2" />
                                                Execute Validation ({selectedTests.length} tests)
                                            </Button>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                This will connect to the device and run all selected JSNAPy tests
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {(isValidating || validationComplete) && (
                                    <div className="space-y-4">
                                        {/* Progress */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between text-sm">
                                                <span>Progress</span>
                                                <span>{validationProgress.toFixed(1)}%</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${validationProgress}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Job ID and Status */}
                                        {jobId && (
                                            <div className="text-sm text-gray-600 space-y-1">
                                                <div>
                                                    Job ID: <code className="bg-gray-100 px-2 py-1 rounded">{jobId}</code>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    Status:
                                                    <span className={`px-2 py-1 rounded text-xs ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                        {isConnected ? 'Connected' : 'Disconnected'}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Current Step */}
                                        {activeValidationStep && (
                                            <div className="text-sm text-gray-600">
                                                Current step: <span className="font-medium">{activeValidationStep}</span>
                                            </div>
                                        )}

                                        {/* Live Logs */}
                                        <div className="border rounded-md">
                                            <LiveLogViewer
                                                logs={validationLogs}
                                                title="Validation Logs"
                                            />
                                        </div>

                                        {validationComplete && (
                                            <div className="flex justify-center">
                                                <Button onClick={() => setCurrentStep(4)}>
                                                    View Results <Eye className="w-4 h-4 ml-2" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* STEP 4: RESULTS */}
                {currentStep === 4 && validationResults && (
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                                    Validation Report
                                </CardTitle>
                                <CardDescription>
                                    Comprehensive validation test results and analysis
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ValidationReport
                                    results={validationResults}
                                    selectedTests={selectedTests}
                                    deviceHostname={parameters.hostname}
                                    logs={validationLogs}
                                    onNewValidation={resetValidation}
                                    onBackToSelection={() => setCurrentStep(1)}
                                />
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
}