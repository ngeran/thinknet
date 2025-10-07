// frontend/src/App.jsx

import React from 'react';
import { useRoutes, Navigate } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import AppLayout from './layouts/AppLayout.jsx';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

// Import the specific layout and components for the Operations route (Static Import)
import OperationsLayout from './pages/Operations/OperationsLayout.jsx';
import BackupHistory from './pages/Operations/BackupHistory.jsx';
import Backup from './pages/Operations/Backup.jsx';
import RestorePage from './pages/Operations/RestorePage.jsx';
import BackupSettings from './pages/Operations/BackupSettings.jsx';


// =================================================================
// ROUTE STRUCTURE GENERATOR
// =================================================================

/**
 * Creates the final route array structure for React Router's useRoutes hook.
 * @param {Array<Object>} dynamicRoutes - Routes fetched (excluding operations).
 * @returns {Array<Object>} The complete, structured array for useRoutes.
 */
const createRouteStructure = (dynamicRoutes) => {
  return [
    {
      path: '/',
      element: <AppLayout />,
      children: [
        // 1. Root Redirect
        { index: true, element: <Navigate to="/dashboard" replace /> },

        // 2. STATIC OPERATIONS LAYOUT
        {
          path: 'operations',
          element: <OperationsLayout />,
          children: [
            // Index Redirect: /operations -> /operations/backups
            { index: true, element: <Navigate to="backups" replace /> },

            // Nested Children (Path is relative to parent: 'operations')
            { path: 'backups', element: <BackupHistory /> },
            { path: 'backups/new-job', element: <Backup /> },
            { path: 'restore', element: <RestorePage /> },
            { path: 'backup/settings', element: <BackupSettings /> },
          ],
        },

        // 3. Dynamic Routes (All other top-level pages)
        ...dynamicRoutes,

        // 4. Fallback Route
        { path: '*', element: <div className="p-4 text-center">404: Page Not Found</div> }
      ]
    }
  ];
};

// =================================================================
// ROUTER CONTENT CONSUMER & APP
// =================================================================

/**
 * Component responsible for rendering the routes using useRoutes.
 * It is mounted only when loading is complete.
 */
function RouteElements({ routes, error }) {

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        <h1>Configuration Load Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  // Call useRoutes ONLY when the data is guaranteed to be available
  const finalRoutes = createRouteStructure(routes);
  const routeElements = useRoutes(finalRoutes); // ⬅️ Hook called consistently here

  return (
    <React.Suspense fallback={<div className="p-4 text-center">Loading Content...</div>}>
      {routeElements}
    </React.Suspense>
  );
}


/**
 * Main component that manages the Navigation Context and determines the loading state.
 */
function AppRouterContent() {
  // 🔑 HOOKS FIX: Call useNavigation once and unconditionally at the top.
  const { loading, routes, error } = useNavigation(); // ⬅️ Hook called consistently here

  // Handle Loading State (Return early before rendering routes)
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-xl text-muted-foreground">
        <p>Loading application configuration...</p>
      </div>
    );
  }

  // Render the route-dependent component only after loading is false.
  return (
    <RouteElements
      routes={routes}
      error={error}
    />
  );
}

/**
 * Root Application component that wraps providers.
 */
function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <NavigationProvider>
        <AppRouterContent />
      </NavigationProvider>
    </ThemeProvider>
  );
}

export default App;
