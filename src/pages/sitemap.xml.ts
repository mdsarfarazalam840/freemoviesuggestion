import type { APIRoute } from 'astro';
import { getAllMovieSlugs } from '../services/movieService';
import { GENRES, REGIONS, OTT_PLATFORMS } from '../data/movies';

export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response('Site URL not configured', { status: 500 });
  }

  const slugs = await getAllMovieSlugs();
  const lastMod = new Date().toISOString().split('T')[0];

  const staticPages = [
    '',
    '/movies',
    '/about',
    '/privacy',
  ];

  const genrePages = GENRES.map(genre => `/genre/${genre.toLowerCase()}`);
  const regionPages = REGIONS.map(region => `/region/${region.toLowerCase()}`);
  const ottPages = OTT_PLATFORMS.map(ott => `/ott/${ott.name.toLowerCase().replace('+', 'plus').replace(' ', '-')}`);
  const moviePages = slugs.map(slug => `/movie/${slug}`);

  const allPages = [...staticPages, ...genrePages, ...regionPages, ...ottPages, ...moviePages];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(page => `  <url>
    <loc>${new URL(page, site).href}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>${page.startsWith('/movie/') ? 'monthly' : 'daily'}</changefreq>
    <priority>${page === '' ? '1.0' : page.startsWith('/movie/') ? '0.7' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(sitemap, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400'
    }
  });
};
