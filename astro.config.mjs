import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Static output so the site deploys cleanly to Cloudflare Pages
// (and any other static host: Netlify, Vercel static, GitHub Pages, S3+CDN, etc.)
// All "heavy" math runs in browser Web Workers served from /public/workers/.
export default defineConfig({
  site: 'https://craftclass.local',
  output: 'static',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
    worker: {
      format: 'es',
    },
  },
  integrations: [sitemap()],
  server: {
    port: 4321,
  },
});
