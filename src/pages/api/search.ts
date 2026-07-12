import type { APIRoute } from 'astro';
import { searchMovies } from '../../services/movieService';
import { getCachedData, setCachedData } from '../../services/cache';

const CACHE_TTL = 900; // 15 minutes
const MAX_QUERY_LENGTH = 80;
const MAX_LIMIT = 12;

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = (url.searchParams.get('q') || '').trim().slice(0, MAX_QUERY_LENGTH);
    const pageParam = Number(url.searchParams.get('page') || '1');
    const limitParam = Number(url.searchParams.get('limit') || '6');
    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_LIMIT) : 6;

    if (q.length < 2) {
      return new Response(JSON.stringify({ movies: [], count: 0 }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=1800',
        }
      });
    }

    const cacheKey = `search:v2:q${q.toLowerCase()}:p${page}:l${limit}`;
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
