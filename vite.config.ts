/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than app code; separate chunks cache better.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          data: ['dexie', 'dexie-react-hooks', 'zod'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Page tests seed a database and render the whole app; allow for slow, busy machines.
    testTimeout: 20_000,
  },
});
