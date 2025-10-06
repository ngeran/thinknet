// frontend/src/pages/Operations/OperationsLayout.jsx

import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import CollapsibleSidebar from '@/components/blocks/CollapsibleSidebar.jsx';
import SidebarLoader from '@/components/blocks/SidebarLoader'; // Assuming this handles the fetching logic

const SIDEBAR_ENDPOINT = "http://127.0.0.1:8000/api/sidebars/operations"; // Your backend endpoint

/**
 * OperationsLayout provides the persistent sidebar and main content area for all /operations/* routes.
 * It fetches its menu items dynamically.
 */
export default function OperationsLayout() {
  const [sidebarItems, setSidebarItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  // Helper to format API data for the CollapsibleSidebar component
  const formatSidebarItems = (items) => {
    return items.map(item => ({
      ...item,
      url: `/operations${item.route}`, // Prepend the parent route
    }));
  };

  useEffect(() => {
    // NOTE: In a real app, you might use a custom hook for this.
    const fetchSidebarData = async () => {
      try {
        const response = await fetch(SIDEBAR_ENDPOINT);
        const data = await response.json();
        setSidebarItems(formatSidebarItems(data.items || data));
      } catch (error) {
        console.error("Failed to fetch operations sidebar data:", error);
        setSidebarItems([]); // Fallback to an empty array on error
      } finally {
        setLoading(false);
      }
    };

    fetchSidebarData();
  }, []);

  // NOTE: Using a loader component might be cleaner, but we'll show the direct rendering here:
  if (loading) {
    return <SidebarLoader title="Operations" />;
  }

  return (
    // ✅ The container for the sidebar + content split, using negative margins 
    // to override the AppLayout's centering container.
    <div className="-mx-4 md:-mx-8 w-auto flex min-h-[inherit] h-full">

      {/* 1. Sidebar Component (The source of the sidebar) */}
      <CollapsibleSidebar
        title="Operations"
        menuItems={sidebarItems}
        basePath="/operations"
        activePath={location.pathname} // Highlight the current route
      />

      {/* 2. Main Content Area (The container for BackupHistory, Backup, etc.) */}
      {/* flex-grow ensures this area takes up all remaining width */}
      <main className="flex-grow overflow-y-auto">
        <Outlet /> {/* <-- THIS renders BackupHistory.jsx, Backup.jsx, etc. */}
      </main>
    </div>
  );
}
