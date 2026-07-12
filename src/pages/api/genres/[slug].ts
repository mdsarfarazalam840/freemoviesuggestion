import type { APIRoute } from 'astro';
import { getMoviesPage } from '../../../services/movieService';
import { getCachedData, setCachedData } from '../../../services/cache';

const CACHE_TTL = 3600; // 1 hour
const MAX_LIMIT = 30;

export const prerender = false;

export const GET: APIRoute = async ({ params, url }) => {
  try {
    const slug = params.slug?.trim().toLowerCase();
    const pageParam = Number(url.searchParams.get('page') || '1');
    const limitParam = Number(url.searchParams.get('limit') || '24');
    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_LIMIT) : 24;

    if (!slug) return new Response('Missing genre slug', { status: 400 });

    const cacheKey = `genre:v2:${slug}:p${page}:l${limit}`;
    const cached = await getCachedData<any>(cacheKey);

    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=3600',
          'X-Cache': 'HIT'
        }
      });
    }

    // Capitalize first letter as our genres are stored that way
    const genre = slug.charAt(0).toUpperCase() + slug.slice(1);

    const data = await getMoviesPage({ page, limit, genre });

    await setCachedData(cacheKey, data, CACHE_TTL);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
        'X-Cache': 'MISS'
      }
    });
  } catch (error) {
    console.error('[/api/genres/:slug] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', movies: [], count: 0, page: 1, limit: 24, totalPages: 0 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
