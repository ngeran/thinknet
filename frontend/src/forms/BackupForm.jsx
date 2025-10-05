// File Path: frontend/src/forms/BackupForm.jsx
import React from "react";
// Since DeviceAuthFields is now in 'shared', adjust the import path
import DeviceAuthFields from "../shared/DeviceAuthFields";

// The component only includes the DeviceAuthFields logic, as DeviceTargetSelector 
// is handled directly in the parent page (Backups.jsx).
function BackupForm({ parameters, onParamChange }) {
  return (
    <div className="backup-form">
      {/* AUTHENTICATION FIELDS COMPONENT */}
      <DeviceAuthFields
        parameters={parameters}
        onParamChange={onParamChange}
        title="Device Authentication"
        description="Enter credentials for the device you want to backup"
      />
    </div>
  );
}

export default BackupForm;
