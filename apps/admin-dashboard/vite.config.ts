import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { discoveryPlugin } from './build/discovery';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    // Workspace dependencies and external test renderers must share one runtime,
    // including React Compiler's react/compiler-runtime subpath.
    alias: {
      react: fileURLToPath(new URL('../../node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('../../node_modules/react-dom', import.meta.url)),
    },
  },
  plugins: [
    discoveryPlugin(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
      },
    }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/health': { target: process.env.FIDUSGATE_API_TARGET || 'http://localhost:3001', changeOrigin: true },
      '/metrics': { target: process.env.FIDUSGATE_METRICS_TARGET || 'http://localhost:3002', changeOrigin: true },
      '/api': {
        target: process.env.FIDUSGATE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
