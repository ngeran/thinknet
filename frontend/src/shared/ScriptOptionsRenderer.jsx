// =========================================================================================
//
// COMPONENT:          ScriptOptionsRenderer.jsx
// FILE:               /src/shared/ScriptOptionsRenderer.jsx
//
// OVERVIEW:
//   Renders script-specific options based on the script metadata
//
// =========================================================================================

import React from 'react';

export default function ScriptOptionsRenderer({ script, parameters, onParamChange }) {
  if (!script?.options) {
    return <p className="text-sm text-muted-foreground">No additional options available.</p>;
  }

  return (
    <div className="space-y-4">
      {script.options.map((option) => (
        <div key={option.name} className="space-y-2">
          <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {option.label}
          </label>

          {option.type === 'select' ? (
            <select
              value={parameters[option.name] || ''}
              onChange={(e) => onParamChange(option.name, e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Select {option.label}</option>
              {option.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : option.type === 'checkbox' ? (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={parameters[option.name] || false}
                onChange={(e) => onParamChange(option.name, e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm">{option.description}</span>
            </div>
          ) : (
            <input
              type={option.type || 'text'}
              value={parameters[option.name] || ''}
              onChange={(e) => onParamChange(option.name, e.target.value)}
              placeholder={option.placeholder}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}

          {option.description && (
            <p className="text-xs text-muted-foreground">{option.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
