import type { APIRoute } from 'astro';
import { getMoviesPage } from '../../services/movieService';

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

    // This route used to keep its own cache layer on top of the one inside
    // getMoviesPage, doubling the command cost of every request. getMoviesPage owns
    // caching now; the middleware edge cache handles the response itself.
    const data = await getMoviesPage({ page, limit, region, genre, ott, mood });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=43200, stale-while-revalidate=86400',
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
