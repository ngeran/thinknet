// frontend/src/main.jsx
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
      {/* Provides routing functionality */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
