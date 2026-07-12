import type { APIRoute } from 'astro';
import { getMovieById, getRecommendations } from '../../services/movieService';
import { getCachedData, setCachedData } from '../../services/cache';

const CACHE_TTL = 86400; // 24 hours
const MAX_LIMIT = 12;

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const movieId = url.searchParams.get('movieId')?.trim();
    const limitParam = Number(url.searchParams.get('limit') || '6');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), MAX_LIMIT) : 6;

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
  } catch (error) {
    console.error('[/api/recommendations] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
