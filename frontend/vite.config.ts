import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Mismo origen para que la cookie httpOnly del refresh token funcione.
    // API_PROXY_TARGET permite apuntar a otro backend (p. ej. las pruebas E2E con su propio puerto).
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  preview: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        // Dependencias estables en chunks propios: un despliegue que solo cambia código de la app
        // no invalida su caché en el navegador (ver docs/rendimiento-qa.md).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]@tanstack[\\/]/.test(id)) return 'vendor-tanstack';
          if (/[\\/]zod[\\/]/.test(id)) return 'vendor-zod';
          return undefined;
        },
      },
    },
  },
});
