// =========================================================================================
//
// COMPONENT:          ValidationForm.jsx
// FILE:               /src/forms/ValidationForm.jsx
//
// OVERVIEW:
//   A streamlined, presentational component that renders the core input fields for
//   the Validation Runner's main content area.
//
// KEY FEATURES:
//   - Focused Responsibility: Handles only the device targeting and authentication fields
//   - Reusability: Leverages shared components for consistent look and feel
//   - Test Selection: Includes validation test selection in the main form area
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS
// ====================================================================================
import React from 'react';
import DeviceAuthFields from '@/shared/DeviceAuthFields.jsx';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector.jsx';

// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
/**
 * @description Renders the main form inputs for the Validation tool.
 * @param {object} props - Component props.
 * @param {object} props.parameters - The current parameter values for the form.
 * @param {(name: string, value: any) => void} props.onParamChange - The callback to handle changes.
 */
export default function ValidationForm({ parameters, onParamChange }) {

  // Common validation tests that can be selected
  const validationTests = [
    { value: 'interface_status', label: 'Interface Status' },
    { value: 'bgp_neighbors', label: 'BGP Neighbors' },
    { value: 'ospf_neighbors', label: 'OSPF Neighbors' },
    { value: 'system_health', label: 'System Health' },
    { value: 'license_status', label: 'License Status' },
    { value: 'environment', label: 'Environment Sensors' },
    { value: 'routing_table', label: 'Routing Table' },
  ];

  // ====================================================================================
  // SECTION 3: JSX RENDER METHOD
  // ====================================================================================
  return (
    <div className="space-y-6">
      {/* Component for selecting a target device via hostname or inventory */}
      <DeviceTargetSelector
        parameters={parameters}
        onParamChange={onParamChange}
      />

      <div className="border-t my-6"></div>

      {/* Component for entering device authentication credentials */}
      <DeviceAuthFields
        parameters={parameters}
        onParamChange={onParamChange}
      />

      <div className="border-t my-6"></div>

      {/* Validation Test Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Validation Tests</h3>
        <p className="text-sm text-muted-foreground">
          Select the validation tests to run against the target device(s)
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {validationTests.map((test) => (
            <div key={test.value} className="flex items-center space-x-3">
              <input
                type="checkbox"
                id={`test-${test.value}`}
                checked={Array.isArray(parameters.tests) && parameters.tests.includes(test.value)}
                onChange={(e) => {
                  const currentTests = Array.isArray(parameters.tests) ? parameters.tests : [];
                  if (e.target.checked) {
                    onParamChange('tests', [...currentTests, test.value]);
                  } else {
                    onParamChange('tests', currentTests.filter(t => t !== test.value));
                  }
                }}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label
                htmlFor={`test-${test.value}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {test.label}
              </label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
