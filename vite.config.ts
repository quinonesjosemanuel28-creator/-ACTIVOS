import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// La UI (CAPA 1) solo conoce el dominio puro y el cliente HTTP.
// `@infrastructure` no se resuelve aquí a propósito: better-sqlite3 nunca
// debe terminar en el bundle del navegador (inversión de dependencias).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
