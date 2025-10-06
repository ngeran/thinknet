// frontend/src/App.jsx

import React from 'react';
// 🛑 FIX: BrowserRouter is removed from imports as it now resides only in main.jsx
import { useRoutes, Navigate } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import AppLayout from './layouts/AppLayout.jsx';
import { NavigationProvider, useNavigation } from './context/NavigationContext';

// =================================================================
// ROUTE STRUCTURE GENERATOR
// =================================================================

/**
 * Creates the final route array structure for React Router's useRoutes hook.
 * All dynamic routes are placed as children of the AppLayout (path: '/').
 * * @param {Array<Object>} dynamicRoutes - Routes fetched and processed by NavigationContext.
 * @returns {Array<Object>} The complete, structured array for useRoutes.
 */
const createRouteStructure = (dynamicRoutes) => {
  return [
    {
      path: '/',
      element: <AppLayout />, // The main application layout component
      children: [
        // 1. Root Redirect: Redirects the base URL (/) to /dashboard
        { index: true, element: <Navigate to="/dashboard" replace /> },

        // 2. Dynamic Routes: Routes built from the backend configuration.
        // This includes top-level pages and layout routes (e.g., 'operations' with its children).
        ...dynamicRoutes,

        // 3. Fallback Route: Catches any unhandled URL (404)
        { path: '*', element: <div className="p-4 text-center">404: Page Not Found</div> }
      ]
    }
  ];
};

// =================================================================
// ROUTER CONTENT CONSUMER
// =================================================================
function AppRouterContent() {
  // 🚀 FIX: The useNavigation hook is called unconditionally here, preventing 
  // the "change in the order of Hooks" violation.
  const { loading, routes } = useNavigation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-xl text-muted-foreground">
        <p>Loading application configuration...</p>
      </div>
    );
  }

  // 🛑 CRITICAL: useRoutes consumes the structured route array and returns the 
  // rendered component tree, applying the routing logic dynamically.
  const finalRoutes = createRouteStructure(routes);
  const routeElements = useRoutes(finalRoutes);

  return (
    <React.Suspense fallback={<div className="p-4 text-center">Loading Content...</div>}>
      {routeElements}
    </React.Suspense>
  );
}

// =================================================================
// FINAL APP COMPONENT
// =================================================================
function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      {/* 🛑 FIX: The BrowserRouter is now REMOVED from here. 
                The router context is provided by <BrowserRouter> in main.jsx. */}
      <NavigationProvider>
        {/* AppRouterContent uses useNavigation and useRoutes to render the dynamic routing */}
        <AppRouterContent />
      </NavigationProvider>
    </ThemeProvider>
  );
}

export default App;
