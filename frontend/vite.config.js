// frontend/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // 1. Vite Server Configuration for Docker
  server: {
    // CRITICAL: Tells the container's Vite server to listen on all 
    // network interfaces, making it accessible to the host machine.
    host: '0.0.0.0',
    port: 5173, // Matches the exposed port in docker-compose.yml

    // ⭐️ CRITICAL FIX: Add Proxy for API Gateway ⭐️
    proxy: {
      // All requests starting with '/api' (e.g., /api/sidebar-data/...)
      '/api': {
        // Are redirected to the FastAPI service running on port 8000
        target: 'http://fastapi_gateway:8000',
        // Necessary for correctly handling host headers
        changeOrigin: true,
      },
    },
  },

  // 2. Alias configuration (already correct)
  resolve: {
    alias: {
      // Maps the '@/ alias to the './src' directory
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
