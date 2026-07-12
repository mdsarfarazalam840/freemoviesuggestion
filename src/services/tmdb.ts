import { getTmdbAccessToken } from '../lib/env';

const BASE_URL = 'https://api.themoviedb.org/3';
const FETCH_TIMEOUT_MS = 10000;

// Proactive rate limiter: max 30 req/s (TMDB limit is ~40 req/s)
const requestTimestamps: number[] = [];

async function rateLimit() {
  const now = Date.now();
  while (requestTimestamps.length > 0 && now - requestTimestamps[0] > 1000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= 30) {
    const waitTime = 1000 - (now - requestTimestamps[0]) + 5;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  requestTimestamps.push(Date.now());
}

function getApiKey(): string {
  return getTmdbAccessToken();
}

async function fetchWithRetry(url: string, retries = 3, backoff = 1000): Promise<any> {
  await rateLimit();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
      if (retries > 0) {
        console.warn(`TMDB API request failed with status ${response.status}. Retrying in ${backoff}ms... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, retries - 1, backoff * 2);
      }
    }

    if (!response.ok) throw new Error(`TMDB API request failed: ${response.statusText}`);
    return response.json();
  } catch (error) {
    if (retries > 0) {
      console.warn(`TMDB API request failed due to network error. Retrying in ${backoff}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTrendingMovies() {
  return fetchWithRetry(`${BASE_URL}/trending/movie/day`);
}

export async function fetchMoviesByLanguage(languageCode: string) {
  return fetchWithRetry(`${BASE_URL}/discover/movie?with_original_language=${languageCode}&sort_by=popularity.desc`);
}

export async function discoverMovies(page = 1, filters: Record<string, string> = {}) {
  const params = new URLSearchParams({
    page: page.toString(),
    sort_by: 'popularity.desc',
    'vote_count.gte': '20',
    ...filters
  });
  
  return fetchWithRetry(`${BASE_URL}/discover/movie?${params.toString()}`);
}

export async function fetchMovieFullDetails(tmdbId: number) {
  return fetchWithRetry(`${BASE_URL}/movie/${tmdbId}?append_to_response=credits`);
}
