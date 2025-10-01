// frontend/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 1. Import 'path'
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // 2. Add the resolve configuration
  resolve: {
    alias: {
      // Maps the '@/' alias to the './src' directory
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
