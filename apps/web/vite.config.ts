import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Dev only: serve the Vercel functions in /api from the Vite dev server so the
 * whole app (frontend + backend) runs with `pnpm dev`. Enabled when APP_PASSWORD
 * is set in the repo-root .env.local; uses MONGODB_URI if present, otherwise an
 * in-memory database. In production Vercel serves /api itself.
 */
function localApi(): Plugin {
  return {
    name: 'fuel-ledger-local-api',
    apply: 'serve',
    async configureServer(server) {
      Object.assign(process.env, loadEnv('development', path.resolve(__dirname, '../..'), ''));
      if (!process.env.APP_PASSWORD) return;
      const { health, login, dataHandler } = await import('../../api/_lib/handlers');
      const { memoryStore, mongoStore } = await import('../../api/_lib/store');
      if (!process.env.MONGODB_URI) process.env.MONGODB_URI = 'memory://local';
      const store = process.env.MONGODB_URI.startsWith('memory:') ? memoryStore() : mongoStore();
      const data = dataHandler(() => store);
      server.config.logger.info(`  ➜  API:     /api (${process.env.MONGODB_URI.startsWith('memory:') ? 'in-memory database' : 'MongoDB'})`);
      server.middlewares.use('/api', (req, res, next) => {
        const route = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const handler = route === 'health' ? health : route === 'login' ? login : route === 'data' ? data : null;
        if (!handler) return next();
        req.url = '/api' + req.url;
        void handler(req, res);
      });
    },
  };
}

// The shared calculation engine is consumed straight from source so the web
// app works without a separate build step for packages/shared.
export default defineConfig({
  base: '/',
  plugins: [react(), localApi()],
  resolve: {
    alias: {
      '@petrolpump/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { port: 5173 },
  test: { environment: 'node' },
} as any);
