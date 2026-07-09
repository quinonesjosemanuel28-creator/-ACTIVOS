import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: el build funciona en la raíz o en subcarpetas del hosting.
  base: './',
  // PostCSS inline vacío: evita que Vite herede el postcss.config.js del
  // dashboard que vive en la raíz del repositorio.
  css: { postcss: { plugins: [] } },
  build: {
    // One-page + páginas legales placeholder.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacidad: resolve(__dirname, 'privacidad.html'),
        legal: resolve(__dirname, 'legal.html'),
      },
      output: {
        // Three.js en su propio chunk: se carga diferido solo si el hero 3D monta.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap')) return 'gsap';
        },
      },
    },
  },
});
