import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@revoshelf/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts') } },
  server: { port: 5173 },
});
