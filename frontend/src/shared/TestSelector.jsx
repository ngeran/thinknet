// src/components/TestSelector.jsx
import React from "react";

// This "dumb" component just renders the UI for selecting tests.
// It receives all data and handlers as props.
function TestSelector({ categorizedTests, selectedTests, onTestToggle }) {
  if (Object.keys(categorizedTests).length === 0) {
    return (
      <p className="text-xs text-slate-500 italic">
        No tests found for this script.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(categorizedTests).map(([category, tests]) => (
        <details key={category} className="border-t border-slate-200 pt-3" open>
          <summary className="text-xs font-semibold text-slate-600 uppercase cursor-pointer list-none">
            {category}
          </summary>
          <div className="mt-2 space-y-2 pl-2">
            {tests.map((test) => (
              <label
                key={test.id}
                className="flex items-center text-sm text-slate-700"
                title={test.description}
              >
                <input
                  type="checkbox"
                  checked={selectedTests.includes(test.id)}
                  onChange={() => onTestToggle(test.id)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 font-mono text-xs">{test.id}</span>
              </label>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

export default TestSelector;
