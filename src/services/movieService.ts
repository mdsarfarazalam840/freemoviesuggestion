import { supabase } from '../lib/supabase';
import { getCachedData, setCachedData } from './cache';
import { fetchMoviesByLanguage } from './tmdb';
import { movies as localMovies } from '../data/movies';

export async function getTrendingMovies() {
  const cacheKey = 'trending_movies';
  
  // 1. Check Redis
  const cachedData = await getCachedData<any[]>(cacheKey);
  if (cachedData) {
    console.log('Returning cached trending data');
    return cachedData;
  }

  // 2. Fallback to Supabase
  console.log('Fetching trending from Supabase');
  const { data, error } = await supabase.from('movies').select('*');
  
  const result = (error || !data || data.length === 0) ? localMovies : data;

  // 3. Update Redis
  await setCachedData(cacheKey, result);
  
  return result;
}

export async function getAllMovies() {
  const cacheKey = 'all_movies';
  
  // 1. Check Redis
  const cachedData = await getCachedData<any[]>(cacheKey);
  if (cachedData) {
    console.log('Returning cached all movies data');
    return cachedData;
  }

  // 2. Fallback to Supabase
  console.log('Fetching all movies from Supabase');
  const { data, error } = await supabase.from('movies').select('*');
  
  const result = (error || !data || data.length === 0) ? localMovies : data;

  // 3. Update Redis
  await setCachedData(cacheKey, result);
  
  return result;
}

export async function getBollywoodMovies() {
  const cacheKey = 'bollywood_movies';
  const cachedData = await getCachedData<any[]>(cacheKey);
  if (cachedData) return cachedData;

  const data = await fetchMoviesByLanguage('hi');
  const mappedData = data.results.map((m: any) => ({
    id: m.id.toString(),
    title: m.title,
    slug: m.title.toLowerCase().replace(/ /g, '-'),
    thumbnail: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
    rating: m.vote_average,
    description: m.overview,
    releaseYear: parseInt(m.release_date.split('-')[0]),
    region: 'Bollywood',
    genres: [], // Need to fetch genres separately if needed, for now empty
    ottPlatforms: [], // TMDB doesn't return OTT platforms easily
    isTop10: false
  }));
  await setCachedData(cacheKey, mappedData);
  return mappedData;
}

export async function getTollywoodMovies() {
  const cacheKey = 'tollywood_movies';
  const cachedData = await getCachedData<any[]>(cacheKey);
  if (cachedData) return cachedData;

  const data = await fetchMoviesByLanguage('te');
  const mappedData = data.results.map((m: any) => ({
    id: m.id.toString(),
    title: m.title,
    slug: m.title.toLowerCase().replace(/ /g, '-'),
    thumbnail: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
    rating: m.vote_average,
    description: m.overview,
    releaseYear: parseInt(m.release_date.split('-')[0]),
    region: 'Tollywood',
    genres: [],
    ottPlatforms: [],
    isTop10: false
  }));
  await setCachedData(cacheKey, mappedData);
  return mappedData;
}
