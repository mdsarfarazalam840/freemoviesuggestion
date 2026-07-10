import { supabase } from '../lib/supabase';
import { getCachedData, setCachedData } from './cache';
import { movies as localMovies, OTT_PLATFORMS } from '../data/movies';
import type { Movie, OTTPlatform } from '../data/movies';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 30;

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

export type MovieQueryOptions = {
  page?: number;
  limit?: number;
  genre?: string | null;
  ott?: string | null;
  region?: string | null;
  topOnly?: boolean;
};

export type MoviePage = {
  movies: Movie[];
  count: number;
  page: number;
  limit: number;
  totalPages: number;
};

type FetchMoviePageResult = MoviePage & {
  isFallback?: boolean;
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
  
  const tmdbId = row.tmdb_id;
  let slug = row.slug || slugify(title);
  
  // Ensure slug has the TMDB ID suffix for consistency if it's from the database
  if (tmdbId && !slug.endsWith(`-${tmdbId}`)) {
    slug = `${slugify(title)}-${tmdbId}`;
  }

  return {
    id: String(row.id || tmdbId || slug || title),
    title,
    slug,
    thumbnail: (row.thumbnail && row.thumbnail.trim()) ||
      (row.poster_path && row.poster_path.trim()
        ? `https://image.tmdb.org/t/p/w500${row.poster_path.trim()}`
        : ''),
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

function normalizePage(value: unknown): number {
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : DEFAULT_PAGE;
}

function normalizeLimit(value: unknown): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function normalizeFilter(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function jsonContainsArrayValue(column: string, value: string): string {
  return `${column}.cs.${JSON.stringify([value])}`;
}

function jsonContainsNamedObject(column: string, value: string): string {
  return `${column}.cs.${JSON.stringify([{ name: value }])}`;
}

function movieCacheKey(prefix: string, options: MovieQueryOptions = {}) {
  const page = normalizePage(options.page);
  const limit = normalizeLimit(options.limit);
  const parts = [
    prefix,
    `page:${page}`,
    `limit:${limit}`,
    options.region ? `region:${options.region.toLowerCase()}` : null,
    options.genre ? `genre:${options.genre.toLowerCase()}` : null,
    options.ott ? `ott:${options.ott.toLowerCase()}` : null,
    options.topOnly ? 'top:1' : null,
  ].filter(Boolean);

  return `remote_movies:v7:${parts.join(':')}`;
}

function matchesFilter(value: string | undefined, filter: string): boolean {
  return value?.toLowerCase() === filter.toLowerCase();
}

function movieHasGenre(movie: Movie, genre: string): boolean {
  const genreSearch = genre === 'Sci-Fi' ? ['Sci-Fi', 'Science Fiction'] : [genre];
  return movie.genres.some((movieGenre) => genreSearch.some((item) => matchesFilter(movieGenre, item)));
}

function movieHasOttPlatform(movie: Movie, ott: string): boolean {
  return movie.ottPlatforms.some((platform) => matchesFilter(platform.name, ott));
}

function sortMoviesForCatalog(a: Movie, b: Movie): number {
  const aRank = a.rank ?? Number.POSITIVE_INFINITY;
  const bRank = b.rank ?? Number.POSITIVE_INFINITY;

  if (aRank !== bRank) return aRank - bRank;
  return b.releaseYear - a.releaseYear;
}

function getLocalMoviePage(options: MovieQueryOptions = {}): FetchMoviePageResult {
  const page = normalizePage(options.page);
  const limit = normalizeLimit(options.limit);
  const region = normalizeFilter(options.region);
  const genre = normalizeFilter(options.genre);
  const ott = normalizeFilter(options.ott);

  const filteredMovies = localMovies
    .filter((movie) => !region || matchesFilter(movie.region, region))
    .filter((movie) => !genre || movieHasGenre(movie, genre))
    .filter((movie) => !ott || movieHasOttPlatform(movie, ott))
    .filter((movie) => !options.topOnly || movie.isTop10)
    .sort(sortMoviesForCatalog);

  const from = (page - 1) * limit;
  const count = filteredMovies.length;

  return {
    movies: filteredMovies.slice(from, from + limit),
    count,
    page,
    limit,
    totalPages: Math.ceil(count / limit),
    isFallback: true,
  };
}

function applyMovieFilters(query: any, options: MovieQueryOptions = {}) {
  const region = normalizeFilter(options.region);
  const genre = normalizeFilter(options.genre);
  const ott = normalizeFilter(options.ott);

  if (region) query = query.ilike('region', region);
  if (genre) {
    const genreSearch = genre === 'Sci-Fi' ? ['Sci-Fi', 'Science Fiction'] : [genre];
    query = query.or(
      genreSearch
        .map((g) => [jsonContainsArrayValue('genres', g), jsonContainsNamedObject('genres', g)].join(','))
        .join(',')
    );
  }
  if (ott) query = query.filter('ott_platforms', 'cs', JSON.stringify([{ name: ott }]));
  if (options.topOnly) query = query.eq('is_top_10', true);

  return query;
}

async function fetchMoviePage(options: MovieQueryOptions = {}): Promise<FetchMoviePageResult> {
  const page = normalizePage(options.page);
  const limit = normalizeLimit(options.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const pageQuery = applyMovieFilters(supabase.from('movies').select('*'), options);
  const { data, error } = await pageQuery
    .order('rank', { ascending: true, nullsFirst: false })
    .order('release_date', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    console.warn('Supabase movie page fetch failed:', error.message, error.code, error.details);
    return getLocalMoviePage(options);
  }

  const countQuery = applyMovieFilters(
    supabase.from('movies').select('id', { count: 'exact', head: true }),
    options
  );
  const { count, error: countError } = await countQuery;

  if (countError) {
    console.warn('Supabase movie count failed:', countError.message, countError.code);
  }

  const safeCount = count ?? data?.length ?? 0;

  // If we got fewer rows than requested and we're past page 1,
  // we've hit the actual end — clamp count so totalPages won't inflate
  const adjustedCount =
    data && data.length < limit && page > 1
      ? Math.min(safeCount, from + data.length)
      : safeCount;

  return {
    movies: normalizeMovies(data),
    count: adjustedCount,
    page,
    limit,
    totalPages: Math.ceil(adjustedCount / limit),
  };
}

export async function getMoviesPage(options: MovieQueryOptions = {}): Promise<MoviePage> {
  const cacheKey = movieCacheKey('page', options);
  const cachedData = await getCachedData<MoviePage>(cacheKey);

  if (cachedData && Array.isArray(cachedData.movies) && cachedData.movies.length > 0) {
    console.log(`[movies] ✓ Cache HIT for page (${cachedData.movies.length} movies from Upstash)`);
    const limit = normalizeLimit(cachedData.limit);
    return {
      ...cachedData,
      movies: normalizeMovies(cachedData.movies),
      totalPages: Math.ceil((cachedData.count || 0) / limit),
      limit,
    };
  }

  console.log(`[movies] Cache MISS for page — querying Supabase...`);
  const result = await fetchMoviePage(options);
  const { isFallback, ...pageResult } = result;

  // Cache both Supabase and fallback results to avoid repeated queries.
  // Skip caching pages that contain empty thumbnails so bad data isn't served repeatedly
  // (mirrors the guard in searchMovies).
  const hasEmptyThumbnails = pageResult.movies.some((m) => !m.thumbnail);
  if (pageResult.movies.length > 0 && hasEmptyThumbnails) {
    console.warn(`[movies] ${pageResult.movies.filter((m) => !m.thumbnail).length}/${pageResult.movies.length} movies have empty thumbnails — skipping cache`);
  } else if (pageResult.movies.length > 0) {
    const ttl = isFallback ? 900 : 3600; // shorter TTL for fallback data
    await setCachedData(cacheKey, pageResult, ttl);
    console.log(`[movies] Cached ${pageResult.movies.length} movies in Upstash (fallback=${!!isFallback})`);
  }

  return pageResult;
}

export async function getMovieBySlug(slug: string): Promise<Movie | null> {
  const cacheKey = `remote_movies:v4:slug:${slug}`;
  const cachedData = await getCachedData<MovieRow>(cacheKey);

  if (cachedData) return normalizeMovie(cachedData);

  // 1. Try exact match
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.warn(`Supabase movie fetch failed for slug ${slug}:`, error);
    const local = localMovies.find((m) => m.slug === slug);
    return local || null;
  }

  if (data) {
    const movie = normalizeMovie(data);
    await setCachedData(cacheKey, movie, 86400);
    return movie;
  }

  // 2. If no exact match, try to find by slug as a prefix (handles missing TMDB ID in URL)
  // But only if the slug doesn't already look like it has an ID suffix
  if (!slug.match(/-\d+$/)) {
    const { data: prefixData, error: prefixError } = await supabase
      .from('movies')
      .select('*')
      .ilike('slug', `${slug}-%`)
      .order('popularity', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!prefixError && prefixData) {
      const movie = normalizeMovie(prefixData);
      await setCachedData(cacheKey, movie, 86400);
      return movie;
    }
  } else {
    // 3. If slug has ID suffix, try finding by tmdb_id
    const tmdbIdMatch = slug.match(/-(\d+)$/);
    if (tmdbIdMatch) {
      const tmdbId = tmdbIdMatch[1];
      const movie = await getMovieById(tmdbId);
      if (movie) return movie;
    }
  }

  return null;
}

export async function getMovieById(id: number | string): Promise<Movie | null> {
  const idNum = Number(id);
  const cacheKey = `remote_movies:v4:id:${id}`;
  const cachedData = await getCachedData<MovieRow>(cacheKey);

  if (cachedData) return normalizeMovie(cachedData);

  const query = supabase.from('movies').select('*');
  
  if (!isNaN(idNum)) {
    query.or(`id.eq.${idNum},tmdb_id.eq.${idNum}`);
  } else {
    query.eq('id', id);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    console.warn(`Supabase movie fetch failed for id ${id}:`, error);
    const local = localMovies.find((m) => m.id === String(id));
    return local || null;
  }

  if (!data) return null;

  const movie = normalizeMovie(data);
  await setCachedData(cacheKey, movie, 86400);

  return movie;
}

export async function searchMovies(searchTerm: string, options: MovieQueryOptions = {}): Promise<MoviePage> {
  const page = normalizePage(options.page);
  const limit = normalizeLimit(options.limit);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const cacheKey = movieCacheKey(`search:${searchTerm}`, options);
  const cachedData = await getCachedData<MoviePage>(cacheKey);

  if (cachedData && Array.isArray(cachedData.movies)) {
    console.log(`[search] ✓ Cache HIT for "${searchTerm}" (${cachedData.movies.length} results from Upstash)`);
    return {
      ...cachedData,
      movies: normalizeMovies(cachedData.movies),
    };
  }

  console.log(`[search] Cache MISS for "${searchTerm}" — querying Supabase...`);

  let { data, error, count } = await supabase
    .from('movies')
    .select('*', { count: 'exact' })
    .textSearch('fts', searchTerm, { type: 'websearch', config: 'english' })
    .order('popularity', { ascending: false })
    .range(from, to);

  if (error) {
    console.warn(`[search] textSearch failed for "${searchTerm}":`, error.message, error.code);
  }

  if (error || !data || data.length === 0) {
    const ilikePattern = `%${searchTerm}%`;
    const fallback = await supabase
      .from('movies')
      .select('*', { count: 'exact' })
      .or(`title.ilike.${ilikePattern},overview.ilike.${ilikePattern}`)
      .order('popularity', { ascending: false })
      .range(from, to);

    if (!fallback.error && fallback.data && fallback.data.length > 0) {
      data = fallback.data;
      count = fallback.count;
    } else if (error) {
      console.warn(`[search] ilike fallback also failed for "${searchTerm}":`, fallback.error?.message);
    }
  }

  if (!data || data.length === 0) {
    console.log(`[search] No Supabase results for "${searchTerm}", using local fallback`);
    const localResults = localMovies.filter(
      (m) =>
        m.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const safeCount = localResults.length;
    const fallbackResult: MoviePage = {
      movies: localResults.slice(from, from + limit),
      count: safeCount,
      page,
      limit,
      totalPages: Math.ceil(safeCount / limit),
    };

    // Cache even empty/local results so we don't hit Supabase again for the same query
    await setCachedData(cacheKey, fallbackResult, 900); // 15 min TTL for fallback
    console.log(`[search] Cached ${safeCount} local results for "${searchTerm}" in Upstash`);
    return fallbackResult;
  }

  const safeCount = count || 0;
  const result: MoviePage = {
    movies: normalizeMovies(data),
    count: safeCount,
    page,
    limit,
    totalPages: Math.ceil(safeCount / limit),
  };

  const hasEmptyThumbnails = result.movies.some((m) => !m.thumbnail);
  if (hasEmptyThumbnails) {
    console.warn(`[search] ${result.movies.filter((m) => !m.thumbnail).length}/${result.movies.length} movies have empty thumbnails for "${searchTerm}" — skipping cache`);
  } else {
    await setCachedData(cacheKey, result, 3600);
    console.log(`[search] Cached ${result.movies.length} Supabase results for "${searchTerm}" in Upstash`);
  }

  return result;
}

export async function getRecommendations(movie: Movie, limit = 6): Promise<Movie[]> {
  const cacheKey = `remote_movies:v4:recommendations:${movie.id}`;
  const cachedData = await getCachedData<MovieRow[]>(cacheKey);

  if (Array.isArray(cachedData)) return normalizeMovies(cachedData);

  // Simple recommendation: same genres, different movie, ordered by popularity
  const genre = movie.genres[0];
  if (!genre) return [];

  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .or([jsonContainsArrayValue('genres', genre), jsonContainsNamedObject('genres', genre)].join(','))
    .neq('tmdb_id', movie.id)
    .order('popularity', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn(`Supabase recommendations failed for ${movie.id}:`, error);
    const localRecs = localMovies
      .filter((m) => m.id !== movie.id && m.genres.some((g) => movie.genres.includes(g)))
      .slice(0, limit);
    return localRecs;
  }

  const result = normalizeMovies(data);
  await setCachedData(cacheKey, result, 86400);

  return result;
}

export async function getTrendingMovies(limit = DEFAULT_LIMIT): Promise<Movie[]> {
  const cacheKey = movieCacheKey('trending', { limit, topOnly: true });
  
  const cachedData = await getCachedData<MovieRow[]>(cacheKey);
  if (Array.isArray(cachedData)) {
    return normalizeMovies(cachedData);
  }

  const page = await fetchMoviePage({ limit, topOnly: true });
  const result = page.movies;

  if (!page.isFallback) {
    await setCachedData(cacheKey, result);
  }
  
  return result;
}
export async function getPopularMovies(limit = 10): Promise<Movie[]> {
  const cacheKey = movieCacheKey('popular', { limit });
  
  const cachedData = await getCachedData<MovieRow[]>(cacheKey);
  if (Array.isArray(cachedData)) {
    return normalizeMovies(cachedData);
  }

  // Fetch movies ordered by popularity
  const { data, error } = await supabase
    .from('movies')
    .select('*')
    .order('popularity', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('Supabase popular movie fetch failed:', error);
    const fallbackMovies = localMovies
      .filter((m) => m.isTop10)
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .slice(0, limit);
    return fallbackMovies;
  }

  const result = normalizeMovies(data);
  await setCachedData(cacheKey, result);
  
  return result;
}

export async function getAllMovieSlugs(): Promise<string[]> {
  const cacheKey = 'remote_movies:v1:all_slugs';
  const cachedData = await getCachedData<string[]>(cacheKey);

  if (cachedData) return cachedData;

  const { data, error } = await supabase
    .from('movies')
    .select('slug')
    .order('popularity', { ascending: false });

  if (error) {
    console.warn('Supabase fetch all slugs failed:', error);
    return localMovies.map((row) => row.slug);
  }

  const slugs = data.map(row => row.slug);
  await setCachedData(cacheKey, slugs, 3600); // 1 hour cache

  return slugs;
}

export async function getAllMovies(options: MovieQueryOptions = {}): Promise<Movie[]> {
  const { movies } = await getMoviesPage(options);
  return movies;
}

export async function getBollywoodMovies(limit = 4): Promise<Movie[]> {
  return getAllMovies({ region: 'Bollywood', limit });
}

export async function getHollywoodMovies(limit = 4): Promise<Movie[]> {
  return getAllMovies({ region: 'Hollywood', limit });
}

export async function getTollywoodMovies(limit = 4): Promise<Movie[]> {
  return getAllMovies({ region: 'Tollywood', limit });
}
