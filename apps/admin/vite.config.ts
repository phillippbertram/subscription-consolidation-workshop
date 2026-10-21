import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // ADMIN_API_URL has no VITE_ prefix on purpose: only this config reads it,
  // and it never reaches the browser bundle.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  const target = env.ADMIN_API_URL || 'http://127.0.0.1:3000';
  const proxy = { '/admin': { target } };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // The browser calls /admin/* on this origin and Vite forwards it to the
    // local API. Same origin means the API needs no CORS rule for admin routes.
    server: { proxy },
    preview: { proxy },
  };
});
