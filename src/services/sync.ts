import { supabase } from '../lib/supabase';
import { fetchMoviesByLanguage, fetchTrendingMovies } from './tmdb';
import { redis } from '../lib/redis';
import { OTT_PLATFORMS } from '../data/movies';

const TMDB_GENRES = new Map<number, string>([
  [28, 'Action'],
  [12, 'Adventure'],
  [16, 'Animation'],
  [35, 'Comedy'],
  [80, 'Crime'],
  [99, 'Documentary'],
  [18, 'Drama'],
  [10751, 'Family'],
  [14, 'Fantasy'],
  [36, 'History'],
  [27, 'Horror'],
  [10402, 'Music'],
  [9648, 'Mystery'],
  [10749, 'Romance'],
  [878, 'Sci-Fi'],
  [10770, 'TV Movie'],
  [53, 'Thriller'],
  [10752, 'War'],
  [37, 'Western'],
]);

type TmdbMovie = {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  release_date?: string;
  vote_average?: number;
  genre_ids?: number[];
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapTmdbMovie(movie: TmdbMovie, region: 'Bollywood' | 'Hollywood' | 'Tollywood', index: number, isTop10 = false) {
  const title = movie.title || movie.name || `Movie ${movie.id}`;
  const releaseDate = movie.release_date || null;

  return {
    tmdb_id: movie.id,
    title,
    slug: slugify(title),
    overview: movie.overview || '',
    description: movie.overview || '',
    thumbnail: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '',
    poster_path: movie.poster_path || '',
    release_date: releaseDate,
    release_year: releaseDate ? new Date(releaseDate).getFullYear() : null,
    vote_average: movie.vote_average || 0,
    rating: movie.vote_average || 0,
    region,
    genres: Array.isArray(movie.genre_ids)
      ? movie.genre_ids.map((genreId) => TMDB_GENRES.get(genreId)).filter(Boolean)
      : [],
    ott_platforms: [OTT_PLATFORMS[0]],
    is_top_10: isTop10,
    rank: isTop10 ? index + 1 : null,
  };
}

export async function syncTrendingMovies() {
  const [trendingData, bollywoodData, tollywoodData] = await Promise.all([
    fetchTrendingMovies(),
    fetchMoviesByLanguage('hi'),
    fetchMoviesByLanguage('te'),
  ]);

  const movies = [
    ...trendingData.results.map((movie: TmdbMovie, index: number) =>
      mapTmdbMovie(movie, 'Hollywood', index, index < 10)
    ),
    ...bollywoodData.results.map((movie: TmdbMovie, index: number) =>
      mapTmdbMovie(movie, 'Bollywood', index)
    ),
    ...tollywoodData.results.map((movie: TmdbMovie, index: number) =>
      mapTmdbMovie(movie, 'Tollywood', index)
    ),
  ];

  const { error } = await supabase.from('movies').upsert(movies, { onConflict: 'tmdb_id' });
  if (error) throw error;
  
  await Promise.all([
    redis.del('trending_movies'),
    redis.del('all_movies'),
    redis.del('remote_movies:v2:trending'),
    redis.del('remote_movies:v2:all'),
    redis.del('remote_movies:v3:all'),
    redis.del('bollywood_movies'),
    redis.del('tollywood_movies'),
  ]);
  
  console.log(`Successfully synced ${movies.length} movies and cleared cache.`);
}
