import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@revoshelf/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-not-real',
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
});
