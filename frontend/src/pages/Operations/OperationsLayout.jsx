// frontend/src/pages/Operations/OperationsLayout.jsx (Final Corrected)

import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SidebarLoader from '@/components/blocks/SidebarLoader';

export default function OperationsLayout() {
  const location = useLocation();
  const title = "Operations";

  return (
    // ✅ FIX 1: Apply the Header/Footer alignment classes to the outer container.
    // This constrains the entire sidebar+content block to max-w-7xl and centers it.
    <div className="max-w-7xl mx-auto w-full flex min-h-[inherit] h-full overflow-hidden">

      {/* 1. Sidebar Component (SidebarLoader) */}
      <SidebarLoader
        title={title}
        activePath={location.pathname} // Highlight the current route
      />

      {/* 2. Main Content Area */}
      {/* 🔑 FIX 2: Apply the responsive padding to the main content area 
          to align the text with the Header/Footer logos. */}
      <main className="flex-grow overflow-y-auto px-4 sm:px-6 lg:px-8 py-4">
        <Outlet /> {/* <-- THIS renders BackupHistory.jsx, Backup.jsx, etc. */}
      </main>
    </div>
  );
}
