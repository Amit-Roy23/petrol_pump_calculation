import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The shared calculation engine is consumed straight from source so the web
// app works without a separate build step for packages/shared.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@petrolpump/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 5173 },
  test: { environment: 'node' },
} as any);
