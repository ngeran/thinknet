// =================================================================================================
// FILE:               /src/components/BaselineScriptOptions.jsx
//
// DESCRIPTION:
//   The definitive component for rendering standard sidebar form fields based on script metadata.
//   It handles dynamic data fetching, conditional visibility, and dependent field logic.
//   This component serves as the default fallback for the main ScriptOptionsRenderer.
// =================================================================================================

// SECTION 1: IMPORTS & CONFIGURATION
// -------------------------------------------------------------------------------------------------
import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import PulseLoader from "react-spinners/PulseLoader";

const API_BASE_URL = "http://localhost:3001";

// SECTION 2: DYNAMIC DATA FETCHER UTILITY
// -------------------------------------------------------------------------------------------------
/**
 * A reusable async function to fetch dynamic options for a form input from a backend API endpoint.
 * @param {string} endpoint - The API endpoint to query (e.g., '/api/inventories/list').
 * @returns {Promise<Array<{value: string, label: string}>>} A promise that resolves to an array of options.
 */
async function fetchDynamicOptions(endpoint) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `Request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (data.success) {
      // Handle various possible response structures from the backend.
      // This looks for any potential key that might contain the options array.
      return data.options || data.inventories || data.devices || data.backups || [];
    } else {
      throw new Error(data.message || "API returned success: false but no message.");
    }
  } catch (error) {
    toast.error(`Failed to fetch options: ${error.message}`);
    console.error(`[BaselineScriptOptions] Fetch error from endpoint ${endpoint}:`, error);
    return [];
  }
}

// SECTION 3: INDIVIDUAL INPUT RENDERER COMPONENTS
// -------------------------------------------------------------------------------------------------
// These are stateless, presentational components for rendering each type of form input.

const RadioInput = ({ param, value, onChange }) => (
  <div className="mt-2 space-y-2">
    {param.options.map(option => (
      <label key={option.value} className="flex items-center text-sm text-slate-700 cursor-pointer p-2 rounded-md hover:bg-slate-50">
        <input type="radio" name={param.name} value={option.value} checked={value === option.value} onChange={(e) => onChange(param.name, e.target.value)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300" />
        <span className="ml-3 font-medium">{option.label}</span>
      </label>
    ))}
  </div>
);

const SelectInput = ({ param, value, onChange, options, isLoading }) => (
  <>
    {isLoading ? (
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 italic">
        <PulseLoader size={6} color="#475569" /> Loading...
      </div>
    ) : options.length === 0 ? (
      <p className="text-sm text-slate-500 italic mt-2">No options available.</p>
    ) : (
      <select value={value || ""} onChange={(e) => onChange(param.name, e.target.value)} className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
        <option value="" disabled>Select {param.label}</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    )}
  </>
);

const TextOrNumberInput = ({ param, value, onChange }) => (
  <input
    type={param.type === "number" ? "number" : "text"}
    value={value || ""}
    onChange={(e) => onChange(param.name, e.target.value)}
    className="mt-1 block w-full border border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
    placeholder={param.placeholder || `Enter ${param.label}`}
  />
);


// SECTION 4: MAIN COMPONENT - BaselineScriptOptions
// -------------------------------------------------------------------------------------------------
function BaselineScriptOptions({ script, parameters, onParamChange }) {
  // State to hold the fetched options for dynamic select dropdowns.
  const [dynamicOptions, setDynamicOptions] = useState({});
  // State to track the loading status of each individual dynamic dropdown.
  const [loadingStates, setLoadingStates] = useState({});

  // Memoize the list of currently visible sidebar parameters to avoid recalculating on every render.
  const sidebarParameters = React.useMemo(() => {
    return script.parameters?.filter(param => {
      // Must have layout: "sidebar"
      if (param.layout !== "sidebar") return false;

      // Handle conditional visibility based on the 'show_if' metadata property.
      if (param.show_if) {
        const controllingParameterValue = parameters[param.show_if.name];
        return controllingParameterValue !== undefined && String(controllingParameterValue) === String(param.show_if.value);
      }

      // If no 'show_if' condition, the parameter is always visible.
      return true;
    }) || [];
  }, [script.parameters, parameters]); // This logic re-runs only when the script definition or form values change.

  /**
   * Fetches options for a single parameter. This is the core logic for handling dynamic
   * and dependent fields. It's memoized to maintain a stable identity across renders.
   */
  const loadOptionsForParam = useCallback(async (param) => {
    if (!param.dynamicOptionsEndpoint) return;

    let endpoint = param.dynamicOptionsEndpoint;

    // Check if the endpoint URL contains a placeholder like '{{param_name}}'.
    const dependencyMatch = endpoint.match(/\{\{(\w+)\}\}/);
    if (dependencyMatch) {
      const dependencyParamName = dependencyMatch[1];
      const dependencyValue = parameters[dependencyParamName];

      // If the parent field (the dependency) isn't selected yet, clear the child's options and stop.
      if (!dependencyValue) {
        setDynamicOptions(prev => ({ ...prev, [param.name]: [] }));
        return;
      }
      // If the parent field has a value, replace the placeholder in the URL.
      endpoint = endpoint.replace(dependencyMatch[0], dependencyValue);
    }

    setLoadingStates(prev => ({ ...prev, [param.name]: true }));
    const options = await fetchDynamicOptions(endpoint);
    setDynamicOptions(prev => ({ ...prev, [param.name]: options }));
    setLoadingStates(prev => ({ ...prev, [param.name]: false }));
  }, [parameters]); // The dependency on `parameters` is crucial. This ensures the function re-runs when any form value changes.

  /**
   * This effect triggers the data loading logic. It runs whenever the list of
   * visible sidebar parameters changes. This is key for `show_if`, as a new field
   * appearing will trigger this effect and fetch its data.
   */
  useEffect(() => {
    sidebarParameters.forEach(param => {
      if (param.dynamicOptionsEndpoint) {
        loadOptionsForParam(param);
      }
    });
  }, [sidebarParameters, loadOptionsForParam]);

  // Render a helpful message if no sidebar options are applicable for the current state.
  if (sidebarParameters.length === 0) {
    return <p className="text-xs text-slate-500 italic">This script has no additional sidebar options.</p>;
  }

  // Map over the visible parameters and render the appropriate input for each.
  return (
    <div className="space-y-6">
      {sidebarParameters.map(param => (
        <div key={param.name}>
          <label className="block text-sm font-semibold text-slate-700">{param.label}</label>
          {param.description && <p className="text-xs text-slate-500 mt-1">{param.description}</p>}

          {param.type === "radio" && <RadioInput param={param} value={parameters[param.name]} onChange={onParamChange} />}

          {(param.type === "select" || param.type === "enum") && (
            <SelectInput
              param={param}
              value={parameters[param.name]}
              onChange={onParamChange}
              options={dynamicOptions[param.name] || param.options || []}
              isLoading={loadingStates[param.name] || false}
            />
          )}

          {(param.type === "text" || param.type === "number") && <TextOrNumberInput param={param} value={parameters[param.name]} onChange={onParamChange} />}
        </div>
      ))}
    </div>
  );
}

export default BaselineScriptOptions;
