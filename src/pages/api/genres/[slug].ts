import type { APIRoute } from 'astro';
import { getMoviesPage } from '../../../services/movieService';
import { getCachedData, setCachedData } from '../../../services/cache';

const CACHE_TTL = 3600; // 1 hour

export const GET: APIRoute = async ({ params, url }) => {
  const { slug } = params;
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '24', 10);

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
};
