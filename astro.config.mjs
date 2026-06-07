// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  site: 'https://freemoviesuggestion.com',
  output: 'server',
  adapter: cloudflare({
    prerenderEnvironment: 'node',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [react()],
});
