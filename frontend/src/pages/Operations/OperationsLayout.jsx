// frontend/src/pages/Operations/OperationsLayout.jsx (FIXED)

import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
// 🔑 Use SidebarLoader, which fetches data and renders the CollapsibleSidebar
import SidebarLoader from '@/components/blocks/SidebarLoader';
// NOTE: Remove the redundant CollapsibleSidebar import and local fetch logic

/**
 * OperationsLayout provides the persistent sidebar and main content area for all /operations/* routes.
 */
export default function OperationsLayout() {
  const location = useLocation();
  const title = "Operations";

  // NOTE: The SidebarLoader component already handles its own loading/error states

  return (
    // ✅ The container for the sidebar + content split, using negative margins 
    // to override the AppLayout's centering container.
    <div className="-mx-4 md:-mx-8 w-full flex min-h-[inherit] h-full overflow-hidden">

      {/* 1. Sidebar Component (SidebarLoader fetches data and renders CollapsibleSidebar) */}
      {/* We pass the base title and the current active path */}
      <SidebarLoader
        title={title}
        activePath={location.pathname} // Highlight the current route
      />

      {/* 2. Main Content Area */}
      {/* The CollapsibleSidebar will define its width, and flex-grow ensures main takes the rest. */}
      <main className="flex-grow overflow-y-auto">
        <Outlet /> {/* <-- THIS renders BackupHistory.jsx, Backup.jsx, etc. */}
      </main>
    </div>
  );
}
