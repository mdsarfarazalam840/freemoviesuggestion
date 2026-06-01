import { supabase } from '../lib/supabase';
import { getCachedData, setCachedData } from './cache';
import { OTT_PLATFORMS } from '../data/movies';
import type { Movie, OTTPlatform } from '../data/movies';

type MovieRow = Partial<Movie> & {
  tmdb_id?: number;
  poster_path?: string;
  release_year?: number;
  release_date?: string;
  vote_average?: number;
  is_top_10?: boolean;
  ott_platforms?: unknown;
  genres?: unknown;
  overview?: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeGenres(value: unknown): string[] {
  const parsed = parseMaybeJson(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map((genre) => {
        if (typeof genre === 'string') return genre;
        if (genre && typeof genre === 'object' && 'name' in genre) {
          return String((genre as { name: unknown }).name);
        }
        return '';
      })
      .map((genre) => genre.trim())
      .filter(Boolean);
  }

  if (typeof parsed === 'string') {
    return parsed
      .split(',')
      .map((genre) => genre.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeOttPlatforms(value: unknown): OTTPlatform[] {
  const parsed = parseMaybeJson(value);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((platform) => {
      if (typeof platform === 'string') {
        const knownPlatform = OTT_PLATFORMS.find((item) => item.name.toLowerCase() === platform.toLowerCase());
        return knownPlatform || { name: platform, logo: '', url: '#' };
      }

      if (platform && typeof platform === 'object' && 'name' in platform) {
        const name = String((platform as { name: unknown }).name);
        const platformData = platform as Partial<OTTPlatform>;
        const knownPlatform = OTT_PLATFORMS.find((item) => item.name.toLowerCase() === name.toLowerCase());
        return {
          name,
          logo: platformData.logo || knownPlatform?.logo || '',
          url: platformData.url || knownPlatform?.url || '#',
        };
      }

      return null;
    })
    .filter((platform): platform is OTTPlatform => Boolean(platform?.name));
}

function normalizeMovie(row: MovieRow): Movie {
  const title = row.title || 'Untitled';
  const releaseYear =
    row.releaseYear ||
    row.release_year ||
    (row.release_date ? new Date(row.release_date).getFullYear() : 0);

  return {
    id: String(row.id || row.tmdb_id || row.slug || title),
    title,
    slug: row.slug || slugify(title),
    thumbnail: row.thumbnail || (row.poster_path ? `https://image.tmdb.org/t/p/w500${row.poster_path}` : ''),
    rating: row.rating ?? row.vote_average ?? 0,
    description: row.description || row.overview || '',
    releaseYear: Number.isFinite(releaseYear) ? releaseYear : 0,
    region: row.region || 'Hollywood',
    genres: normalizeGenres(row.genres),
    ottPlatforms: normalizeOttPlatforms(row.ottPlatforms || row.ott_platforms),
    isTop10: row.isTop10 ?? row.is_top_10 ?? false,
    rank: row.rank,
  };
}

function normalizeMovies(rows: MovieRow[] | null | undefined): Movie[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeMovie);
}

export async function getTrendingMovies(): Promise<Movie[]> {
  const cacheKey = 'remote_movies:v2:trending';
  
  // 1. Check Redis
  const cachedData = await getCachedData<MovieRow[]>(cacheKey);
  if (Array.isArray(cachedData)) {
    console.log('Returning cached trending data');
    return normalizeMovies(cachedData);
  }

  // 2. Fallback to Supabase
  console.log('Fetching trending from Supabase');
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .order('rank', { ascending: true, nullsFirst: false })
    .order('release_date', { ascending: false, nullsFirst: false });
  
  if (error) {
    console.warn('Supabase trending fetch failed:', error);
    return [];
  }

  const result = normalizeMovies(data);

  // 3. Update Redis
  await setCachedData(cacheKey, result);
  
  return result;
}

export async function getAllMovies(): Promise<Movie[]> {
  const cacheKey = 'remote_movies:v3:all';
  
  // 1. Check Redis
  const cachedData = await getCachedData<MovieRow[]>(cacheKey);
  if (Array.isArray(cachedData)) {
    console.log('Returning cached all movies data');
    return normalizeMovies(cachedData);
  }

  // 2. Fallback to Supabase
  console.log('Fetching all movies from Supabase');
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .order('release_date', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false });
  
  if (error) {
    console.warn('Supabase all movies fetch failed:', error);
    return [];
  }

  const result = normalizeMovies(data);

  // 3. Update Redis
  await setCachedData(cacheKey, result);
  
  return result;
}

export async function getBollywoodMovies(): Promise<Movie[]> {
  const movies = await getAllMovies();
  return movies.filter((movie) => movie.region.toLowerCase() === 'bollywood');
}

export async function getTollywoodMovies(): Promise<Movie[]> {
  const movies = await getAllMovies();
  return movies.filter((movie) => movie.region.toLowerCase() === 'tollywood');
}
