// src/hooks/useTestDiscovery.js
import { useState, useEffect } from "react";

const API_BASE_URL = "http://localhost:3001";

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
        const requestBody = JSON.stringify({ scriptId, environment });
        console.log("useTestDiscovery: Request body:", requestBody);

        const response = await fetch(
          `${API_BASE_URL}/api/scripts/discover-tests`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: requestBody,
          },
        );

        console.log("useTestDiscovery: Response status:", response.status);
        console.log(
          "useTestDiscovery: Response headers:",
          Object.fromEntries(response.headers.entries()),
        );

        // Check if response is ok
        if (!response.ok) {
          const errorText = await response.text();
          console.error("useTestDiscovery: HTTP error response:", errorText);
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log("useTestDiscovery: Response data:", data);

        if (!data.success) {
          throw new Error(data.message || "Failed to discover tests.");
        }

        // The API returns tests in a flat structure, we can categorize them here if needed,
        // or assume the backend provides a categorized structure. For now, let's use the backend's structure.
        setCategorizedTests(data.discovered_tests || {});
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
    // Re-run this effect if the scriptId or environment changes
  }, [scriptId, environment]);

  return { categorizedTests, loading, error };
}
