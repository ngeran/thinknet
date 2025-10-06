// frontend/src/lib/navigationUtils.js (FINALIZED)

import React from 'react';

// =================================================================
// PAGE MAP (URL Key -> Component Loader)
// The key here MUST match the path segment after the leading slash 
// (e.g., 'operations' for '/operations')
// =================================================================
export const PageMap = {
  // --- Core Route ---
  'dashboard': React.lazy(() => import('../pages/Dashboard.jsx')),

  // 🛑 FIX: The base route for the 'Operations' main menu link now loads the Layout
  'operations': React.lazy(() => import('../pages/Operations/OperationsLayout.jsx')),

  // --- Operations Child Routes ---
  // These are the targets loaded by the Layout's <Outlet>
  'operations/backups': React.lazy(() => import('../pages/Operations/BackupHistory.jsx')),
  'operations/backups/new-job': React.lazy(() => import('../pages/Operations/Backup.jsx')),
  'operations/restore': React.lazy(() => import('../pages/Operations/RestorePage.jsx')),
  'operations/backup/settings': React.lazy(() => import('../pages/Operations/BackupSettings.jsx')),

  // --- Other Top-Level Routes ---
  'management/image-uploads': React.lazy(() => import('../pages/Management/ImageUploads.jsx')),
  'management/code-upgrades': React.lazy(() => import('../pages/Management/CodeUpgrades.jsx')),
  'automation/templates': React.lazy(() => import('../pages/Automation/Templates.jsx')),
  'automation/validation': React.lazy(() => import('../pages/Automation/Validation.jsx')),
  'reporting/device-reports': React.lazy(() => import('../pages/Reporting/DeviceReports.jsx')),
};
