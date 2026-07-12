import type { APIRoute } from 'astro';
import { getMovieById, getMovieBySlug } from '../../../services/movieService';
import { getCachedData, setCachedData } from '../../../services/cache';

const CACHE_TTL = 86400; // 24 hours

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id?.trim();
    if (!id) return new Response('Missing id', { status: 400 });

    const cacheKey = `movie:detail:v2:${id.toLowerCase()}`;
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

    let movie = await getMovieBySlug(id);
    if (!movie) {
      movie = await getMovieById(id);
    }

    if (!movie) {
      return new Response(JSON.stringify({ error: 'Movie not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await setCachedData(cacheKey, movie, CACHE_TTL);

    return new Response(JSON.stringify(movie), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
        'X-Cache': 'MISS'
      }
    });
  } catch (error) {
    console.error('[/api/movie/:id] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
