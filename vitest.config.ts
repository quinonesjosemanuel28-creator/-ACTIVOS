import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // JSX automático para los tests de render de componentes (no requiere
  // importar React en cada archivo, igual que la app con Vite).
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
    },
  },
  test: {
    environment: 'node',
    // src: dominio/aplicación/infra/UI · server: integración HTTP por rol.
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
  },
});
