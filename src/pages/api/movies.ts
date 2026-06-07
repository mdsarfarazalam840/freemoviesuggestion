import type { APIRoute } from 'astro';
import { getMoviesPage } from '../../services/movieService';
import { getCachedData, setCachedData } from '../../services/cache';

const CACHE_TTL = 3600; // 1 hour

export const GET: APIRoute = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '24', 10);
  const region = url.searchParams.get('region');
  const genre = url.searchParams.get('genre');
  const ott = url.searchParams.get('ott');

  const cacheKey = `movies:list:v2:p${page}:l${limit}:r${region || 'any'}:g${genre || 'any'}:o${ott || 'any'}`;
  
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

  const data = await getMoviesPage({ page, limit, region, genre, ott });
  
  await setCachedData(cacheKey, data, CACHE_TTL);
  
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      'X-Cache': 'MISS'
    }
  });
};
