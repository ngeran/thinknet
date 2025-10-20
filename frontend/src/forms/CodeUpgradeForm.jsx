/**
 * =============================================================================
 * CODE UPGRADE FORM COMPONENT
 * =============================================================================
 * A dedicated form component that assembles the necessary user input fields for
 * the Code Upgrade script.
 * 
 * @version 1.0.0
 * @last_updated 2025-10-18
 * =============================================================================
 */

import React from 'react';

// Shared components
import DeviceTargetSelector from '@/shared/DeviceTargetSelector';
import DeviceAuthFields from '@/shared/DeviceAuthFields';

/**
 * Code Upgrade Form Component
 * Renders the complete set of input fields required for the Code Upgrade script
 */
export default function CodeUpgradeForm({
  script = {}, // Provide default empty object
  parameters,
  onParamChange
}) {
  // Safe access with defaults
  const deviceTargetingTitle = script?.deviceTargeting?.title || "Target Device Selection";
  const deviceTargetingDescription = script?.deviceTargeting?.description || "Select target for the upgrade";
  const deviceAuthTitle = script?.deviceAuth?.title || "Device Authentication";
  const deviceAuthDescription = script?.deviceAuth?.description || "Provide credentials for device access";

  return (
    <div className="space-y-6">
      {/* Device Target Selection */}
      <DeviceTargetSelector
        parameters={parameters}
        onParamChange={onParamChange}
        script={script}
        title={deviceTargetingTitle}
        description={deviceTargetingDescription}
      />

      {/* Device Authentication */}
      <DeviceAuthFields
        parameters={parameters}
        onParamChange={onParamChange}
        script={script}
        title={deviceAuthTitle}
        description={deviceAuthDescription}
      />
    </div>
  );
}
