import { defineConfig } from 'vite';

export default defineConfig({
  preview: {
    allowedHosts: ['dash8-website.onrender.com', 'dash8studio.com', 'www.dash8studio.com'],
  },
  build: {
    assetsDir: '_assets',
  },
});
