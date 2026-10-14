import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Builds the studio as a plain single-page app (index.html → src/main.tsx)
// for the Android app. The website keeps using vite.config.ts (vinext + Cloudflare).
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist-android', emptyOutDir: true },
});
