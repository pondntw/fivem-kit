import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  // NUI loads the page from nui://<resource>/web/dist/, so every asset URL must be relative.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // FiveM's embedded Chromium is not always the newest; keep the output conservative.
    target: 'chrome103',
  },
});
