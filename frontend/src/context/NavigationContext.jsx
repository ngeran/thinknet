
// frontend/src/context/NavigationContext.jsx

import React, { createContext, useContext, useState, useEffect } from 'react';
import { PageMap } from '../lib/navigationUtils'; // Import the component mapping

// =================================================================
// CONFIGURATION
// =================================================================
// API Gateway base URL from environment variables (assuming it's VITE_API_BASE_URL)
const API_GATEWAY_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const NAVIGATION_ENDPOINT = `${API_GATEWAY_URL}/api/navigation`;

// Create the Context
const NavigationContext = createContext();

/**
 * Hook to consume navigation data (routes and menu structure)
 * @returns {{loading: boolean, menuData: Array, routes: Array}}
 */
export const useNavigation = () => useContext(NavigationContext);

// =================================================================
// ROUTE GENERATOR (Moved/Modified from navigationUtils.js)
// =================================================================

/**
 * Flattens the nested navigation data into a single array of routes.
 * @param {Array<Object>} navigationData - The nested data array fetched from FastAPI.
 * @returns {Array<{path: string, Element: React.Component, ...}>}
 */
const generateRoutes = (navigationData) => {
  const routes = [];

  // 1. Add the Dashboard as the primary index route
  routes.push({
    path: '/',
    Element: PageMap['dashboard'], // Assuming 'dashboard' is mapped in PageMap
    title: 'Dashboard',
    index: true,
  });

  navigationData.forEach(parent => {
    // Handle base route like /automation if it exists in PageMap
    const baseRouteKey = parent.id;
    if (PageMap[baseRouteKey] && parent.id !== 'dashboard') {
      routes.push({
        path: `/${baseRouteKey}`,
        Element: PageMap[baseRouteKey],
        title: parent.title,
        baseRoute: true,
      });
    }

    // 2. Iterate through all child links and create a route for each
    parent.children.forEach(child => {
      const pathKey = child.url.startsWith('/') ? child.url.slice(1) : child.url;
      const Component = PageMap[pathKey];

      if (Component) {
        routes.push({
          path: child.url,
          Element: Component,
          title: child.title,
          parentTitle: parent.title,
        });
      } else {
        console.warn(`[Routing Error] Component not mapped for URL: ${child.url}. Key: ${pathKey}`);
      }
    });
  });

  return routes;
};


// =================================================================
// CONTEXT PROVIDER
// =================================================================
export const NavigationProvider = ({ children }) => {
  // raw nested data for the UI (MegaMenu, Sidebar)
  const [menuData, setMenuData] = useState([]);
  // flat routes for React Router (App.jsx)
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNavigationData = async () => {
      try {
        // Ensure PageMap has loaded before fetching and generating
        if (!PageMap['dashboard']) {
          // This scenario should be rare if imports are correct
          throw new Error("PageMap is incomplete. Cannot generate routes.");
        }

        const response = await fetch(NAVIGATION_ENDPOINT);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
        }

        const result = await response.json();

        // Use result.data if the backend wraps the array, otherwise use result directly
        const rawData = result.data || result;

        // Set the raw nested data for UI components
        setMenuData(rawData);

        // Generate the flat routes array for React Router
        const generatedRoutes = generateRoutes(rawData);
        setRoutes(generatedRoutes);

      } catch (err) {
        console.error('Failed to fetch and generate navigation:', err);
        setError(err.message);
        // On failure, set routes only to the dashboard route to keep the app running
        setRoutes(generateRoutes([]));
      } finally {
        setLoading(false);
      }
    };

    fetchNavigationData();
  }, []);

  const value = { menuData, routes, loading, error };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
};
