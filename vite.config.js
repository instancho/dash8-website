import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  preview: {
    allowedHosts: ['dash8-website.onrender.com'],
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'js/*', dest: '.' },
      ],
    }),
  ],
});
