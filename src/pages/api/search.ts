import type { APIRoute } from 'astro';
import { searchMovies } from '../../services/movieService';
import { getCachedData, setCachedData } from '../../services/cache';

const CACHE_TTL = 900; // 15 minutes

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('q');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    if (!q) {
      return new Response(JSON.stringify({ movies: [], count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cacheKey = `search:q${q}:p${page}:l${limit}`;
    const cached = await getCachedData<any>(cacheKey);

    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=1800',
          'X-Cache': 'HIT'
        }
      });
    }

    const data = await searchMovies(q, { page, limit });

    await setCachedData(cacheKey, data, CACHE_TTL);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=1800',
        'X-Cache': 'MISS'
      }
    });
  } catch (error) {
    console.error('[/api/search] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', movies: [], count: 0 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
