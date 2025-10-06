// frontend/src/context/NavigationContext.jsx (FINAL SYNTAX AND ROUTE FIX)

import React, { createContext, useContext, useState, useEffect } from 'react';
import { PageMap } from '../lib/navigationUtils'; // Component-to-path mapping
import { Navigate } from 'react-router-dom'; // For redirection

// =================================================================
// CONFIGURATION & CONTEXT
// =================================================================

const API_GATEWAY_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const NAVIGATION_ENDPOINT = `${API_GATEWAY_URL}/api/navigation`;

const NavigationContext = createContext();

/**
 * Custom hook to access navigation context.
 */
export const useNavigation = () => useContext(NavigationContext);

// =================================================================
// ROUTE GENERATOR (Fixed for Nested Layouts)
// =================================================================

/**
 * Helper function to build nested children routes from PageMap keys.
 */
const buildNestedChildren = (parentKey, registeredPaths) => {
  const childrenMap = {};
  const allPageMapKeys = Object.keys(PageMap);

  // 1. Traverse PageMap keys and build the nested map structure
  allPageMapKeys.forEach(key => {
    if (key.startsWith(parentKey + '/') && PageMap[key] && !registeredPaths.has(key)) {
      const relativePath = key.substring(parentKey.length + 1);
      const segments = relativePath.split('/');

      let currentLevel = childrenMap;

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        if (!currentLevel[segment]) {
          currentLevel[segment] = { path: segment, children: {} };
        }

        // CRITICAL FIX BLOCK: Assigns component as index or element based on segment count
        if (i === segments.length - 1) {
          const ChildRouteComponent = PageMap[key];

          if (segments.length === 1) {
            // e.g., 'backups' -> BackupHistory.jsx (as index)
            currentLevel[segment].indexElement = <ChildRouteComponent />;
          } else {
            // e.g., 'backups/new' -> Backup.jsx (as a regular element)
            currentLevel[segment].element = <ChildRouteComponent />;
          }
          registeredPaths.add(key);
        }
        currentLevel = currentLevel[segment].children;
      }
    }
  });

  // 2. Recursive function to convert the map structure back to a clean array of route objects
  const convertMapToArray = (map) => {
    return Object.values(map).map(route => {
      const childrenArray = convertMapToArray(route.children);

      delete route.children;

      // This ensures the index element is added as the first child, 
      // and the 'element' property is cleared from the parent route.
      if (route.indexElement) {
        childrenArray.unshift({ index: true, element: route.indexElement });
        delete route.indexElement;
        delete route.element; // Ensure we don't accidentally set both element and index
      }

      return {
        ...route,
        children: childrenArray.length > 0 ? childrenArray : undefined,
      };
    });
  };

  return convertMapToArray(childrenMap);
};


/**
 * Generates nested routes structure from backend navigation data.
 * The output is directly consumed by React Router's useRoutes.
 */
const generateRoutes = (navigationData) => {
  const routes = [];
  const registeredPaths = new Set();
  const allPageMapKeys = Object.keys(PageMap);

  // 1. Hardcoded Dashboard route
  if (PageMap['dashboard']) {
    routes.push({
      path: 'dashboard',
      element: <PageMap.dashboard />,
      title: 'Dashboard',
    });
    registeredPaths.add('dashboard');
  }

  // 2. Process backend-provided navigation tree
  navigationData.forEach(parent => {
    const parentKey = parent.url
      ? parent.url.startsWith('/')
        ? parent.url.slice(1)
        : parent.url
      : parent.id;

    const isTopLevelLayout =
      parent.url &&
      parent.url.startsWith('/') &&
      parent.url.slice(1).indexOf('/') === -1;

    // 🚀 2A. Register Parent/Layout Route (e.g., 'operations')
    if (isTopLevelLayout && PageMap[parentKey] && !registeredPaths.has(parentKey)) {
      const LayoutComponent = PageMap[parentKey];

      // 1. Generate nested children routes using the helper function
      let layoutChildren = buildNestedChildren(parentKey, registeredPaths);

      // 2. Add the index redirect (e.g., /operations -> /operations/backups)
      const redirectPathSegment = layoutChildren.length > 0 ? layoutChildren[0].path : '/';
      layoutChildren.unshift({
        index: true,
        element: <Navigate to={redirectPathSegment} replace />,
      });


      const routeObject = {
        path: parentKey, // e.g., 'operations'
        element: <LayoutComponent />, // Renders OperationsLayout.jsx
        title: parent.title,
        children: layoutChildren, // Contains the index redirect and all relative sub-pages
      };

      routes.push(routeObject);
      registeredPaths.add(parentKey); // Mark the layout path as handled
    }

    // 2B. Register standalone pages from YAML children 
    parent.children?.forEach(child => {
      const pathKey = child.url.startsWith('/') ? child.url.slice(1) : child.url;
      const ChildComponent = PageMap[pathKey];

      if (ChildComponent && !registeredPaths.has(pathKey)) {
        routes.push({
          path: pathKey,
          element: <ChildComponent />,
          title: child.title,
        });
        registeredPaths.add(pathKey);
      }
    });
  });

  // 3. Register any unmatched static routes from PageMap 
  Object.keys(PageMap).forEach(key => {
    if (!registeredPaths.has(key) && key !== 'dashboard') {
      const Component = PageMap[key];
      if (Component) {
        routes.push({
          path: key,
          element: <Component />,
        });
        registeredPaths.add(key);
      }
    }
  });

  return routes;
};

// =================================================================
// CONTEXT PROVIDER COMPONENT
// =================================================================

/**
 * Provides navigation routes and menu structure to the app.
 */
export const NavigationProvider = ({ children }) => {
  const [menuData, setMenuData] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNavigationData = async () => {
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

        // Ensure children is always an array
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

        // Safe fallback: at least return dashboard if possible
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
