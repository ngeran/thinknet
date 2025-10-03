// frontend/src/lib/navigationUtils.js (Simplified)

import React from 'react';

// =================================================================
// PAGE MAP (URL Key -> Component Loader)
// Description: Maps the URL path (without leading slash) to the lazy-loaded component.
// This is the static instruction set for React Router.
// =================================================================
export const PageMap = {
  // Top-level pages
  'dashboard': React.lazy(() => import('../pages/Dashboard.jsx')),
  'automation': React.lazy(() => import('../pages/Automation.jsx')),

  // Management Pages
  'management/image-uploads': React.lazy(() => import('../pages/Management/ImageUploads.jsx')),
  'management/code-upgrades': React.lazy(() => import('../pages/Management/CodeUpgrades.jsx')),

  // Automation Child Pages
  'automation/templates': React.lazy(() => import('../pages/Automation/Templates.jsx')),
  'automation/validation': React.lazy(() => import('../pages/Automation/Validation.jsx')),

  // Reporting Pages
  'reporting/device-reports': React.lazy(() => import('../pages/Reporting/DeviceReports.jsx')),

  // Operations Pages
  'operations/backups': React.lazy(() => import('../pages/Operations/Backups.jsx')),
  'operations/restore': React.lazy(() => import('../pages/Operations/Restore.jsx')),
};
