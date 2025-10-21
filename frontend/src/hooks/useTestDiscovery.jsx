// src/hooks/useTestDiscovery.js
import { useState, useEffect } from "react";

const API_BASE_URL = "http://localhost:8000"; // Updated to match Atlas API

// A generic hook to fetch discoverable tests for ANY script.
export function useTestDiscovery(scriptId, environment = "development") {
  const [categorizedTests, setCategorizedTests] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Don't fetch if there's no scriptId
    if (!scriptId) {
      console.log("useTestDiscovery: No scriptId provided, skipping fetch");
      setCategorizedTests({});
      return;
    }

    console.log(
      `useTestDiscovery: Starting fetch for scriptId: ${scriptId}, environment: ${environment}`,
    );

    const fetchTests = async () => {
      setLoading(true);
      setError(null);

      try {
        // Use the new Atlas API endpoint
        const response = await fetch(
          `${API_BASE_URL}/api/tests`,
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
          },
        );

        console.log("useTestDiscovery: Response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("useTestDiscovery: HTTP error response:", errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log("useTestDiscovery: Response data:", data);

        // Transform the API response to match the expected format
        const transformedTests = transformTestsData(data.tests || []);
        setCategorizedTests(transformedTests);
        console.log("useTestDiscovery: Successfully set categorized tests");
      } catch (err) {
        console.error(
          `useTestDiscovery: Error discovering tests for ${scriptId}:`,
          err,
        );
        setError(err.message);
        setCategorizedTests({});
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
  }, [scriptId, environment]);

  return { categorizedTests, loading, error };
}

// Helper function to transform the API response to the expected format
function transformTestsData(tests) {
  const categorized = {
    "Validation Tests": tests.map(test => ({
      id: test.name.replace('.yml', ''),
      name: test.name,
      description: `Test file: ${test.path} (${test.size_kb} KB)`,
      category: "Validation Tests",
      path: test.path,
      size: test.size,
      modified: test.modified
    }))
  };

  return categorized;
}

// Additional hook to fetch individual test content if needed
export function useTestContent(testPath) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!testPath) return;

    const fetchContent = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/tests/${testPath}`,
          {
            method: "GET",
            headers: {
              "Accept": "application/json",
            },
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setContent(data.content);
      } catch (err) {
        console.error(`useTestContent: Error fetching test content for ${testPath}:`, err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [testPath]);

  return { content, loading, error };
}
