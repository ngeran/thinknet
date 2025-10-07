
import React, { createContext, useContext, useState, useEffect } from 'react';
import { PageMap } from '../lib/navigationUtils';

// =================================================================
// CONFIGURATION & CONTEXT
// =================================================================

const API_GATEWAY_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const NAVIGATION_ENDPOINT = `${API_GATEWAY_URL}/api/navigation`;

const NavigationContext = createContext();

export const useNavigation = () => useContext(NavigationContext);

// =================================================================
// ROUTE GENERATOR (Simple Top-Level Routes Only)
// =================================================================
const generateRoutes = (navigationData) => {
  // 🔑 FIX: Initialize routes with the static Dashboard route.
  const routes = [];
  const registeredPaths = new Set(); // Reset set to allow 'dashboard' to be added once

  // 1. Manually add the Dashboard route first, using PageMap
  if (PageMap['dashboard']) {
    routes.push({
      path: 'dashboard',
      element: React.createElement(PageMap['dashboard']),
      title: 'Dashboard'
    });
    registeredPaths.add('dashboard'); // Now mark it as registered
  }
  // If PageMap['dashboard'] is not defined, the error is thrown in useEffect, so this is safe.


  navigationData.forEach(parent => {
    const getParentKey = function () {
      if (parent.url && parent.url.startsWith('/')) return parent.url.slice(1);
      if (parent.url) return parent.url;
      return parent.id;
    };
    const parentKey = getParentKey();

    // Continue to skip 'operations' since it's handled statically in App.jsx
    if (parentKey === 'operations') return;

    // Top-Level Pages (will include any other top-level pages besides dashboard/operations)
    if (PageMap[parentKey]) {
      if (!registeredPaths.has(parentKey)) {
        if (parentKey.indexOf('/') === -1) {
          routes.push({
            path: parentKey,
            element: React.createElement(PageMap[parentKey]),
            title: parent.title
          });
          registeredPaths.add(parentKey);
        }
      }
    }

    // Child Pages (nested dynamic routes)
    if (parent.children) {
      parent.children.forEach(child => {
        const getPathKey = function () {
          // ... (logic remains the same) ...
          if (child.url && child.url.startsWith('/')) return child.url.slice(1);
          if (child.url) return child.url;
          return child.id;
        };
        const pathKey = getPathKey();

        const ChildComponent = PageMap[pathKey];

        if (ChildComponent && !registeredPaths.has(pathKey)) {
          routes.push({
            // NOTE: If the child path is relative (e.g., 'reports/billing'), 
            // this will only work if the parent's component acts as a layout.
            // Since all dynamic routes are children of AppLayout, these should be top-level paths.
            path: pathKey,
            element: React.createElement(ChildComponent),
            title: child.title
          });
          registeredPaths.add(pathKey);
        }
      });
    }
  });

  return routes;
};
// =================================================================
// CONTEXT PROVIDER COMPONENT
// =================================================================

export const NavigationProvider = ({ children }) => {
  const [menuData, setMenuData] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNavigationData = async function () {
      try {
        if (!PageMap['dashboard']) {
          throw new Error("PageMap is incomplete. Cannot generate routes.");
        }

        const response = await fetch(NAVIGATION_ENDPOINT);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const rawData = result.data || result;

        const sanitizedData = rawData.map(item => ({
          ...item,
          children: item.children || [],
        }));

        setMenuData(sanitizedData);
        const generatedRoutes = generateRoutes(sanitizedData);
        setRoutes(generatedRoutes);
      } catch (err) {
        console.error('Failed to fetch and generate navigation:', err);
        setError(err.message);
        setRoutes(generateRoutes([]));
      } finally {
        setLoading(false);
      }
    };

    fetchNavigationData();
  }, []);

  const value = { menuData, routes, loading, error };

  return (
    React.createElement(NavigationContext.Provider, { value }, children) // ✅ Replaces JSX
  );
};
