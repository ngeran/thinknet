// =========================================================================================
// FILE:                  Validation.jsx
// LOCATION:              frontend/src/pages/Automation/Validation.jsx
// PURPOSE:               Main validation workflow component - handles test configuration,
//                        execution, real-time progress monitoring, and results display
//
// COMPLETE END-TO-END FLOW IMPLEMENTED:
//  PHASE 1: User Initiates Validation (This Component)
//  PHASE 2: FastAPI Gateway Receives Request & Generates Job ID
//  PHASE 3: Frontend Receives Job ID & Stores It
//  PHASE 4: Frontend Sends SUBSCRIBE Command Over WebSocket
//  PHASE 5: Rust Hub Receives SUBSCRIBE Command
//  PHASE 6: Python Worker Starts & Publishes to Redis
//  PHASE 7: Rust Hub Receives From Redis Pattern
//  PHASE 8: Rust Hub Filters & Sends To Subscribed Client
//  PHASE 9: Frontend Receives Message
//  PHASE 10: Hook Processes Message
//  PHASE 11: Component Processes Log Message
//  PHASE 12: Log Processor Formats Message
//  PHASE 13: Live Log Viewer Displays Message
//
// =========================================================================================
 
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
// DEBUG LOGGING UTILITIES
// =========================================================================================
/**
 * Main debug logging function with section context
 */
const debugLog = (section, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[Validation] [${section}] [${timestamp}]`;
 
    if (data) {
        console.log(`${prefix} ${message}`, data);
    } else {
        console.log(`${prefix} ${message}`);
    }
};
 
/**
 * Error logging function with context
 */
const errorLog = (section, message, error = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[Validation] [${section}] [${timestamp}] ❌`;
 
    if (error) {
        console.error(`${prefix} ${message}`, error);
    } else {
        console.error(`${prefix} ${message}`);
    }
};
 
// =========================================================================================
// SECTION 1: TEST SELECTION PANEL SUB-COMPONENT
// =========================================================================================
/**
 * TestSelectionPanel Component
 *
 * PHASE 1: User Initiates Validation
 * This sub-component handles:
 * - Display of available tests by category
 * - Search functionality across tests
 * - Category expansion/collapse
 * - Test selection/deselection
 * - Visual feedback for selected tests
 *
 * @param {Object} categorizedTests - Tests organized by category from useTestDiscovery
 * @param {Array<string>} selectedTests - Array of selected test IDs (file paths)
 * @param {Function} onTestToggle - Callback when test selection changes
 * @param {boolean} testsLoading - Loading state from hook
 * @param {string} testsError - Error message from hook
 */
function TestSelectionPanel({ categorizedTests, selectedTests, onTestToggle, testsLoading, testsError }) {
    debugLog('TestSelectionPanel', 'Component mounted');
 
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedCategories, setExpandedCategories] = useState(new Set());
    const [selectedCategory, setSelectedCategory] = useState('all');
 
    // ====================================================================
    // Category Expansion Toggle
    // ====================================================================
    const toggleCategory = (category) => {
        debugLog('TestSelectionPanel', `Toggling category expansion: ${category}`);
 
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(category)) {
            newExpanded.delete(category);
            debugLog('TestSelectionPanel', `Category collapsed: ${category}`);
        } else {
            newExpanded.add(category);
            debugLog('TestSelectionPanel', `Category expanded: ${category}`);
        }
        setExpandedCategories(newExpanded);
    };
 
    // ====================================================================
    // Test Filtering (Search + Category Filter)
    // ====================================================================
    const filteredTests = useMemo(() => {
        debugLog('TestSelectionPanel', 'Computing filtered tests');
 
        let filtered = { ...categorizedTests };
 
        // Apply search filter
        if (searchQuery.trim()) {
            debugLog('TestSelectionPanel', `Applying search filter: "${searchQuery}"`);
 
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
 
            debugLog('TestSelectionPanel', `Search complete`, {
                query: query,
                totalMatches: Object.values(filtered).flat().length,
                categoriesWithMatches: Object.keys(filtered).length
            });
        }
 
        // Apply category filter
        if (selectedCategory !== 'all') {
            debugLog('TestSelectionPanel', `Filtering by category: ${selectedCategory}`);
 
            filtered = { [selectedCategory]: filtered[selectedCategory] || [] };
        }
 
        return filtered;
    }, [categorizedTests, searchQuery, selectedCategory]);
 
    const totalTests = Object.values(categorizedTests).flat().length;
    const categories = Object.keys(categorizedTests);
 
    // ====================================================================
    // LOADING STATE
    // ====================================================================
    if (testsLoading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="animate-spin mr-2" />
                <span>Loading tests...</span>
            </div>
        );
    }
 
    // ====================================================================
    // ERROR STATE
    // ====================================================================
    if (testsError) {
        return (
            <div className="p-4 bg-red-50 text-red-600 rounded">
                <AlertCircle className="inline mr-2 w-4 h-4" />
                Failed to load tests: {testsError}
            </div>
        );
    }
 
    // ====================================================================
    // RENDER: SEARCH BAR & TEST LIST
    // ====================================================================
    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search tests by name or description..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            debugLog('TestSelectionPanel', `Search query updated: "${e.target.value}"`);
                        }}
                        className="pl-9 pr-9"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                debugLog('TestSelectionPanel', 'Search query cleared');
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
 
                {/* ================================================================ */}
                {/* CATEGORY FILTER BADGES */}
                {/* ================================================================ */}
                {categories.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                        <Badge
                            variant={selectedCategory === 'all' ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                                setSelectedCategory('all');
                                debugLog('TestSelectionPanel', 'Category filter: ALL');
                            }}
                        >
                            All ({totalTests})
                        </Badge>
                        {categories.map(category => (
                            <Badge
                                key={category}
                                variant={selectedCategory === category ? 'default' : 'outline'}
                                className="cursor-pointer"
                                onClick={() => {
                                    setSelectedCategory(category);
                                    debugLog('TestSelectionPanel', `Category filter: ${category}`);
                                }}
                            >
                                {category} ({categorizedTests[category].length})
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
 
            {/* ================================================================ */}
            {/* TEST LIST - EXPANDABLE CATEGORIES */}
            {/* ================================================================ */}
            <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                    {Object.keys(filteredTests).length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            No tests match your search or filter
                        </div>
                    ) : (
                        Object.entries(filteredTests).map(([category, tests]) => (
                            <div key={category} className="border rounded-lg overflow-hidden">
                                {/* Category Header - Clickable to Expand/Collapse */}
                                <button
                                    onClick={() => toggleCategory(category)}
                                    className="w-full flex justify-between p-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800"
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
 
                                {/* Category Tests - Expanded Content */}
                                {expandedCategories.has(category) && (
                                    <div className="p-3 grid gap-2">
                                        {tests.map((test) => {
                                            const isSelected = selectedTests.includes(test.id);
 
                                            return (
                                                <div
                                                    key={test.id}
                                                    onClick={() => {
                                                        debugLog('TestSelectionPanel', `Test toggled: ${test.id}`, {
                                                            testId: test.id,
                                                            testPath: test.path,
                                                            wasSelected: isSelected,
                                                            willBeSelected: !isSelected
                                                        });
                                                        onTestToggle(test.id);
                                                    }}
                                                    className={`flex items-start gap-3 p-3 rounded-md cursor-pointer border transition-all ${
                                                        isSelected
                                                            ? 'border-black bg-gray-50 dark:border-white dark:bg-gray-900'
                                                            : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-900'
                                                    }`}
                                                >
                                                    {/* Checkbox */}
                                                    <div
                                                        className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center ${
                                                            isSelected
                                                                ? 'bg-black border-black dark:bg-white dark:border-white'
                                                                : 'border-gray-300'
                                                        }`}
                                                    >
                                                        {isSelected && (
                                                            <CheckCircle className="h-3 w-3 text-white dark:text-black" />
                                                        )}
                                                    </div>
 
                                                    {/* Test Info */}
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <code className="text-xs font-mono font-medium">
                                                                {test.name}
                                                            </code>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                                            {test.description}
                                                        </p>
                                                        {/* DEBUG: Show file path */}
                                                        <p className="text-[10px] text-gray-400 mt-0.5 font-mono">
                                                            Path: {test.path}
                                                        </p>
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
// SECTION 2: USER-FRIENDLY RESULTS VIEWER SUB-COMPONENT
// =========================================================================================
/**
 * UserFriendlyResults Component
 *
 * PHASE 13: Live Log Viewer Displays Message (Results Phase)
 * Displays validation results in three formats:
 * 1. Summary: High-level pass/fail counts by device
 * 2. Detailed: Table view of all test results
 * 3. JSON: Raw JSON data
 *
 * @param {Object} finalResults - Complete validation results from backend
 * @param {string} jobId - Job ID for download/reference
 */
const UserFriendlyResults = ({ finalResults, jobId }) => {
    debugLog('UserFriendlyResults', 'Component mounted', { jobId });
 
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
 
    // ====================================================================
    // Calculate Summary Statistics
    // ====================================================================
    const summaryStats = useMemo(() => {
        debugLog('UserFriendlyResults', 'Calculating summary statistics');
 
        if (!finalResults?.results_by_host) {
            return { total: 0, passed: 0, failed: 0, hosts: 0 };
        }
 
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
 
        debugLog('UserFriendlyResults', 'Statistics calculated', {
            total, passed, failed, hosts
        });
 
        return { total, passed, failed, hosts };
    }, [finalResults]);
 
    // ====================================================================
    // VIEW MODE: SUMMARY
    // ====================================================================
    if (viewMode === 'summary') {
        return (
            <div className="space-y-6">
                {/* Overall Summary Card */}
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
                            {/* Total Tests */}
                            <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                                    {summaryStats.total}
                                </div>
                                <div className="text-sm text-slate-600 dark:text-slate-400">Total Tests</div>
                            </div>
 
                            {/* Passed Tests */}
                            <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                                    {summaryStats.passed}
                                </div>
                                <div className="text-sm text-emerald-600 dark:text-emerald-400">Passed</div>
                            </div>
 
                            {/* Failed Tests */}
                            <div className="text-center p-4 bg-rose-50 dark:bg-rose-950 rounded-lg border border-rose-200 dark:border-rose-800">
                                <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">
                                    {summaryStats.failed}
                                </div>
                                <div className="text-sm text-rose-600 dark:text-rose-400">Failed</div>
                            </div>
 
                            {/* Device Count */}
                            <div className="text-center p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                                    {summaryStats.hosts}
                                </div>
                                <div className="text-sm text-slate-600 dark:text-slate-400">Devices</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
 
                {/* Device Results */}
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
                                            {isExpanded ? (
                                                <ChevronDown className="w-4 h-4 text-slate-500" />
                                            ) : (
                                                <ChevronRight className="w-4 h-4 text-slate-500" />
                                            )}
                                            <div>
                                                <CardTitle className="text-base text-slate-800 dark:text-slate-200">
                                                    {hostname}
                                                </CardTitle>
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
 
                                {/* Expanded Test Results */}
                                {isExpanded && (
                                    <CardContent className="space-y-3">
                                        {hostTests.map((test, testIndex) => {
                                            const hasError = test.error || (test.data?.status === 'FAILED');
                                            const testMessage = test.data?.message || test.data?.info || (test.error ? 'Test failed' : 'Test passed');
 
                                            return (
                                                <div
                                                    key={testIndex}
                                                    className={`p-3 rounded-lg border ${
                                                        hasError
                                                            ? 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800'
                                                            : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800'
                                                    }`}
                                                >
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
 
    // ====================================================================
    // VIEW MODE: DETAILED (Table)
    // ====================================================================
    if (viewMode === 'detailed') {
        return (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Detailed Results</CardTitle>
                            <CardDescription>Complete validation data in table format</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={viewMode === 'summary' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('summary')}
                            >
                                <ListChecks className="w-4 h-4 mr-2" /> Summary
                            </Button>
                            <Button
                                variant={viewMode === 'detailed' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('detailed')}
                            >
                                <Table className="w-4 h-4 mr-2" /> Detailed
                            </Button>
                            <Button
                                variant={viewMode === 'json' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('json')}
                            >
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
 
    // ====================================================================
    // VIEW MODE: JSON
    // ====================================================================
    if (viewMode === 'json') {
        return (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle>Raw JSON Data</CardTitle>
                            <CardDescription>Complete validation results in JSON format</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant={viewMode === 'summary' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('summary')}
                            >
                                <ListChecks className="w-4 h-4 mr-2" /> Summary
                            </Button>
                            <Button
                                variant={viewMode === 'detailed' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('detailed')}
                            >
                                <Table className="w-4 h-4 mr-2" /> Detailed
                            </Button>
                            <Button
                                variant={viewMode === 'json' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setViewMode('json')}
                            >
                                <FileText className="w-4 h-4 mr-2" /> JSON
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="h-[400px]">
                        <pre className="bg-gray-50 dark:bg-gray-950 p-4 rounded text-xs font-mono whitespace-pre-wrap break-words">
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
// SECTION 3: MAIN VALIDATION COMPONENT
// =========================================================================================
/**
 * Validation Component - Main entry point
 *
 * COMPLETE END-TO-END FLOW:
 * PHASE 1: User Initiates Validation
 * PHASE 2: FastAPI Gateway Receives Request & Generates Job ID
 * PHASE 3: Frontend Receives Job ID & Stores It
 * PHASE 4: Frontend Sends SUBSCRIBE Command Over WebSocket
 * PHASE 5: Rust Hub Receives SUBSCRIBE Command
 * PHASE 6: Python Worker Starts & Publishes to Redis
 * PHASE 7: Rust Hub Receives From Redis Pattern
 * PHASE 8: Rust Hub Filters & Sends To Subscribed Client
 * PHASE 9: Frontend Receives Message
 * PHASE 10: Hook Processes Message
 * PHASE 11: Component Processes Log Message
 * PHASE 12: Log Processor Formats Message
 * PHASE 13: Live Log Viewer Displays Message
 */
export default function Validation() {
    debugLog('Validation', '================================');
    debugLog('Validation', '🚀 PHASE 1: User Initiates Validation - Component mounted');
    debugLog('Validation', '================================');
 
    // ====================================================================
    // SECTION 3A: STATE MANAGEMENT
    // ====================================================================
 
    // Tab state
    const [activeTab, setActiveTab] = useState("config");
 
    // Validation parameters (user inputs)
    const [validationParams, setValidationParams] = useState({
        username: "",
        password: "",
        hostname: "",
        inventory_file: "",
        tests: []
    });
 
    // Workflow state
    const [jobStatus, setJobStatus] = useState("idle");      // idle, running, success, failed
    const [jobId, setJobId] = useState(null);                 // PHASE 3: Stores job ID from API response
    const [finalResults, setFinalResults] = useState(null);   // Stores validation results
 
    // Logging & UI state
    const [logHistory, setLogHistory] = useState([]);         // PHASE 11-13: All logs received so far
    const [activeStep, setActiveStep] = useState(null);       // Current executing step
    const [showTechnical, setShowTechnical] = useState(false); // Debug mode toggle
    const [showResults, setShowResults] = useState(false);     // Results display toggle
 
    // Data fetching hooks - PHASE 1: Test Discovery
    const { categorizedTests, loading: testsLoading, error: testsError } = useTestDiscovery("validation");
 
    // WebSocket hook - PHASE 4-13: Real-time message handling
    const { lastMessage, isConnected, sendMessage } = useJobWebSocket();
 
    debugLog('Validation', 'All state initialized');
 
    // ====================================================================
    // SECTION 3B: PARAMETER HANDLERS - PHASE 1
    // ====================================================================
 
    /**
     * Update validation parameter when user changes an input
     * PHASE 1: User Initiates Validation
     */
    const handleParamChange = (name, value) => {
        setValidationParams(prev => ({ ...prev, [name]: value }));
 
        debugLog('Validation', `PHASE 1: Parameter changed: ${name}`, {
            name: name,
            newValue: value,
            type: typeof value
        });
    };
 
    /**
     * Toggle test selection
     * PHASE 1: User Initiates Validation
     */
    const handleTestToggle = (testId) => {
        debugLog('Validation', `PHASE 1: Test toggled: ${testId}`, {
            testId: testId,
            isPath: testId.includes('/')
        });
 
        const current = validationParams.tests || [];
        const updated = current.includes(testId)
            ? current.filter(t => t !== testId)
            : [...current, testId];
 
        setValidationParams(prev => ({ ...prev, tests: updated }));
 
        debugLog('Validation', `PHASE 1: Test selection updated`, {
            totalSelected: updated.length,
            allSelected: updated
        });
    };
 
    /**
     * Reset entire workflow to initial state
     */
    const resetWorkflow = () => {
        debugLog('Validation', 'Resetting workflow to initial state');
 
        setJobStatus("idle");
        setLogHistory([]);
        setFinalResults(null);
        setJobId(null);
        setActiveTab("config");
        setActiveStep(null);
        setShowResults(false);
    };
 
    // ====================================================================
    // SECTION 3C: WEBSOCKET MESSAGE HANDLING - PHASE 9-13
    // ====================================================================
    /**
     * PHASE 9-13: Frontend Receives Messages and Processes Them
     *
     * This useEffect handles incoming WebSocket messages throughout
     * the entire validation execution lifecycle.
     *
     * PHASE 9: Frontend Receives Message (from WebSocket)
     * PHASE 10: Hook Processes Message (useJobWebSocket)
     * PHASE 11: Component Processes Log Message (this useEffect)
     * PHASE 12: Log Processor Formats Message (processLogMessage)
     * PHASE 13: Live Log Viewer Displays Message (LiveLogViewer component)
     */
    useEffect(() => {
        // Guard: Only process if we have a message and an active job
        if (!lastMessage || !jobId) {
            return;
        }
 
        debugLog('Validation', '================================');
        debugLog('Validation', '🔄 PHASE 9-13: Message received from WebSocket');
        debugLog('Validation', '================================');
 
        debugLog('Validation', 'PHASE 9: Raw message received from WebSocket', {
            messagePreview: typeof lastMessage === 'string' ? lastMessage.substring(0, 200) : lastMessage,
            jobIdExpected: jobId
        });
 
        // Parse the message if it's a string
        let messageData = lastMessage;
        if (typeof lastMessage === 'string') {
            try {
                messageData = JSON.parse(lastMessage);
                debugLog('Validation', 'PHASE 9: Message parsed from JSON string');
            } catch (e) {
                debugLog('Validation', 'PHASE 9: Message is plain text (not JSON)');
            }
        }
 
        // Filter: Only process messages for THIS job
        if (messageData.job_id && messageData.job_id !== jobId) {
            debugLog('Validation', `PHASE 9: Message filtered - job_id mismatch (expected: ${jobId}, got: ${messageData.job_id})`);
            return;
        }
 
        // PHASE 12: Process the message (formatting, categorization)
        debugLog('Validation', 'PHASE 12: Processing message with log processor');
        const normalizedLog = processLogMessage(lastMessage);
 
        // PHASE 13: Add to history for display
        debugLog('Validation', 'PHASE 13: Adding log to history', {
            logType: normalizedLog.type,
            message: normalizedLog.message.substring(0, 100)
        });
 
        setLogHistory(prev => [...prev, normalizedLog]);
 
        // Update active step if this is a step progress message
        if (normalizedLog.type === 'STEP_PROGRESS') {
            const stepName = normalizedLog.message.replace(/^Step \d+: /, '');
            setActiveStep(stepName);
            debugLog('Validation', `PHASE 13: Active step updated: ${stepName}`);
        }
 
        // Check for completion or results
        const originalEvent = normalizedLog.originalEvent || messageData;
 
        debugLog('Validation', 'PHASE 13: Checking for completion signals', {
            eventType: originalEvent.type,
            hasData: !!originalEvent.data,
            hasResults: !!originalEvent.data?.results_by_host
        });
 
        // CASE A: Results Received (True Success with data)
        if (originalEvent.type === 'result' && originalEvent.data) {
            debugLog('Validation', '✅ PHASE 13: Results received - validation succeeded');
            setFinalResults(originalEvent.data);
            setJobStatus('success');
            setShowResults(true);
 
            // Unsubscribe from WebSocket channel
            if (sendMessage && jobId) {
                debugLog('Validation', 'PHASE 13: Sending UNSUBSCRIBE command');
                sendMessage({ type: "UNSUBSCRIBE" });
            }
        }
        // CASE B: Job Finished Signal
        else if (originalEvent.type === 'job_status' && originalEvent.status === 'finished') {
            debugLog('Validation', 'PHASE 13: Job finished signal received');
 
            if (finalResults) {
                debugLog('Validation', '✅ PHASE 13: Job finished with results - marking as success');
                setJobStatus('success');
            } else {
                errorLog('Validation', 'PHASE 13: Job finished but no results - marking as failed');
                setJobStatus('failed');
                setLogHistory(prev => [...prev, {
                    type: 'ERROR',
                    message: 'Job finished but produced no results. Check test file paths.',
                    id: Date.now(),
                    timestamp: new Date().toISOString(),
                    isTechnical: false,
                    originalEvent: {}
                }]);
            }
 
            // Unsubscribe
            if (sendMessage && jobId) {
                debugLog('Validation', 'PHASE 13: Sending UNSUBSCRIBE command');
                sendMessage({ type: "UNSUBSCRIBE" });
            }
        }
        // CASE C: Explicit Error
        else if (originalEvent.type === 'error') {
            errorLog('Validation', 'PHASE 13: Error event received');
            setJobStatus('failed');
            if (sendMessage && jobId) {
                debugLog('Validation', 'PHASE 13: Sending UNSUBSCRIBE command');
                sendMessage({ type: "UNSUBSCRIBE" });
            }
        }
 
        debugLog('Validation', '================================');
 
    }, [lastMessage, jobId, finalResults, sendMessage]);
 
    // ====================================================================
    // SECTION 3D: VALIDATION EXECUTION - PHASE 1-2
    // ====================================================================
    /**
     * PHASE 1-2: User clicks button → API call to generate job
     *
     * PHASE 1: User Initiates Validation
     *  - Validates user inputs
     *  - Shows confirmation
     *
     * PHASE 2: FastAPI Gateway Receives Request & Generates Job ID
     *  - HTTP POST to /api/operations/validation/execute
     *  - Backend generates UUID and queues job
     *  - Returns: job_id, ws_channel
     *
     * PHASE 3: Frontend Receives Job ID & Stores It
     *  - Extract job_id from response
     *  - Store in state
     *
     * PHASE 4: Frontend Sends SUBSCRIBE Command Over WebSocket
     *  - Send SUBSCRIBE message with channel name
     */
    const startValidation = async () => {
        debugLog('Validation', '================================');
        debugLog('Validation', '🚀 PHASE 1: User Initiates Validation - Button clicked');
        debugLog('Validation', '================================');
 
        // ================================================================
        // PHASE 1: Validation checks
        // ================================================================
        debugLog('Validation', 'PHASE 1: Validating user inputs');
 
        if (!validationParams.username || !validationParams.password) {
            errorLog('Validation', 'PHASE 1: Credentials missing');
            alert("Credentials required");
            return;
        }
 
        if (!validationParams.hostname && !validationParams.inventory_file) {
            errorLog('Validation', 'PHASE 1: No target specified');
            alert("Target required");
            return;
        }
 
        if (!validationParams.tests?.length) {
            errorLog('Validation', 'PHASE 1: No tests selected');
            alert("Select at least one test");
            return;
        }
 
        debugLog('Validation', 'PHASE 1: ✅ All validations passed', {
            hasUsername: !!validationParams.username,
            hasPassword: !!validationParams.password,
            hasTarget: !!validationParams.hostname || !!validationParams.inventory_file,
            testCount: validationParams.tests.length
        });
 
        // ================================================================
        // PHASE 1: Reset UI and prepare for execution
        // ================================================================
        debugLog('Validation', 'PHASE 1: Preparing UI for execution');
 
        setJobStatus("running");
        setLogHistory([]);
        setFinalResults(null);
        setActiveTab("execute");
        setActiveStep("Initializing validation job...");
 
        // ================================================================
        // PHASE 1: Prepare API payload
        // ================================================================
        debugLog('Validation', 'PHASE 1: Constructing API payload');
 
        const payload = {
            command: "validation",
            hostname: validationParams.hostname?.trim(),
            inventory_file: validationParams.inventory_file?.trim(),
            username: validationParams.username,
            password: validationParams.password,
            tests: validationParams.tests,  // ← FILE PATHS FROM FRONTEND
            mode: "check"
        };
 
        debugLog('Validation', 'PHASE 1: API Payload constructed', {
            command: payload.command,
            hostname: payload.hostname,
            testCount: payload.tests.length,
            tests: payload.tests,
            mode: payload.mode
        });
 
        try {
            // ================================================================
            // PHASE 2: HTTP POST to FastAPI Gateway
            // ================================================================
            debugLog('Validation', '🔄 PHASE 2: FastAPI Gateway - Sending HTTP POST to /api/operations/validation/execute');
 
            const response = await fetch(`${API_URL}/api/operations/validation/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
 
            // Check if request was successful
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText);
            }
 
            const data = await response.json();
 
            debugLog('Validation', '✅ PHASE 2: API Response received', {
                jobId: data.job_id,
                wsChannel: data.ws_channel,
                status: data.status,
                responseKeys: Object.keys(data)
            });
 
            // ================================================================
            // PHASE 3: Store job ID
            // ================================================================
            debugLog('Validation', '🔄 PHASE 3: Frontend Receives Job ID & Stores It');
            debugLog('Validation', `PHASE 3: Storing job ID: ${data.job_id}`);
 
            setJobId(data.job_id);
 
            // ================================================================
            // PHASE 4: Send SUBSCRIBE command over WebSocket
            // ================================================================
            debugLog('Validation', '🔄 PHASE 4: Frontend Sends SUBSCRIBE Command Over WebSocket');
 
            if (data.ws_channel && sendMessage) {
                debugLog('Validation', `PHASE 4: Sending SUBSCRIBE command`, {
                    channel: data.ws_channel,
                    message: { type: 'SUBSCRIBE', channel: data.ws_channel }
                });
 
                sendMessage({
                    type: 'SUBSCRIBE',
                    channel: data.ws_channel  // Backend returns: "job:{job_id}"
                });
 
                debugLog('Validation', '✅ PHASE 4: SUBSCRIBE command sent');
            } else {
                errorLog('Validation', 'PHASE 4: WS Channel or sendMessage unavailable');
            }
 
            // Log start message
            setLogHistory(prev => [...prev, processLogMessage({
                message: `✅ Job started with ID: ${data.job_id}`,
                event_type: 'SYSTEM_INFO'
            })]);
 
            debugLog('Validation', '================================');
            debugLog('Validation', '✅ PHASES 1-4 COMPLETE');
            debugLog('Validation', 'Waiting for real-time messages (PHASE 9+)...');
            debugLog('Validation', '================================');
 
        } catch (error) {
            errorLog('Validation', 'PHASE 2: API Request failed', error);
            setJobStatus("failed");
            setLogHistory(prev => [...prev, processLogMessage({
                message: `❌ API Error: ${error.message}`,
                event_type: "ERROR"
            })]);
        }
    };
 
    // ====================================================================
    // SECTION 3E: RENDER - PAGE LAYOUT
    // ====================================================================
 
    const isRunning = jobStatus === 'running';
    const isComplete = jobStatus === 'success';
    const hasError = jobStatus === 'failed';
 
    return (
        <div className="min-h-screen bg-white dark:bg-black">
            {/* ================================================================ */}
            {/* HEADER */}
            {/* ================================================================ */}
            <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-0 z-10">
                <div className="container mx-auto px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Validation Tests</h1>
                            <p className="text-sm text-muted-foreground">
                                Run operational checks against network devices
                            </p>
                        </div>
                        {jobStatus !== 'idle' && (
                            <Button onClick={resetWorkflow} variant="outline" size="sm">
                                Start New Validation
                            </Button>
                        )}
                    </div>
 
                    {/* Tab Navigation */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="config" disabled={isRunning}>
                                Configure
                            </TabsTrigger>
                            <TabsTrigger value="execute" disabled={jobStatus === 'idle'}>
                                Execute
                            </TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </div>
 
            {/* ================================================================ */}
            {/* MAIN CONTENT */}
            {/* ================================================================ */}
            <div className="container mx-auto px-6 py-6">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    {/* ================================================================ */}
                    {/* TAB 1: CONFIGURATION */}
                    {/* ================================================================ */}
                    <TabsContent value="config" className="m-0">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-7xl mx-auto">
                            {/* Left Column: Input Fields */}
                            <div className="space-y-6">
                                {/* Target Device Selection */}
                                <DeviceTargetSelector
                                    parameters={validationParams}
                                    onParamChange={handleParamChange}
                                    title="Target Device"
                                />
 
                                {/* Authentication Fields */}
                                <DeviceAuthFields
                                    parameters={validationParams}
                                    onParamChange={handleParamChange}
                                    title="Authentication"
                                />
 
                                {/* Launch Button Card */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Launch</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-sm">
                                                <ListChecks className="w-4 h-4 text-gray-500" />
                                                <span>
                                                    {validationParams.tests.length} tests selected
                                                </span>
                                            </div>
                                            <Button
                                                onClick={startValidation}
                                                disabled={!validationParams.tests.length}
                                                className="w-full bg-black dark:bg-white text-white dark:text-black hover:opacity-90"
                                                size="lg"
                                            >
                                                Start Validation <ArrowRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
 
                            {/* Right Column: Test Selection */}
                            <div className="flex flex-col h-full">
                                <Card className="flex-1">
                                    <CardHeader>
                                        <CardTitle>Test Selection</CardTitle>
                                        <CardDescription>
                                            Select tests to run from the library
                                        </CardDescription>
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
 
                    {/* ================================================================ */}
                    {/* TAB 2: EXECUTION */}
                    {/* ================================================================ */}
                    <TabsContent value="execute" className="m-0">
                        <div className="max-w-4xl mx-auto space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Execution Console</CardTitle>
                                    <CardDescription>Real-time validation progress</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    {/* ================================================================ */}
                                    {/* STATUS PLAN (Before Start) */}
                                    {/* ================================================================ */}
                                    {!isRunning && jobStatus === 'idle' && (
                                        <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400">
                                            Waiting to start...
                                        </div>
                                    )}
 
                                    {/* ================================================================ */}
                                    {/* STATUS BAR (Running/Completed/Failed) */}
                                    {/* ================================================================ */}
                                    {(isRunning || isComplete || hasError) && (
                                        <div
                                            className={`flex items-center justify-between p-4 rounded-lg border ${
                                                isComplete
                                                    ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800'
                                                    : hasError
                                                    ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800'
                                                    : 'bg-zinc-50 border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {isRunning ? (
                                                    <Loader2 className="animate-spin w-5 h-5" />
                                                ) : isComplete ? (
                                                    <CheckCircle2 className="w-5 h-5" />
                                                ) : (
                                                    <AlertCircle className="w-5 h-5" />
                                                )}
                                                <span className="font-medium">
                                                    {isRunning
                                                        ? activeStep || "Processing..."
                                                        : isComplete
                                                        ? "Validation Completed Successfully"
                                                        : "Validation Failed"}
                                                </span>
                                            </div>
 
                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant={showResults ? "secondary" : "outline"}
                                                    onClick={() => finalResults && setShowResults(!showResults)}
                                                    disabled={!finalResults}
                                                    className={`${
                                                        finalResults ? '' : 'opacity-50 cursor-not-allowed'
                                                    }`}
                                                >
                                                    <CheckCircle2 className={`w-4 h-4 ${
                                                        finalResults ? 'text-green-600' : 'text-gray-400'
                                                    }`} />
                                                    <span className="ml-2 hidden md:inline">
                                                        Results {finalResults ? '' : '(Waiting)'}
                                                    </span>
                                                </Button>
                                                <Button
                                                    variant={showTechnical ? "secondary" : "outline"}
                                                    size="sm"
                                                    onClick={() => setShowTechnical(!showTechnical)}
                                                >
                                                    <Bug className={`w-4 h-4 ${
                                                        showTechnical ? 'text-blue-600' : ''
                                                    }`} />
                                                    <span className="ml-2 hidden md:inline">Debug</span>
                                                </Button>
                                            </div>
                                        </div>
                                    )}
 
                                    {/* ================================================================ */}
                                    {/* LIVE LOG VIEWER - PHASE 13 */}
                                    {/* ================================================================ */}
                                    <LiveLogViewer
                                        logs={logHistory}
                                        isConnected={isConnected}
                                        height="h-96"
                                        title="Validation Logs"
                                        showTechnical={showTechnical}
                                    />
 
                                    {/* ================================================================ */}
                                    {/* RESULTS SECTION */}
                                    {/* ================================================================ */}
                                    {finalResults && showResults && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                Validation Results
                                            </div>
 
                                            {/* User-Friendly Results Display */}
                                            <UserFriendlyResults
                                                finalResults={finalResults}
                                                jobId={jobId}
                                            />
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
