import { getTmdbAccessToken } from '../lib/env';

const TMDB_API_KEY = getTmdbAccessToken();
const BASE_URL = 'https://api.themoviedb.org/3';

export async function fetchTrendingMovies() {
  const response = await fetch(`${BASE_URL}/trending/movie/day`, {
    headers: {
      Authorization: `Bearer ${TMDB_API_KEY}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error('Failed to fetch trending movies from TMDB');
  return response.json();
}

export async function fetchMoviesByLanguage(languageCode: string) {
  const response = await fetch(`${BASE_URL}/discover/movie?with_original_language=${languageCode}&sort_by=popularity.desc`, {
    headers: {
      Authorization: `Bearer ${TMDB_API_KEY}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch movies for language ${languageCode} from TMDB`);
  return response.json();
}

export async function discoverMovies(page = 1, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({
    page: page.toString(),
    sort_by: 'popularity.desc',
    'vote_count.gte': '20', // Filter useful movies as per PLAN.md
    ...filters
  });
  
  const response = await fetch(`${BASE_URL}/discover/movie?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${TMDB_API_KEY}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Failed to discover movies from TMDB (page ${page})`);
  return response.json();
}

export async function fetchMovieFullDetails(tmdbId: number) {
  const response = await fetch(`${BASE_URL}/movie/${tmdbId}?append_to_response=credits`, {
    headers: {
      Authorization: `Bearer ${TMDB_API_KEY}`,
      accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch details for movie ${tmdbId} from TMDB`);
  return response.json();
}
