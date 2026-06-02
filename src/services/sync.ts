import { supabase } from '../lib/supabase';
import { fetchMoviesByLanguage, fetchTrendingMovies, discoverMovies, fetchMovieFullDetails } from './tmdb';
import { redis } from '../lib/redis';
import { OTT_PLATFORMS } from '../data/movies';
import fs from 'fs';
import path from 'path';

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

const PROGRESS_FILE = path.join(process.cwd(), '.sync-progress.json');

function getProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    } catch (e) {
      return { lastPage: 0, totalSynced: 0 };
    }
  }
  return { lastPage: 0, totalSynced: 0 };
}

function saveProgress(page: number, totalSynced: number) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ lastPage: page, totalSynced }, null, 2));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapTmdbMovie(movie: any, region: 'Bollywood' | 'Hollywood' | 'Tollywood', index: number, isTop10 = false) {
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

export async function syncMovies(targetCount = 1000) {
  const progress = getProgress();
  let currentPage = progress.lastPage + 1;
  let totalSynced = progress.totalSynced;
  
  const stats = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0
  };

  console.log(`Starting/Resuming sync from page ${currentPage}, target: ${targetCount} movies.`);

  while (totalSynced < targetCount) {
    console.log(`Fetching TMDB page ${currentPage}...`);
    const data = await discoverMovies(currentPage);
    if (!data.results || data.results.length === 0) {
      console.log('No more movies found on TMDB.');
      break;
    }

    const movieBatch = [];
    for (const basicMovie of data.results) {
      if (totalSynced >= targetCount) break;

      try {
        stats.fetched++;
        // Fetch full details for each movie
        const fullMovie = await fetchMovieFullDetails(basicMovie.id);
        
        let region: 'Hollywood' | 'Bollywood' | 'Tollywood' = 'Hollywood';
        if (fullMovie.original_language === 'hi') region = 'Bollywood';
        if (['te', 'ta', 'kn', 'ml'].includes(fullMovie.original_language)) region = 'Tollywood';

        const mapped = mapTmdbMovie(fullMovie, region, totalSynced);
        movieBatch.push(mapped);
        
        // Brief delay between detail calls to avoid aggressive bursts
        await new Promise(resolve => setTimeout(resolve, 50));
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
        stats.inserted += movieBatch.length; 
        totalSynced += movieBatch.length;
      }
    }

    saveProgress(currentPage, totalSynced);
    currentPage++;
    
    console.log(`Status: ${totalSynced}/${targetCount} movies processed.`);
    
    // Clear caches after each batch to reflect new data
    await clearRedisCache();
  }

  console.log('Sync finished.');
  console.log('Stats:', stats);
  return stats;
}

async function clearRedisCache() {
  try {
    // Note: Update this list whenever cache versions (e.g., v5) or key structures in movieService.ts change.
    const keys = [
      'trending_movies',
      'all_movies',
      'bollywood_movies',
      'tollywood_movies',
      'remote_movies:v2:trending',
      'remote_movies:v2:all',
      'remote_movies:v3:all',
      'remote_movies:v5:trending:page:1:limit:24:top:1',
      'remote_movies:v5:page:page:1:limit:24:region:bollywood',
      'remote_movies:v5:page:page:1:limit:24:region:tollywood',
      'remote_movies:v5:page:page:1:limit:24'
    ];
    // Delete keys one by one as Redis.del might fail on non-existent keys depending on implementation
    for (const key of keys) {
      await redis.del(key).catch(() => {});
    }
  } catch (err) {
    console.warn('Failed to clear some Redis caches:', err);
  }
}

export async function syncTrendingMovies() {
  const [trendingData, bollywoodData, tollywoodData] = await Promise.all([
    fetchTrendingMovies(),
    fetchMoviesByLanguage('hi'),
    fetchMoviesByLanguage('te'),
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

  const { error } = await supabase.from('movies').upsert(movieBatch, { onConflict: 'tmdb_id' });
  if (error) throw error;
  
  await clearRedisCache();
  
  console.log(`Successfully synced ${movieBatch.length} trending movies.`);
}
