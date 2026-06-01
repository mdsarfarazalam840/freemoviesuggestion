import { supabase } from '../lib/supabase';
import { fetchTrendingMovies } from './tmdb';
import { redis } from '../lib/redis';
import { OTT_PLATFORMS } from '../data/movies';

export async function syncTrendingMovies() {
  const data = await fetchTrendingMovies();
  const movies = data.results.map((movie: any) => ({
    tmdb_id: movie.id,
    title: movie.title,
    slug: movie.title.toLowerCase().replace(/ /g, '-'),
    overview: movie.overview,
    description: movie.overview, // UI uses description
    thumbnail: `https://image.tmdb.org/t/p/w500${movie.poster_path}`,
    poster_path: movie.poster_path,
    release_date: movie.release_date,
    release_year: new Date(movie.release_date).getFullYear(), // DB column
    vote_average: movie.vote_average,
    rating: movie.vote_average, // UI uses rating
    region: 'Hollywood', 
    genres: [], 
    ott_platforms: [OTT_PLATFORMS[0]], // DB column
    is_top_10: false, // DB column
    rank: 0,
  }));

  const { error } = await supabase.from('movies').upsert(movies, { onConflict: 'tmdb_id' });
  if (error) throw error;
  
  await redis.del('trending_movies');
  
  console.log(`Successfully synced ${movies.length} movies and cleared cache.`);
}
