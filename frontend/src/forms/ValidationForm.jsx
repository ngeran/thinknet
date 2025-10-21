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
//   - Dynamic Tests: Uses test data from the Atlas API
//
// =========================================================================================

// ====================================================================================
// SECTION 1: IMPORTS
// ====================================================================================
import React from 'react';
import DeviceAuthFields from '@/shared/DeviceAuthFields.jsx';
import DeviceTargetSelector from '@/shared/DeviceTargetSelector.jsx';
import TestSelector from '@/shared/TestSelector.jsx';

// ====================================================================================
// SECTION 2: MAIN COMPONENT DEFINITION
// ====================================================================================
/**
 * @description Renders the main form inputs for the Validation tool.
 * @param {object} props - Component props.
 * @param {object} props.parameters - The current parameter values for the form.
 * @param {(name: string, value: any) => void} props.onParamChange - The callback to handle changes.
 * @param {object} props.categorizedTests - Tests organized by category from the API.
 * @param {boolean} props.testsLoading - Whether tests are currently being loaded.
 * @param {string} props.testsError - Any error message from loading tests.
 */
export default function ValidationForm({
  parameters,
  onParamChange,
  categorizedTests = {},
  testsLoading = false,
  testsError = null
}) {

  // Handle test selection changes
  const handleTestToggle = (testId) => {
    const currentTests = Array.isArray(parameters.tests) ? parameters.tests : [];
    const updatedTests = currentTests.includes(testId)
      ? currentTests.filter(t => t !== testId)
      : [...currentTests, testId];

    onParamChange('tests', updatedTests);
  };

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

        {/* Loading State */}
        {testsLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3 text-sm text-muted-foreground">Loading available tests...</span>
          </div>
        )}

        {/* Error State */}
        {testsError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
            <p className="text-sm text-destructive">
              Failed to load tests: {testsError}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Please check if the API server is running and try again.
            </p>
          </div>
        )}

        {/* Tests Loaded Successfully */}
        {!testsLoading && !testsError && (
          <>
            {/* Selected Tests Summary */}
            {parameters.tests && parameters.tests.length > 0 && (
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-sm font-medium mb-2">
                  Selected Tests: {parameters.tests.length}
                </p>
                <div className="flex flex-wrap gap-1">
                  {parameters.tests.map(testId => (
                    <span
                      key={testId}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    >
                      {testId}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Test Selector Component */}
            <div className="border rounded-lg p-4 bg-card">
              <TestSelector
                categorizedTests={categorizedTests}
                selectedTests={Array.isArray(parameters.tests) ? parameters.tests : []}
                onTestToggle={handleTestToggle}
              />
            </div>

            {/* No Tests Available */}
            {Object.keys(categorizedTests).length === 0 && !testsLoading && !testsError && (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No validation tests available.</p>
                <p className="text-xs mt-1">
                  Check if test files are properly configured in the tests directory.
                </p>
              </div>
            )}
          </>
        )}

        {/* Helper Text */}
        <div className="text-xs text-muted-foreground">
          <p>• Tests are loaded dynamically from the configured test directory</p>
          <p>• Select one or more tests to run against the target device(s)</p>
          <p>• Test files must be in YAML format with proper test definitions</p>
        </div>
      </div>
    </div>
  );
}
