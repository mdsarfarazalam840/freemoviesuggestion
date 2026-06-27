import { supabase } from '../lib/supabase';
import { fetchMoviesByLanguage, fetchTrendingMovies, discoverMovies, fetchMovieFullDetails } from './tmdb';
import { redis } from '../lib/redis';
import { OTT_PLATFORMS, type MovieRegion } from '../data/movies';

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

const SYNC_SCHEMA_VERSION = 4;
const TODAY = new Date().toISOString().slice(0, 10);
const SYNC_FULL_DETAILS = () => {
  try { return process.env.SYNC_FULL_DETAILS === 'true'; } catch { return false; }
};

type SyncProgress = {
  version: number;
  sourceIndex: number;
  sourcePage: number;
  totalSynced: number;
};

type SyncSource = {
  name: string;
  region?: MovieRegion;
  filters: Record<string, string>;
  maxPages: number;
};

const LANGUAGE_REGION_MAP: Record<string, MovieRegion> = {
  en: 'Hollywood',
  hi: 'Bollywood',
  te: 'Tollywood',
  ta: 'Kollywood',
  ml: 'Mollywood',
  kn: 'Sandalwood',
  bn: 'Bengali',
  mr: 'Marathi',
  pa: 'Punjabi',
  gu: 'Gujarati',
};

const PRIMARY_REGION_LANGUAGES = ['hi', 'te', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'en'];
const LATEST_REGION_LANGUAGES = ['hi', 'te', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu', 'en'];
const GENRE_LANGUAGES = ['hi', 'te', 'ta', 'ml', 'kn', 'bn', 'mr', 'pa', 'gu'];
const GLOBAL_GENRE_LANGUAGES = ['en'];

const SYNC_PROGRESS_KEY = 'sync_progress';

async function getProgress(): Promise<SyncProgress> {
  try {
    const progress: SyncProgress | null = await redis.get(SYNC_PROGRESS_KEY);
    if (progress && progress.version === SYNC_SCHEMA_VERSION) return progress;
  } catch (e) {
    console.error('Failed to get progress from Redis:', e);
  }
  return { version: SYNC_SCHEMA_VERSION, sourceIndex: 0, sourcePage: 1, totalSynced: 0 };
}

async function saveProgress(sourceIndex: number, sourcePage: number, totalSynced: number) {
  try {
    await redis.set(SYNC_PROGRESS_KEY, {
      version: SYNC_SCHEMA_VERSION,
      sourceIndex,
      sourcePage,
      totalSynced,
    });
  } catch (e) {
    console.error('Failed to save progress to Redis:', e);
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getRegionForLanguage(language?: string): MovieRegion {
  return LANGUAGE_REGION_MAP[language || ''] || 'Hollywood';
}

function mapTmdbMovie(movie: any, region: MovieRegion, index: number, isTop10 = false) {
  const title = movie.title || movie.name || `Movie ${movie.id}`;
  const releaseDate = movie.release_date || null;
  const movieSlug = `${slugify(title)}-${movie.id}`;

  // Credits handling
  const director = movie.credits?.crew?.find((c: any) => c.job === 'Directing' || c.job === 'Director')?.name || '';
  const topCast = movie.credits?.cast?.slice(0, 5).map((c: any) => ({
    name: c.name,
    character: c.character,
    profile_path: c.profile_path
  })) || [];

  return {
    tmdb_id: movie.id,
    title,
    slug: movieSlug,
    overview: movie.overview || '',
    description: movie.overview || '',
    thumbnail: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '',
    poster_path: movie.poster_path || '',
    backdrop_path: movie.backdrop_path || '',
    release_date: releaseDate,
    release_year: releaseDate ? new Date(releaseDate).getFullYear() : null,
    runtime: movie.runtime || 0,
    vote_average: movie.vote_average || 0,
    vote_count: movie.vote_count || 0,
    popularity: movie.popularity || 0,
    original_language: movie.original_language || 'en',
    genres: Array.isArray(movie.genres) 
      ? movie.genres.map((g: any) => g.name)
      : (Array.isArray(movie.genre_ids) ? movie.genre_ids.map((id: number) => TMDB_GENRES.get(id)).filter(Boolean) : []),
    director,
    top_cast: topCast,
    ott_platforms: [OTT_PLATFORMS[Math.floor(Math.random() * OTT_PLATFORMS.length)]],
    region,
    rating: movie.vote_average || 0,
    is_top_10: isTop10,
    rank: isTop10 ? index + 1 : null,
    tmdb_updated_at: new Date().toISOString()
  };
}

function buildSyncSources(): SyncSource[] {
  const sources: SyncSource[] = [];

  for (const language of PRIMARY_REGION_LANGUAGES) {
    sources.push({
      name: `${language}-popular`,
      region: getRegionForLanguage(language),
      filters: {
        with_original_language: language,
        sort_by: 'popularity.desc',
        include_adult: 'false',
        'primary_release_date.lte': TODAY,
        'vote_count.gte': '1',
      },
      maxPages: language === 'hi' ? 40 : 20,
    });
  }

  for (const language of LATEST_REGION_LANGUAGES) {
    sources.push({
      name: `${language}-latest`,
      region: getRegionForLanguage(language),
      filters: {
        with_original_language: language,
        sort_by: 'primary_release_date.desc',
        include_adult: 'false',
        'primary_release_date.lte': TODAY,
        'vote_count.gte': '1',
      },
      maxPages: language === 'hi' ? 35 : 15,
    });
  }

  for (const [genreId, genreName] of TMDB_GENRES.entries()) {
    const genreSlug = slugify(genreName);
    for (const language of GENRE_LANGUAGES) {
      sources.push({
        name: `${language}-${genreSlug}-latest`,
        region: getRegionForLanguage(language),
        filters: {
          with_original_language: language,
          with_genres: String(genreId),
          sort_by: 'primary_release_date.desc',
          include_adult: 'false',
          'primary_release_date.lte': TODAY,
          'vote_count.gte': '1',
        },
        maxPages: language === 'hi' ? 3 : 2,
      });
    }

    for (const language of GLOBAL_GENRE_LANGUAGES) {
      sources.push({
        name: `${language}-${genreSlug}-latest`,
        region: getRegionForLanguage(language),
        filters: {
          with_original_language: language,
          with_genres: String(genreId),
          sort_by: 'primary_release_date.desc',
          include_adult: 'false',
          'primary_release_date.lte': TODAY,
          'vote_count.gte': '5',
        },
        maxPages: 2,
      });
    }
  }

  sources.push(
    {
      name: 'global-popular',
      filters: {
        sort_by: 'popularity.desc',
        include_adult: 'false',
        'primary_release_date.lte': TODAY,
      },
      maxPages: 25,
    },
    {
      name: 'global-latest',
      filters: {
        sort_by: 'primary_release_date.desc',
        include_adult: 'false',
        'primary_release_date.lte': TODAY,
        'vote_count.gte': '1',
      },
      maxPages: 20,
    },
  );

  return sources;
}

export async function syncMovies(targetCount = 1000) {
  const progress = await getProgress();
  const sources = buildSyncSources();
  let sourceIndex = progress.sourceIndex;
  let sourcePage = progress.sourcePage;
  let totalSynced = progress.totalSynced;
  
  const stats = {
    fetched: 0,
    upserted: 0,
    skipped: 0,
    failed: 0
  };

  const MAX_PAGES_PER_RUN = (() => {
    try {
      if (process.env.DISABLE_PAGE_LIMIT === 'true') return Infinity;
    } catch {}
    return 17;
  })();
  let pagesProcessed = 0;

  console.log(`Starting/Resuming sync from source ${sourceIndex + 1}/${sources.length}, page ${sourcePage}, target: ${targetCount} movies.`);

  while (totalSynced < targetCount && sourceIndex < sources.length && pagesProcessed < MAX_PAGES_PER_RUN) {
    const source = sources[sourceIndex];

    if (sourcePage > source.maxPages) {
      sourceIndex++;
      sourcePage = 1;
      continue;
    }

    console.log(`Fetching TMDB source "${source.name}" page ${sourcePage}/${source.maxPages}...`);
    const data = await discoverMovies(sourcePage, source.filters);
    if (!data.results || data.results.length === 0) {
      console.log(`No more movies found for source "${source.name}".`);
      sourceIndex++;
      sourcePage = 1;
      continue;
    }

    const movieBatch = [];
    for (const basicMovie of data.results) {
      if (totalSynced + movieBatch.length >= targetCount) break;

      if (basicMovie.adult || !basicMovie.poster_path || !basicMovie.release_date) {
        stats.skipped++;
        continue;
      }

      try {
        stats.fetched++;
        const movie = SYNC_FULL_DETAILS() ? await fetchMovieFullDetails(basicMovie.id) : basicMovie;
        const region = source.region || getRegionForLanguage(movie.original_language);

        const mapped = mapTmdbMovie(movie, region, totalSynced + movieBatch.length);
        movieBatch.push(mapped);
        
        if (SYNC_FULL_DETAILS()) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`Failed to fetch details for movie ${basicMovie.id}:`, err);
        stats.failed++;
      }
    }

    if (movieBatch.length > 0) {
      const { error } = await supabase.from('movies').upsert(movieBatch, { onConflict: 'tmdb_id' });
      if (error) {
        console.error('Supabase upsert error:', error);
        stats.failed += movieBatch.length;
      } else {
        stats.upserted += movieBatch.length; 
        totalSynced += movieBatch.length;
      }
    }

    sourcePage++;
    pagesProcessed++;
    
    console.log(`Status: ${totalSynced}/${targetCount} movies processed (page ${pagesProcessed}/${MAX_PAGES_PER_RUN}). Stats:`, stats);
  }

  await saveProgress(sourceIndex, sourcePage, totalSynced);
  await clearRedisCache();

  if (totalSynced >= targetCount) {
    console.log(`Sync target of ${targetCount} movies reached.`);
  } else if (pagesProcessed >= MAX_PAGES_PER_RUN) {
    console.log(`Paused after ${pagesProcessed} pages (subrequest budget). Resuming next cron.`);
  }
  console.log('Final Stats:', stats);
  return stats;
}

async function clearRedisCache() {
  try {
    const knownKeys = ['sync_progress', 'trending_movies', 'all_movies', 'bollywood_movies', 'tollywood_movies'];
    const matched = await redis.keys('remote_movies:*');
    await redis.del(...knownKeys, ...matched);
  } catch (err) {
    console.warn('Failed to clear some Redis caches:', err);
  }
}

export async function syncTrendingMovies() {
  const [trendingData, bollywoodData, tollywoodData, kollywoodData, mollywoodData, sandalwoodData] = await Promise.all([
    fetchTrendingMovies(),
    fetchMoviesByLanguage('hi'),
    fetchMoviesByLanguage('te'),
    fetchMoviesByLanguage('ta'),
    fetchMoviesByLanguage('ml'),
    fetchMoviesByLanguage('kn'),
  ]);

  const movieBatch = [];
  
  // Simple map without full details for the quick trending sync
  // but we should ideally use the same mapper if we want consistency
  // For now, let's just use the existing logic for the quick sync but updated with more fields
  
  const processResults = (results: any[], region: any, limit = 20) => {
    return results.slice(0, limit).map((m, i) => {
      const releaseDate = m.release_date || null;
      return {
        tmdb_id: m.id,
        title: m.title || m.name,
        slug: `${slugify(m.title || m.name)}-${m.id}`,
        overview: m.overview || '',
        description: m.overview || '',
        thumbnail: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '',
        poster_path: m.poster_path || '',
        backdrop_path: m.backdrop_path || '',
        release_date: releaseDate,
        release_year: releaseDate ? new Date(releaseDate).getFullYear() : null,
        vote_average: m.vote_average || 0,
        vote_count: m.vote_count || 0,
        popularity: m.popularity || 0,
        original_language: m.original_language || 'en',
        genres: m.genre_ids?.map((id: number) => TMDB_GENRES.get(id)).filter(Boolean) || [],
        region,
        rating: m.vote_average || 0,
        ott_platforms: [OTT_PLATFORMS[0]],
        tmdb_updated_at: new Date().toISOString()
      };
    });
  };

  movieBatch.push(...processResults(trendingData.results, 'Hollywood'));
  movieBatch.push(...processResults(bollywoodData.results, 'Bollywood'));
  movieBatch.push(...processResults(tollywoodData.results, 'Tollywood'));
  movieBatch.push(...processResults(kollywoodData.results, 'Kollywood'));
  movieBatch.push(...processResults(mollywoodData.results, 'Mollywood'));
  movieBatch.push(...processResults(sandalwoodData.results, 'Sandalwood'));

  const { error } = await supabase.from('movies').upsert(movieBatch, { onConflict: 'tmdb_id' });
  if (error) throw error;
  
  console.log(`Successfully synced ${movieBatch.length} trending movies.`);
}
