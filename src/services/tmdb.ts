const TMDB_API_KEY = process.env.TMDB_API_KEY;
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
