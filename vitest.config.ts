/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { buildInfoPlugin } from './buildInfoPlugin';

export default defineConfig({
  plugins: [react(), buildInfoPlugin()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  assetsInclude: ['**/*.3dm'],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    deps: {
      inline: ['three']
    }
  },
});
