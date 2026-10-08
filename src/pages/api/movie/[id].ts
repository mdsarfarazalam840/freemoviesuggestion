import type { APIRoute } from 'astro';
import { getMovieById, getMovieBySlug } from '../../../services/movieService';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  try {
    const id = params.id?.trim();
    if (!id) return new Response('Missing id', { status: 400 });

    // The duplicate cache layer that used to sit here doubled the command cost of
    // every request; getMovieBySlug/getMovieById already cache, and the middleware
    // edge cache handles the response itself.
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

    return new Response(JSON.stringify(movie), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
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
