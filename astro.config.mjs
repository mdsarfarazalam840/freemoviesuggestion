// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://freemoviesuggestion.com',
  // Astro 7 changed the default to 'jsx', which strips whitespace between
  // inline elements. Pinned to keep Astro 6 rendering byte-identical.
  compressHTML: true,
  adapter: cloudflare(),
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react()],
});
