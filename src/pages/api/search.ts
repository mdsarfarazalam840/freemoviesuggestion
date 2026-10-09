import type { APIRoute } from 'astro';
import { searchMovies } from '../../services/movieService';

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

    // Search-as-you-type from the navbar. Each debounced keystroke is its own query,
    // so the key space is unbounded and every typo would otherwise be persisted.
    const isSuggest = url.searchParams.get('suggest') === '1';

    if (q.length < 2) {
      return new Response(JSON.stringify({ movies: [], count: 0 }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300, s-maxage=1800',
        }
      });
    }

    // This route used to keep a second cache layer of its own on top of the one inside
    // searchMovies, doubling the command cost of every request. searchMovies owns
    // caching now; the middleware edge cache handles the response itself.
    const data = await searchMovies(q, { page, limit, skipRemote: isSuggest });

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': isSuggest
          ? 'public, max-age=300, s-maxage=1800'
          : 'public, max-age=300, s-maxage=43200',
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
