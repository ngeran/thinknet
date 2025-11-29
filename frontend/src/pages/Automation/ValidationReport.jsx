/**
 * =========================================================================================
 * FILE:                  ValidationReport.jsx
 * LOCATION:              frontend/src/pages/Automation/ValidationReport.jsx
 * PURPOSE:               Modern validation report with collapsible sections and multi-test support
 *
 * FEATURES:
 * - Modern, professional UI design
 * - Support for multiple tests and hosts
 * - Collapsible raw data sections
 * - Test summary statistics
 * - Pass/fail indicators with visual feedback
 * - Export functionality
 * =========================================================================================
 */

import React, { useState } from 'react';
import {
    CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronRight, ChevronUp,
    Download, Server, TestTube, Clock, TrendingUp, FileText,
    Activity, Database, Layers
} from 'lucide-react';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Progress } from '../../components/ui/progress';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Separator } from '../../components/ui/separator';

const ValidationReport = ({
    results,
    selectedTests,
    deviceHostname,
    logs,
    onNewValidation,
    onBackToSelection
}) => {
    const [expandedSections, setExpandedSections] = useState(new Set(['summary', 'details']));
    const [showRawData, setShowRawData] = useState(false);

    // Calculate statistics
    const calculateStats = () => {
        // For JSNAPy tests, we need to properly distinguish between:
        // 1. Number of test FILES selected by user (what users expect to see)
        // 2. Number of individual test CASES within those files (technical detail)

        const totalSelectedTests = selectedTests?.length || 0;
        let total = totalSelectedTests;  // Always base total on selected test files
        let passed = 0, failed = 0;
        let hosts = 1; // Default to 1 host
        let overallValidationPassed = results?.validation_passed !== false;
        let hasTestResults = false;

        // Check if we have detailed test results from individual test cases
        if (results?.results_by_host) {
            hosts = results.results_by_host.length;

            results.results_by_host.forEach(host => {
                if (host.test_results && host.test_results.length > 0) {
                    hasTestResults = true;
                    // Group test results by test file to count files, not test cases
                    const testsByFile = {};

                    host.test_results.forEach(test => {
                        const testFile = test.test_name || 'unknown';
                        if (!testsByFile[testFile]) {
                            testsByFile[testFile] = { hasPass: false, hasFail: false };
                        }

                        if (test.status === 'passed') {
                            testsByFile[testFile].hasPass = true;
                        } else if (test.status === 'failed') {
                            testsByFile[testFile].hasFail = true;
                            overallValidationPassed = false;
                        }
                    });

                    // Count passed/failed test files (not test cases)
                    Object.values(testsByFile).forEach(fileResult => {
                        if (fileResult.hasFail) {
                            failed++;
                        } else if (fileResult.hasPass) {
                            passed++;
                        }
                    });
                }
            });
        }

        // If we have enhanced JSNAPy runner results but no detailed results,
        // use the overall validation to determine pass/fail at file level
        if (!hasTestResults && results?.total_tests !== undefined) {
            // For simulation mode, determine pass/fail per test file based on overall validation
            if (overallValidationPassed) {
                passed = totalSelectedTests;
                failed = 0;
            } else {
                // If validation failed, try to estimate failed count from test case results
                const failedTestCases = results.failed_tests || 0;
                const totalTestCases = results.total_tests || 1;

                // Estimate failed test files proportionally, but at least 1
                failed = Math.max(1, Math.min(totalSelectedTests, Math.ceil(totalSelectedTests * (failedTestCases / totalTestCases))));
                passed = totalSelectedTests - failed;
            }
        }

        // Final fallback for old runner or missing data
        if (!hasTestResults && results?.total_tests === undefined) {
            if (overallValidationPassed && total > 0) {
                passed = total;
                failed = 0;
            } else if (!overallValidationPassed && total > 0) {
                failed = total;
                passed = 0;
            }
        }

        return {
            total,
            passed,
            failed,
            hosts,
            passRate: total > 0 ? ((passed / total) * 100).toFixed(1) : 0,
            validationPassed: overallValidationPassed,
            hasTestResults
        };
    };

    const stats = calculateStats();

    // Toggle section expansion
    const toggleSection = (section) => {
        const newExpanded = new Set(expandedSections);
        if (newExpanded.has(section)) {
            newExpanded.delete(section);
        } else {
            newExpanded.add(section);
        }
        setExpandedSections(newExpanded);
    };

    // Get status icon and color
    const getStatusIcon = (status) => {
        switch (status) {
            case 'passed':
                return <CheckCircle2 className="w-5 h-5 text-green-600" />;
            case 'failed':
                return <XCircle className="w-5 h-5 text-red-600" />;
            default:
                return <AlertCircle className="w-5 h-5 text-yellow-600" />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'passed':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'failed':
                return 'bg-red-100 text-red-800 border-red-200';
            default:
                return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        }
    };

    // Format timestamp
    const formatTimestamp = (timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp).toLocaleString();
    };

    // Export results as JSON
    const exportResults = () => {
        const exportData = {
            timestamp: new Date().toISOString(),
            device: deviceHostname,
            tests: selectedTests,
            results: results,
            logs: logs,
            statistics: stats
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `validation-report-${deviceHostname}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            {/* Report Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold">Validation Summary</h3>
                    <p className="text-sm text-gray-600">
                        Device: <span className="font-medium">{deviceHostname}</span> •
                        Executed: <span className="font-medium">{formatTimestamp(results.timestamp || Date.now())}</span>
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportResults}>
                        <Download className="w-4 h-4 mr-2" />
                        Export Results
                    </Button>
                </div>
            </div>

            {/* Statistics Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Total Tests</p>
                                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                            </div>
                            <TestTube className="w-8 h-8 text-blue-200" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-green-500">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Passed</p>
                                <p className="text-2xl font-bold text-green-600">{stats.passed}</p>
                            </div>
                            <CheckCircle2 className="w-8 h-8 text-green-200" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-red-500">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Failed</p>
                                <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                            </div>
                            <XCircle className="w-8 h-8 text-red-200" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-600">Pass Rate</p>
                                <p className="text-2xl font-bold text-purple-600">{stats.passRate}%</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-200" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Overall Progress */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="w-5 h-5" />
                            Overall Test Status
                        </CardTitle>
                        <Badge
                            variant={stats.failed === 0 ? "default" : "destructive"}
                            className="px-3 py-1"
                        >
                            {stats.failed === 0 ? 'ALL TESTS PASSED' : `${stats.failed} TESTS FAILED`}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <Progress value={parseFloat(stats.passRate)} className="h-3" />
                    <p className="text-sm text-gray-600 mt-2">
                        {stats.passed} of {stats.total} tests passed ({stats.passRate}% success rate)
                    </p>
                </CardContent>
            </Card>

            {/* Detailed Results by Host */}
            <Card>
                <CardHeader>
                    <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleSection('details')}
                    >
                        <CardTitle className="flex items-center gap-2">
                            <Server className="w-5 h-5" />
                            Detailed Results
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">
                                {selectedTests?.length || 0} tests selected
                            </Badge>
                            {expandedSections.has('details') ?
                                <ChevronDown className="w-5 h-5" /> :
                                <ChevronRight className="w-5 h-5" />
                            }
                        </div>
                    </div>
                    <CardDescription>
                        Test execution results and summary
                    </CardDescription>
                </CardHeader>
                {expandedSections.has('details') && (
                    <CardContent className="space-y-6">
                        {/* Tests Executed Summary */}
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                            <h5 className="font-medium mb-3 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Tests Executed
                            </h5>
                            <div className="space-y-2">
                                {selectedTests?.map((testPath, index) => {
                                    const testName = testPath.split('/').pop();
                                    return (
                                        <div key={index} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                                                    {index + 1}.
                                                </span>
                                                <div>
                                                    <div className="font-medium">{testName}</div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                                        {testPath}
                                                    </div>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="text-xs">
                                                {testName}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Actual Test Results */}
                        {results?.results_by_host && (
                            <div className="space-y-4">
                                <h5 className="font-medium flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    Validation Results
                                </h5>
                                {results.results_by_host.map((host, hostIndex) => (
                                    <div key={hostIndex} className="border rounded-lg p-4 bg-gray-50">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="font-semibold text-lg flex items-center gap-2">
                                                <Server className="w-5 h-5" />
                                                {host.hostname}
                                            </h4>
                                            <Badge variant="outline">
                                                {host.test_results?.length || 0} results
                                            </Badge>
                                        </div>

                                        {host.test_results && host.test_results.length > 0 ? (
                                            <div className="space-y-3">
                                                {host.test_results.map((test, testIndex) => (
                                                    <div key={testIndex} className="bg-white p-4 rounded-lg border">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-3">
                                                                {getStatusIcon(test.status)}
                                                                <div>
                                                                    <h5 className="font-medium">{test.title}</h5>
                                                                    <p className="text-sm text-gray-600">
                                                                        Status: <span className="font-medium capitalize">{test.status}</span>
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <Badge className={getStatusColor(test.status)}>
                                                                {test.status.toUpperCase()}
                                                            </Badge>
                                                        </div>

                                                        {test.error && (
                                                            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                                                <p className="text-sm text-red-800">
                                                                    <span className="font-medium">Error:</span> {test.error}
                                                                </p>
                                                            </div>
                                                        )}

                                                        {test.data && (
                                                            <div className="mt-3">
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => toggleSection(`test-${hostIndex}-${testIndex}`)}
                                                                    className="flex items-center gap-2"
                                                                >
                                                                    <Database className="w-4 h-4" />
                                                                    Test Data
                                                                    {expandedSections.has(`test-${hostIndex}-${testIndex}`) ?
                                                                        <ChevronUp className="w-4 h-4" /> :
                                                                        <ChevronDown className="w-4 h-4" />
                                                                    }
                                                                </Button>

                                                                {expandedSections.has(`test-${hostIndex}-${testIndex}`) && (
                                                                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                                                        <ScrollArea className="h-32 w-full">
                                                                            <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                                                                                {JSON.stringify(test.data, null, 2)}
                                                                            </pre>
                                                                        </ScrollArea>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-6 text-gray-500">
                                                <p className="mb-2">No individual test results available</p>
                                                <p className="text-sm">This is normal for some JSNAPy tests that only return overall validation status</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Overall Status */}
                        <div className="border rounded-lg p-4">
                            <h5 className="font-medium mb-3">Overall Validation Status</h5>
                            <div className="flex items-center gap-3">
                                {stats.validationPassed ? (
                                    <>
                                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                                        <span className="font-medium text-green-700">
                                            All tests completed successfully
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-6 h-6 text-red-600" />
                                        <span className="font-medium text-red-700">
                                            Some tests failed or validation issues detected
                                        </span>
                                    </>
                                )}
                                <Badge variant={stats.validationPassed ? "default" : "destructive"}>
                                    {stats.passed}/{stats.total} tests passed
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Raw Data Section */}
            <Card>
                <CardHeader>
                    <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => toggleSection('raw')}
                    >
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5" />
                            Raw Validation Data
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">
                                {selectedTests?.length || 0} tests
                            </Badge>
                            {expandedSections.has('raw') ?
                                <ChevronDown className="w-5 h-5" /> :
                                <ChevronRight className="w-5 h-5" />
                            }
                        </div>
                    </div>
                    <CardDescription>
                        Complete raw results and execution logs
                    </CardDescription>
                </CardHeader>
                {expandedSections.has('raw') && (
                    <CardContent className="space-y-4">
                        {/* Selected Tests */}
                        <div>
                            <h5 className="font-medium mb-2 flex items-center gap-2">
                                <Layers className="w-4 h-4" />
                                Selected Tests
                            </h5>
                            <div className="flex flex-wrap gap-2">
                                {selectedTests?.map((test, index) => (
                                    <Badge key={index} variant="secondary">
                                        {test.split('/').pop()}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <Separator />

                        {/* Raw Results JSON */}
                        <div>
                            <h5 className="font-medium mb-2">Complete Results (JSON)</h5>
                            <ScrollArea className="h-64 w-full border rounded-lg p-3 bg-gray-50">
                                                                <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                                    {JSON.stringify(results, null, 2)}
                                </pre>
                            </ScrollArea>
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* Action Buttons */}
            <div className="flex justify-between pt-4 border-t">
                <Button variant="outline" onClick={onBackToSelection}>
                    Back to Test Selection
                </Button>
                <Button onClick={onNewValidation}>
                    Start New Validation
                </Button>
            </div>
        </div>
    );
};

export default ValidationReport;