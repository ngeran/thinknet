// =========================================================================================
// FILE:                  useTestDiscovery.js
// LOCATION:              frontend/src/hooks/useTestDiscovery.js
// PURPOSE:               Custom React hook for discovering, categorizing, and managing
//                        available validation tests from the backend API.
//
// KEY RESPONSIBILITIES:
//  1. Fetch test list from /api/tests endpoint
//  2. Fetch metadata for each test from /api/tests/{testPath}
//  3. Categorize tests by type (System, Protocols, Connectivity, etc.)
//  4. Provide search and filtering utilities
//  5. Display hooks for test discovery statistics
//
// PHASE TRACKING: This hook is part of PHASE 1 (User Initiates Validation)
// The tests discovered here are selected by the user and later sent to the backend
// in PHASE 2 (FastAPI Gateway Receives Request & Generates Job ID)
//
// =========================================================================================
 
import { useState, useEffect } from 'react';
 
// =========================================================================================
// SECTION 1: CONFIGURATION & API CONSTANTS
// =========================================================================================
// These constants define where the hook communicates with the backend API
 
const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';
 
/**
 * Debug logging utility with timestamp
 * @param {string} section - The section/component calling this function
 * @param {string} message - The debug message to log
 * @param {any} data - Optional data object to log alongside the message
 */
const debugLog = (section, message, data = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[useTestDiscovery] [${section}] [${timestamp}]`;
 
    if (data) {
        console.log(`${prefix} ${message}`, data);
    } else {
        console.log(`${prefix} ${message}`);
    }
};
 
/**
 * Error logging utility with stack trace
 * @param {string} section - The section/component calling this function
 * @param {string} message - The error message
 * @param {Error} error - The error object
 */
const errorLog = (section, message, error = null) => {
    const timestamp = new Date().toISOString();
    const prefix = `[useTestDiscovery] [${section}] [${timestamp}] ❌ ERROR`;
 
    if (error) {
        console.error(`${prefix} ${message}`, error);
    } else {
        console.error(`${prefix} ${message}`);
    }
};
 
// =========================================================================================
// SECTION 2: TEST METADATA FETCHING & PARSING
// =========================================================================================
// This section handles fetching individual test metadata from the API and parsing
// YAML content to extract test configuration details
 
/**
 * Fetches complete test metadata including content and file information
 *
 * PHASE 1: User Initiates Validation
 * This function is called during test discovery to populate the test list UI
 *
 * @param {string} testPath - The file path to the test (e.g., "system/test_version.yml")
 * @returns {Promise<Object|null>} Test object with id, name, path, description, etc. or null if failed
 */
async function fetchTestMetadata(testPath) {
    debugLog('fetchTestMetadata', `Fetching metadata for test path: ${testPath}`);
 
    try {
        // Make API request to fetch test content and metadata
        const response = await fetch(`${API_URL}/api/tests/${testPath}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
 
        // Check if request was successful
        if (!response.ok) {
            errorLog(
                'fetchTestMetadata',
                `Failed to fetch metadata for ${testPath} - HTTP ${response.status}`
            );
            return null;
        }
 
        // Parse the response
        const data = await response.json();
        debugLog('fetchTestMetadata', `API response received for ${testPath}`, {
            hasName: !!data.name,
            hasPath: !!data.path,
            hasContent: !!data.content,
            sizeKb: data.size_kb
        });
 
        // Extract YAML content for metadata parsing
        const content = data.content || '';
 
        // ====================================================================
        // METADATA EXTRACTION: Parse YAML content to get test configuration
        // ====================================================================
        // This regex searches for the test_metadata section in YAML format
        const metadataMatch = content.match(/test_metadata:\s*\n([\s\S]*?)(?=\n\w+:|$)/);
 
        // Initialize default metadata
        let metadata = {
            description: data.name || 'No description available',
            category: 'General',
            display_hints: null
        };
 
        // If metadata section found, parse it
        if (metadataMatch) {
            try {
                debugLog('fetchTestMetadata', `Parsing test_metadata section for ${testPath}`);
 
                // Extract description from YAML
                const descMatch = content.match(/description:\s*["'](.+?)["']/);
                if (descMatch) {
                    metadata.description = descMatch[1];
                    debugLog('fetchTestMetadata', `Found description: ${descMatch[1]}`);
                }
 
                // Extract category from YAML (e.g., "System", "Protocols", "Connectivity")
                const categoryMatch = content.match(/category:\s*["'](.+?)["']/);
                if (categoryMatch) {
                    metadata.category = categoryMatch[1];
                    debugLog('fetchTestMetadata', `Found category: ${categoryMatch[1]}`);
                }
 
                // Extract display hints type (e.g., "table", "text", "json")
                const displayTypeMatch = content.match(/type:\s*["'](.+?)["']/);
                if (displayTypeMatch) {
                    metadata.display_hints = {
                        type: displayTypeMatch[1]
                    };
                    debugLog('fetchTestMetadata', `Found display type: ${displayTypeMatch[1]}`);
                }
            } catch (parseError) {
                errorLog('fetchTestMetadata', `Error parsing test metadata for ${testPath}`, parseError);
                // Continue with default metadata if parsing fails
            }
        } else {
            debugLog('fetchTestMetadata', `No test_metadata section found in ${testPath}`);
        }
 
        // ====================================================================
        // CONSTRUCT RETURN OBJECT
        // ====================================================================
        // This object will be used in the UI to display and select tests
        const testObject = {
            id: testPath,                          // ← CRITICAL: ID is the FILE PATH
            name: data.name,
            path: data.path,                       // ← FILE PATH (e.g., "system/test_version.yml")
            description: metadata.description,
            category: metadata.category,
            display_hints: metadata.display_hints,
            size_kb: data.size_kb,
            modified: data.modified
        };
 
        debugLog('fetchTestMetadata', `Successfully created test object for ${testPath}`, {
            id: testObject.id,
            path: testObject.path,
            category: testObject.category
        });
 
        return testObject;
 
    } catch (error) {
        errorLog('fetchTestMetadata', `Exception while fetching test ${testPath}`, error);
        return null;
    }
}
 
// =========================================================================================
// SECTION 3: TEST CATEGORIZATION & ORGANIZATION
// =========================================================================================
// This section handles organizing tests into categories for UI display
 
/**
 * Categorizes tests based on their metadata category field
 * Falls back to path-based categorization if metadata category is missing
 *
 * PHASE 1: User Initiates Validation
 * Tests are organized by category for better UX in the test selection panel
 *
 * @param {Array<Object>} tests - Array of test objects with metadata
 * @returns {Object} Nested object with tests organized by category
 *
 * EXAMPLE OUTPUT:
 * {
 *   "System": [
 *     { id: "system/test_version.yml", name: "Check Device Model", ... },
 *     { id: "system/test_hostname.yml", name: "Check Hostname", ... }
 *   ],
 *   "Protocols": [ ... ],
 *   "Connectivity": [ ... ]
 * }
 */
function categorizeTests(tests) {
    debugLog('categorizeTests', `Categorizing ${tests.length} tests`);
 
    // Guard: Check if tests array is valid
    if (!Array.isArray(tests) || tests.length === 0) {
        debugLog('categorizeTests', 'No tests provided or empty array');
        return {};
    }
 
    const categories = {};
 
    // ====================================================================
    // LOOP 1: Assign each test to a category
    // ====================================================================
    tests.forEach((test, index) => {
        // Use metadata category if available, otherwise use "General"
        let category = test.category || 'General';
 
        // If category is still "General", try to derive from file path
        if (category === 'General' && test.path) {
            const pathParts = test.path.split('/');
 
            if (pathParts.length >= 2) {
                // Extract category from path structure
                // e.g., "tests/protocols/test_bgp.yml" → "Protocols"
                const pathCategory = pathParts[pathParts.length - 2];
                category = pathCategory.charAt(0).toUpperCase() + pathCategory.slice(1);
 
                debugLog('categorizeTests', `Test ${index}: Derived category from path: ${category}`, {
                    testPath: test.path,
                    testId: test.id
                });
            }
        }
 
        // Initialize category array if it doesn't exist
        if (!categories[category]) {
            categories[category] = [];
        }
 
        // Add test to category
        categories[category].push(test);
    });
 
    debugLog('categorizeTests', `Tests distributed across categories`, {
        categoryCount: Object.keys(categories).length,
        categories: Object.keys(categories),
        testCounts: Object.entries(categories).reduce((acc, [cat, tests]) => {
            acc[cat] = tests.length;
            return acc;
        }, {})
    });
 
    // ====================================================================
    // LOOP 2: Sort tests within each category alphabetically
    // ====================================================================
    Object.keys(categories).forEach(category => {
        categories[category].sort((a, b) => {
            const nameA = a.name || '';
            const nameB = b.name || '';
            return nameA.localeCompare(nameB);
        });
    });
 
    debugLog('categorizeTests', 'Tests sorted alphabetically within each category');
 
    // ====================================================================
    // LOOP 3: Sort categories by predefined order (UX preference)
    // ====================================================================
    const categoryOrder = [
        'System',
        'Protocols',
        'Connectivity',
        'Interfaces',
        'Routing & BGP',
        'VLANs & Trunking',
        'ACLs & Security',
        'Configuration',
        'Performance',
        'Hardware & Inventory',
        'General'
    ];
 
    const sortedCategories = {};
 
    // Add categories in preferred order
    categoryOrder.forEach(cat => {
        if (categories[cat]) {
            sortedCategories[cat] = categories[cat];
            debugLog('categorizeTests', `Added category in order: ${cat} (${categories[cat].length} tests)`);
        }
    });
 
    // Add any remaining categories not in the predefined order
    Object.keys(categories)
        .sort()
        .forEach(cat => {
            if (!sortedCategories[cat]) {
                sortedCategories[cat] = categories[cat];
                debugLog('categorizeTests', `Added unexpected category: ${cat} (${categories[cat].length} tests)`);
            }
        });
 
    debugLog('categorizeTests', `Categorization complete`, {
        totalCategories: Object.keys(sortedCategories).length,
        totalTests: Object.values(sortedCategories).flat().length
    });
 
    return sortedCategories;
}
 
// =========================================================================================
// SECTION 4: REACT HOOK - MAIN TEST DISCOVERY LOGIC
// =========================================================================================
// This is the main hook exported for use in React components
 
/**
 * Custom React hook for discovering available validation tests
 *
 * COMPLETE PHASE 1 IMPLEMENTATION:
 * This hook manages the entire test discovery workflow that happens when
 * the Validation component first mounts. It:
 * 1. Fetches the list of available tests from /api/tests
 * 2. Fetches metadata for each test
 * 3. Categorizes tests for UI display
 * 4. Provides state and utilities to consuming components
 *
 * @param {string} testType - Type of tests to discover (e.g., 'validation')
 *                            Currently not used for filtering, but kept for future extension
 *
 * @returns {Object} Hook return object containing:
 *  - categorizedTests: Object with tests organized by category
 *  - allTests: Flat array of all test objects
 *  - loading: Boolean indicating if tests are being fetched
 *  - error: Error message if something went wrong
 *  - refetch: Function to manually re-run the discovery process
 */
export function useTestDiscovery(testType = 'validation') {
    debugLog('useTestDiscovery', `Hook initialized with testType: ${testType}`);
 
    // ====================================================================
    // REACT STATE: Manage test discovery state
    // ====================================================================
    const [categorizedTests, setCategorizedTests] = useState({});  // Organized by category
    const [allTests, setAllTests] = useState([]);                  // Flat array of all tests
    const [loading, setLoading] = useState(true);                  // Loading state
    const [error, setError] = useState(null);                      // Error message
 
    // ====================================================================
    // ASYNC FUNCTION: Main test discovery workflow
    // ====================================================================
    /**
     * PHASE 1: User Initiates Validation
     * This function orchestrates the complete test discovery process
     */
    const fetchTests = async () => {
        debugLog('fetchTests', `================================`);
        debugLog('fetchTests', `🚀 PHASE 1: User Initiates Validation - Starting Test Discovery`);
        debugLog('fetchTests', `================================`);
 
        setLoading(true);
        setError(null);
 
        try {
            // ================================================================
            // STEP 1: Fetch list of all available tests
            // ================================================================
            debugLog('fetchTests', `STEP 1: Fetching test list from /api/tests`);
 
            const response = await fetch(`${API_URL}/api/tests`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
 
            // Check if request was successful
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch tests: HTTP ${response.status} - ${errorText}`);
            }
 
            // Parse response
            const data = await response.json();
            const testList = data.tests || [];
 
            debugLog('fetchTests', `✅ STEP 1 COMPLETE: Test list received from API`, {
                testCount: testList.length,
                responseKeys: Object.keys(data),
                firstTest: testList[0] || 'No tests'
            });
 
            // ================================================================
            // STEP 2: Validate that tests have required path field
            // ================================================================
            debugLog('fetchTests', `STEP 2: Validating test list structure`);
 
            const invalidTests = testList.filter(test => !test.path);
            if (invalidTests.length > 0) {
                errorLog('fetchTests', `⚠️  ${invalidTests.length} tests missing 'path' field`, {
                    count: invalidTests.length,
                    examples: invalidTests.slice(0, 3)
                });
            } else {
                debugLog('fetchTests', `✅ STEP 2 COMPLETE: All tests have required 'path' field`);
            }
 
            // ================================================================
            // STEP 3: Fetch metadata for each test in parallel
            // ================================================================
            debugLog('fetchTests', `STEP 3: Fetching detailed metadata for ${testList.length} tests`);
            debugLog('fetchTests', `Test paths to fetch metadata for:`, testList.map(t => t.path));
 
            const testDetailsPromises = testList.map((test, index) => {
                debugLog('fetchTests', `  [${index + 1}/${testList.length}] Queuing metadata fetch for: ${test.path}`);
                return fetchTestMetadata(test.path);
            });
 
            // Wait for all metadata fetches to complete
            const testDetails = await Promise.all(testDetailsPromises);
 
            debugLog('fetchTests', `✅ STEP 3 COMPLETE: Metadata fetch completed for all tests`, {
                total: testDetails.length,
                successful: testDetails.filter(t => t !== null).length,
                failed: testDetails.filter(t => t === null).length
            });
 
            // ================================================================
            // STEP 4: Filter out failed fetches and log failures
            // ================================================================
            debugLog('fetchTests', `STEP 4: Filtering out failed metadata fetches`);
 
            const validTests = testDetails.filter(test => test !== null);
 
            if (testDetails.length > validTests.length) {
                const failedCount = testDetails.length - validTests.length;
                errorLog('fetchTests', `${failedCount} test metadata fetches failed`, {
                    total: testDetails.length,
                    successful: validTests.length,
                    failed: failedCount
                });
            }
 
            debugLog('fetchTests', `✅ STEP 4 COMPLETE: Filtering complete`, {
                validTests: validTests.length,
                testSample: validTests.slice(0, 2).map(t => ({
                    id: t.id,
                    path: t.path,
                    category: t.category
                }))
            });
 
            // ================================================================
            // STEP 5: Categorize tests for UI display
            // ================================================================
            debugLog('fetchTests', `STEP 5: Categorizing ${validTests.length} tests`);
 
            const categorized = categorizeTests(validTests);
 
            debugLog('fetchTests', `✅ STEP 5 COMPLETE: Categorization complete`, {
                categoryCount: Object.keys(categorized).length,
                categories: Object.keys(categorized),
                categoryBreakdown: Object.entries(categorized).reduce((acc, [cat, tests]) => {
                    acc[cat] = tests.length;
                    return acc;
                }, {})
            });
 
            // ================================================================
            // STEP 6: Update React state with discovered tests
            // ================================================================
            debugLog('fetchTests', `STEP 6: Updating React state`);
 
            setCategorizedTests(categorized);
            setAllTests(validTests);
 
            debugLog('fetchTests', `✅ STEP 6 COMPLETE: React state updated`);
 
            // ================================================================
            // PHASE 1 COMPLETE
            // ================================================================
            debugLog('fetchTests', `✅ PHASE 1 COMPLETE: Test Discovery Finished`);
            debugLog('fetchTests', `================================`);
            debugLog('fetchTests', `Summary:`, {
                totalTests: validTests.length,
                totalCategories: Object.keys(categorized).length,
                categories: Object.keys(categorized).join(', '),
                ready: 'User can now select tests and proceed to PHASE 2'
            });
 
        } catch (err) {
            // ================================================================
            // ERROR HANDLING
            // ================================================================
            errorLog('fetchTests', 'Exception during test discovery', err);
            setError(err.message);
            setCategorizedTests({});
            setAllTests([]);
 
            debugLog('fetchTests', `❌ PHASE 1 FAILED - Error state set`, {
                errorMessage: err.message,
                ready: false
            });
 
        } finally {
            setLoading(false);
        }
    };
 
    // ====================================================================
    // REACT EFFECT: Trigger test discovery on component mount
    // ====================================================================
    useEffect(() => {
        debugLog('useTestDiscovery', 'useEffect triggered - running test discovery on mount');
        fetchTests();
    }, []);
 
    // ====================================================================
    // HOOK RETURN: Provide state and utilities to consuming component
    // ====================================================================
    return {
        categorizedTests,  // Tests organized by category for UI rendering
        allTests,          // Flat array of all test objects
        loading,           // Boolean: Are tests still being fetched?
        error,             // String: Error message if discovery failed
        refetch: fetchTests, // Function: Manually re-run test discovery
    };
}
 
// =========================================================================================
// SECTION 5: UTILITY FUNCTIONS - Test Querying & Transformation
// =========================================================================================
// These utilities help consuming components filter, search, and analyze tests
 
/**
 * Helper function to get all test IDs (file paths) from categorized tests
 *
 * Used in PHASE 1 to build the list of selected test IDs for the API call
 *
 * @param {Object} categorizedTests - Tests organized by category (from hook)
 * @returns {Array<string>} Flat array of all test IDs (file paths)
 *
 * EXAMPLE:
 * Input: {
 *   "System": [{ id: "system/test_version.yml", ... }],
 *   "Protocols": [{ id: "protocols/test_bgp.yml", ... }]
 * }
 * Output: ["system/test_version.yml", "protocols/test_bgp.yml"]
 */
export function getAllTestIds(categorizedTests) {
    debugLog('getAllTestIds', 'Extracting all test IDs from categorized tests');
 
    const allIds = Object.values(categorizedTests)
        .flat()
        .map(test => test.id || test.path);
 
    debugLog('getAllTestIds', `Extracted ${allIds.length} test IDs`, {
        ids: allIds
    });
 
    return allIds;
}
 
/**
 * Helper function to get tests from a specific category
 *
 * @param {Object} categorizedTests - Tests organized by category
 * @param {string} category - Category name to filter by
 * @returns {Array<Object>} Tests in the specified category
 */
export function getTestsByCategory(categorizedTests, category) {
    debugLog('getTestsByCategory', `Retrieving tests for category: ${category}`);
 
    const tests = categorizedTests[category] || [];
 
    debugLog('getTestsByCategory', `Found ${tests.length} tests in category ${category}`);
 
    return tests;
}
 
/**
 * Helper function to search tests across all categories
 *
 * Used in TestSelectionPanel search functionality
 *
 * @param {Object} categorizedTests - Tests organized by category
 * @param {string} searchQuery - Search query string
 * @returns {Object} Filtered categorized tests matching the query
 *
 * SEARCH FIELDS:
 * - Test ID (file path)
 * - Test name
 * - Test description
 * - Category name
 */
export function searchTests(categorizedTests, searchQuery) {
    debugLog('searchTests', `Searching tests with query: "${searchQuery}"`);
 
    if (!searchQuery || !searchQuery.trim()) {
        debugLog('searchTests', 'Empty search query - returning all tests');
        return categorizedTests;
    }
 
    const query = searchQuery.toLowerCase().trim();
    const filtered = {};
    let totalMatches = 0;
 
    Object.entries(categorizedTests).forEach(([category, tests]) => {
        const matchingTests = tests.filter(test => {
            // Search across multiple fields
            const idMatch = test.id?.toLowerCase().includes(query);
            const nameMatch = test.name?.toLowerCase().includes(query);
            const descMatch = test.description?.toLowerCase().includes(query);
            const pathMatch = test.path?.toLowerCase().includes(query);
            const categoryMatch = category.toLowerCase().includes(query);
 
            return idMatch || nameMatch || descMatch || pathMatch || categoryMatch;
        });
 
        if (matchingTests.length > 0) {
            filtered[category] = matchingTests;
            totalMatches += matchingTests.length;
        }
    });
 
    debugLog('searchTests', `Search complete`, {
        query: query,
        totalMatches: totalMatches,
        categoriesWithMatches: Object.keys(filtered).length
    });
 
    return filtered;
}
 
/**
 * Helper function to get test statistics for display
 *
 * @param {Object} categorizedTests - Tests organized by category
 * @returns {Object} Statistics object containing counts and percentages
 *
 * EXAMPLE RETURN:
 * {
 *   totalTests: 25,
 *   totalCategories: 4,
 *   categoryStats: [
 *     { name: "System", count: 10, percentage: 40 },
 *     { name: "Protocols", count: 8, percentage: 32 }
 *   ]
 * }
 */
export function getTestStatistics(categorizedTests) {
    debugLog('getTestStatistics', 'Calculating test statistics');
 
    const categories = Object.keys(categorizedTests);
    const totalTests = Object.values(categorizedTests).flat().length;
 
    const categoryStats = categories.map(category => ({
        name: category,
        count: categorizedTests[category].length,
        percentage: totalTests > 0
            ? Math.round((categorizedTests[category].length / totalTests) * 100)
            : 0
    })).sort((a, b) => b.count - a.count);
 
    const stats = {
        totalTests,
        totalCategories: categories.length,
        categoryStats: categoryStats,
        averageTestsPerCategory: totalTests > 0
            ? Math.round(totalTests / categories.length)
            : 0
    };
 
    debugLog('getTestStatistics', 'Statistics calculated', stats);
 
    return stats;
}
 
/**
 * Helper function to group tests by their display hint type
 *
 * Useful for determining which tests return tabular data vs. other formats
 * This information helps format the results display
 *
 * @param {Array<Object>} tests - Array of test objects
 * @returns {Object} Tests grouped by display type (table, text, json, unknown)
 *
 * EXAMPLE RETURN:
 * {
 *   table: [ {...tests that return tables...} ],
 *   text: [ {...tests that return text...} ],
 *   json: [ {...tests that return JSON...} ],
 *   unknown: [ {...tests with unknown display type...} ]
 * }
 */
export function groupTestsByDisplayType(tests) {
    debugLog('groupTestsByDisplayType', `Grouping ${tests.length} tests by display type`);
 
    const grouped = {
        table: [],
        text: [],
        json: [],
        unknown: []
    };
 
    tests.forEach(test => {
        const displayType = test.display_hints?.type || 'unknown';
 
        if (grouped[displayType]) {
            grouped[displayType].push(test);
        } else {
            // If display type is not recognized, put in unknown
            grouped.unknown.push(test);
        }
    });
 
    debugLog('groupTestsByDisplayType', 'Grouping complete', {
        table: grouped.table.length,
        text: grouped.text.length,
        json: grouped.json.length,
        unknown: grouped.unknown.length
    });
 
    return grouped;
}
 
export default useTestDiscovery;
