import type { APIRoute } from 'astro';
import { getMovieById, getRecommendations } from '../../services/movieService';

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

    // The duplicate cache layer that used to sit here doubled the command cost of
    // every request; getMovieById/getRecommendations already cache, and the
    // middleware edge cache handles the response itself.
    const movie = await getMovieById(movieId);
    if (!movie) {
      return new Response(JSON.stringify({ error: 'Movie not found' }), { status: 404 });
    }

    const recommendations = await getRecommendations(movie, limit);

    return new Response(JSON.stringify(recommendations), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
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
