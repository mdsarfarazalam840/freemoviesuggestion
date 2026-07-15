import type { APIRoute } from 'astro';
import { getMoviesPage } from '../../services/movieService';
import { getCachedData, setCachedData } from '../../services/cache';

const CACHE_TTL = 3600; // 1 hour
const MAX_LIMIT = 30;

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const pageParam = Number(url.searchParams.get('page') || '1');
    const limitParam = Number(url.searchParams.get('limit') || '24');
    const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_LIMIT) : 24;
    const region = url.searchParams.get('region')?.trim() || null;
    const genre = url.searchParams.get('genre')?.trim() || null;
    const ott = url.searchParams.get('ott')?.trim() || null;
    const mood = url.searchParams.get('mood')?.trim() || null;

    const cacheKey = `movies:list:v3:p${page}:l${limit}:r${region?.toLowerCase() || 'any'}:g${genre?.toLowerCase() || 'any'}:o${ott?.toLowerCase() || 'any'}:m${mood?.toLowerCase() || 'any'}`;
    
    const cached = await getCachedData<any>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
          'X-Cache': 'HIT'
        }
      });
    }

    const data = await getMoviesPage({ page, limit, region, genre, ott, mood });
    
    await setCachedData(cacheKey, data, CACHE_TTL);
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
        'X-Cache': 'MISS'
      }
    });
  } catch (error) {
    console.error('[/api/movies] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', movies: [], count: 0, page: 1, limit: 24, totalPages: 0 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
