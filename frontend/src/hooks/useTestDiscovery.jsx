// =========================================================================================
//
// HOOK:               useTestDiscovery.js
// FILE:               /src/hooks/useTestDiscovery.js
//
// OVERVIEW:
//   Custom React hook for discovering and categorizing available validation tests
//   from the API. Now uses the enhanced API with metadata and native categorization.
//
// =========================================================================================

import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8000';

/**
 * Fetches test content including metadata
 * @param {string} testPath - Path to the test file
 * @returns {Promise<Object>} - Test metadata and content
 */
async function fetchTestMetadata(testPath) {
  try {
    const response = await fetch(`${API_URL}/api/tests/${testPath}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[useTestDiscovery] Failed to fetch metadata for ${testPath}`);
      return null;
    }

    const data = await response.json();

    // Parse YAML content to extract test_metadata
    const content = data.content || '';
    const metadataMatch = content.match(/test_metadata:\s*\n([\s\S]*?)(?=\n\w+:|$)/);

    let metadata = {
      description: data.name,
      category: 'General',
      display_hints: null
    };

    if (metadataMatch) {
      try {
        // Extract description
        const descMatch = content.match(/description:\s*["'](.+?)["']/);
        if (descMatch) {
          metadata.description = descMatch[1];
        }

        // Extract category
        const categoryMatch = content.match(/category:\s*["'](.+?)["']/);
        if (categoryMatch) {
          metadata.category = categoryMatch[1];
        }

        // Extract display hints type
        const displayTypeMatch = content.match(/type:\s*["'](.+?)["']/);
        if (displayTypeMatch) {
          metadata.display_hints = {
            type: displayTypeMatch[1]
          };
        }
      } catch (parseError) {
        console.warn('[useTestDiscovery] Error parsing test metadata:', parseError);
      }
    }

    return {
      id: testPath,
      name: data.name,
      path: data.path,
      description: metadata.description,
      category: metadata.category,
      display_hints: metadata.display_hints,
      size_kb: data.size_kb,
      modified: data.modified
    };
  } catch (error) {
    console.error(`[useTestDiscovery] Error fetching test ${testPath}:`, error);
    return null;
  }
}

/**
 * Categorizes tests based on their metadata category field
 * Falls back to path-based categorization if metadata is missing
 * @param {Array} tests - Array of test objects with metadata
 * @returns {Object} - Tests organized by category
 */
function categorizeTests(tests) {
  if (!Array.isArray(tests) || tests.length === 0) {
    return {};
  }

  const categories = {};

  tests.forEach(test => {
    // Use metadata category if available, otherwise derive from path
    let category = test.category || 'General';

    // If category is still generic, try to derive from path
    if (category === 'General' && test.path) {
      const pathParts = test.path.split('/');
      if (pathParts.length >= 2) {
        // Extract category from path structure (e.g., tests/protocols/test_bgp.yml -> Protocols)
        const pathCategory = pathParts[pathParts.length - 2];
        category = pathCategory.charAt(0).toUpperCase() + pathCategory.slice(1);
      }
    }

    // Initialize category array if it doesn't exist
    if (!categories[category]) {
      categories[category] = [];
    }

    categories[category].push(test);
  });

  // Sort tests within each category alphabetically by name
  Object.keys(categories).forEach(category => {
    categories[category].sort((a, b) => a.name.localeCompare(b.name));
  });

  // Sort categories - put more common ones first
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
  categoryOrder.forEach(cat => {
    if (categories[cat]) {
      sortedCategories[cat] = categories[cat];
    }
  });

  // Add any remaining categories not in the predefined order
  Object.keys(categories)
    .sort()
    .forEach(cat => {
      if (!sortedCategories[cat]) {
        sortedCategories[cat] = categories[cat];
      }
    });

  return sortedCategories;
}

/**
 * Custom hook for discovering available validation tests
 * @param {string} testType - Type of tests to discover (currently not used, but kept for future filtering)
 * @returns {Object} - { categorizedTests, allTests, loading, error, refetch }
 */
export function useTestDiscovery(testType = 'validation') {
  const [categorizedTests, setCategorizedTests] = useState({});
  const [allTests, setAllTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTests = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useTestDiscovery] Fetching test list from API...');

      // Step 1: Get list of all tests
      const response = await fetch(`${API_URL}/api/tests`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tests: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const testList = data.tests || [];

      console.log(`[useTestDiscovery] Found ${testList.length} tests`);

      // Step 2: Fetch metadata for each test in parallel
      console.log('[useTestDiscovery] Fetching test metadata...');
      const testDetailsPromises = testList.map(test => fetchTestMetadata(test.path));
      const testDetails = await Promise.all(testDetailsPromises);

      // Filter out any failed fetches
      const validTests = testDetails.filter(test => test !== null);

      console.log(`[useTestDiscovery] Successfully loaded ${validTests.length} tests with metadata`);

      // Step 3: Categorize the tests using their metadata
      const categorized = categorizeTests(validTests);
      setCategorizedTests(categorized);
      setAllTests(validTests);

      console.log(`[useTestDiscovery] Tests organized into ${Object.keys(categorized).length} categories:`,
        Object.keys(categorized).join(', '));
    } catch (err) {
      console.error('[useTestDiscovery] Error fetching tests:', err);
      setError(err.message);
      setCategorizedTests({});
      setAllTests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
     
  }, []);

  return {
    categorizedTests,
    allTests,
    loading,
    error,
    refetch: fetchTests,
  };
}

/**
 * Helper function to get all test IDs from categorized tests
 * @param {Object} categorizedTests - Tests organized by category
 * @returns {Array} - Array of all test IDs (paths)
 */
export function getAllTestIds(categorizedTests) {
  return Object.values(categorizedTests)
    .flat()
    .map(test => test.id || test.path);
}

/**
 * Helper function to get tests by category
 * @param {Object} categorizedTests - Tests organized by category
 * @param {string} category - Category name
 * @returns {Array} - Array of tests in the category
 */
export function getTestsByCategory(categorizedTests, category) {
  return categorizedTests[category] || [];
}

/**
 * Helper function to search tests across all categories
 * @param {Object} categorizedTests - Tests organized by category
 * @param {string} searchQuery - Search query
 * @returns {Object} - Filtered categorized tests
 */
export function searchTests(categorizedTests, searchQuery) {
  if (!searchQuery || !searchQuery.trim()) {
    return categorizedTests;
  }

  const query = searchQuery.toLowerCase().trim();
  const filtered = {};

  Object.entries(categorizedTests).forEach(([category, tests]) => {
    const matchingTests = tests.filter(test =>
      test.id?.toLowerCase().includes(query) ||
      test.name?.toLowerCase().includes(query) ||
      test.description?.toLowerCase().includes(query) ||
      test.path?.toLowerCase().includes(query) ||
      category.toLowerCase().includes(query)
    );

    if (matchingTests.length > 0) {
      filtered[category] = matchingTests;
    }
  });

  return filtered;
}

/**
 * Helper function to get test statistics
 * @param {Object} categorizedTests - Tests organized by category
 * @returns {Object} - Statistics about the tests
 */
export function getTestStatistics(categorizedTests) {
  const categories = Object.keys(categorizedTests);
  const totalTests = Object.values(categorizedTests).flat().length;

  const categoryStats = categories.map(category => ({
    name: category,
    count: categorizedTests[category].length,
    percentage: totalTests > 0
      ? Math.round((categorizedTests[category].length / totalTests) * 100)
      : 0
  }));

  return {
    totalTests,
    totalCategories: categories.length,
    categoryStats: categoryStats.sort((a, b) => b.count - a.count),
    averageTestsPerCategory: totalTests > 0
      ? Math.round(totalTests / categories.length)
      : 0
  };
}

/**
 * Helper function to group tests by display hint type
 * Useful for knowing which tests return tabular data vs other formats
 * @param {Array} tests - Array of test objects
 * @returns {Object} - Tests grouped by display type
 */
export function groupTestsByDisplayType(tests) {
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
      grouped.unknown.push(test);
    }
  });

  return grouped;
}
