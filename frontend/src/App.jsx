// frontend/src/App.jsx (Final Corrected Structure)

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import AppLayout from './layouts/AppLayout.jsx';
// ⚠️ IMPORT THE PROVIDER AND HOOK ⚠️
import { NavigationProvider, useNavigation } from './context/NavigationContext';

// --- Component that reads the routes from Context and renders them ---
function AppRouterContent() {
  // 🚀 Use the hook to get the routes, loading state, and menu data
  const { loading, routes } = useNavigation();

  if (loading) {
    // Full-screen loading while fetching data from FastAPI
    return (
      <div className="flex items-center justify-center h-screen text-xl text-muted-foreground">
        <p>Loading application configuration...</p>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<div className="p-4 text-center">Loading Content...</div>}>
      <Routes>
        {/* AppLayout provides the consistent structure */}
        <Route path="/" element={<AppLayout />}>

          {/* Dynamic Routes from API Gateway */}
          {routes.map((route) => (
            <Route
              key={route.path}
              // The index route must have path=undefined
              path={route.index ? undefined : route.path}
              index={route.index}
              element={<route.Element />}
            />
          ))}

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </React.Suspense>
  );
}

// --- FINAL APP COMPONENT (The Fix is HERE) ---
function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      {/* 🛑 FIX: The <Router> component has been completely removed.
                 The App component now assumes <BrowserRouter> is in main.jsx.
            */}
      <NavigationProvider>
        <AppRouterContent />
      </NavigationProvider>
    </ThemeProvider>
  );
}

export default App;
