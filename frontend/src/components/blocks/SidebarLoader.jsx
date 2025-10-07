// SidebarLoader.jsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CollapsibleSidebar } from './CollapsibleSidebar';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Component responsible for fetching sidebar configuration from the FastAPI backend
 * and rendering the CollapsibleSidebar with the dynamic data.
 */
export default function SidebarLoader({ title, activePath }) {
  const [navItems, setNavItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSidebarConfig = async () => {
      const configId = 'operations_sidebar_config';
      const url = `/api/sidebar-data/sidebar/${configId}`;

      try {
        const response = await axios.get(url);
        setNavItems(response.data);
        setError(null);
      } catch (err) {
        console.error("Failed to load sidebar configuration:", err);
        if (err.response && err.response.status === 404) {
          setError("Configuration file not found (404). Check backend and YAML path.");
        } else {
          // This captures the 500 error from the backend
          setError("Could not connect to API gateway or backend failed.");
        }
        setNavItems([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSidebarConfig();
  }, []);

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="hidden md:flex flex-col items-center justify-center w-[72px] h-screen border-r">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-xs text-primary mt-2">Loading</p>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="hidden md:flex flex-col items-center p-2 w-[72px] h-screen border-r bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-xs text-destructive text-center mt-1">Config Error</p>
      </div>
    );
  }

  // --- Success State ---
  return (
    <CollapsibleSidebar
      title={title}
      menuItems={navItems}
      activePath={activePath}
    />
  );
}
