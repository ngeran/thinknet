// frontend/src/main.jsx (FINAL WITH REACT ROUTER WARNINGS FIXED)

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css'; // Global CSS, imports Tailwind/shadcn base styles
import { ThemeProvider } from './providers/ThemeProvider.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Provides dark/light theme functionality */}
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      {/* 🔑 REACT ROUTER FIX: Add future flags to silence warnings and opt-in to v7 behavior */}
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
