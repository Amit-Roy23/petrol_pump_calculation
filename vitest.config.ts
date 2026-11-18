import { defineConfig } from 'vitest/config';
import path from 'path';

// Root tests (API + end-to-end maths) also load the web app's calculation code.
export default defineConfig({
  resolve: { alias: { '@petrolpump/shared': path.resolve(__dirname, 'packages/shared/src/index.ts') } },
  test: { environment: 'node', include: ['**/*.test.ts'] },
});
