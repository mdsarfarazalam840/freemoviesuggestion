import type { APIRoute } from 'astro';
import { getMovieById, getRecommendations } from '../../services/movieService';
import { getCachedData, setCachedData } from '../../services/cache';

const CACHE_TTL = 86400; // 24 hours

export const GET: APIRoute = async ({ url }) => {
  const movieId = url.searchParams.get('movieId');
  const limit = parseInt(url.searchParams.get('limit') || '6', 10);

  if (!movieId) {
    return new Response(JSON.stringify({ error: 'Missing movieId' }), { status: 400 });
  }

  const cacheKey = `recommendations:${movieId}:l${limit}`;
  const cached = await getCachedData<any>(cacheKey);

  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Cache': 'HIT'
      }
    });
  }

  const movie = await getMovieById(movieId);
  if (!movie) {
    return new Response(JSON.stringify({ error: 'Movie not found' }), { status: 404 });
  }

  const recommendations = await getRecommendations(movie, limit);

  await setCachedData(cacheKey, recommendations, CACHE_TTL);

  return new Response(JSON.stringify(recommendations), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      'X-Cache': 'MISS'
    }
  });
};
