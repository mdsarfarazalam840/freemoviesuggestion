import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Movie } from '../src/data/movies';
import type { MovieQueryOptions } from '../src/services/movieService';

// No dotenv: remove inherited service configuration before importing application code.
for (const name of Object.keys(process.env)) {
  if (/SUPABASE|UPSTASH|REDIS|TMDB|CLOUDFLARE|^CF_|^CACHE/.test(name)) process.env[name] = '';
}
Object.assign(globalThis, { __ENV: {}, __CF_CTX: undefined, caches: undefined });
let networkAttempts = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  networkAttempts++;
  throw new Error('Network access is forbidden in fallback tests');
};

const { movies } = await import('../src/data/movies');
const { getMoviesPage, searchMovies } = await import('../src/services/movieService');
const originalMovies = structuredClone(movies);
const originalReferences = [...movies];

after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(networkAttempts, 0);
  assert.deepEqual(movies, originalMovies, 'catalog content and order must remain unchanged');
  movies.forEach((movie, index) => assert.equal(movie, originalReferences[index]));
});

// Reference the original five-pass behavior, independently of the fused implementation.
function referencePage(options: MovieQueryOptions) {
  const region = options.region?.trim();
  const genre = options.genre?.trim();
  const ott = options.ott?.trim();
  const mood = options.mood?.trim();
  const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const filtered = originalMovies
    .filter((m) => !region || equal(m.region, region))
    .filter((m) => !genre || m.genres.some((g) =>
      (genre === 'Sci-Fi' ? ['Sci-Fi', 'Science Fiction'] : [genre]).some((value) => equal(g, value))))
    .filter((m) => !ott || m.ottPlatforms.some((p) => equal(p.name, ott)))
    .filter((m) => !mood || m.moodTags?.some((tag) => equal(tag, mood)))
    .filter((m) => !options.topOnly || m.isTop10)
    .sort((a, b) => {
      const aRank = a.rank ?? Infinity;
      const bRank = b.rank ?? Infinity;
      return aRank !== bRank ? aRank - bRank : b.releaseYear - a.releaseYear;
    });
  const page = options.page ?? 1;
  const limit = options.limit ?? 24;
  return {
    movies: filtered.slice((page - 1) * limit, page * limit),
    count: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit),
  };
}

test('fallback catalog preserves combined filters, order, counts, pagination and source', async () => {
  const filters = {
    region: ' hOlLyWoOd ', genre: ' Sci-Fi ', ott: ' nEtFlIx ', mood: ' ePiC ', topOnly: true,
  };
  const keys = Object.keys(filters) as (keyof typeof filters)[];
  // Exercise all 32 combinations, including each individual predicate and all five together.
  for (let mask = 0; mask < 32; mask++) {
    const selected = Object.fromEntries(keys.filter((_, i) => mask & (1 << i)).map((key) => [key, filters[key]]));
    for (const page of [1, 2, 20]) {
      const options = { ...selected, page, limit: 2, skipRemote: true };
      const actual = await getMoviesPage(options);
      assert.deepEqual(actual, referencePage(options), `filter mask=${mask}, page=${page}`);
      assert.deepEqual(movies, originalMovies);
    }
  }
  assert.ok(referencePage(filters).count > 0, 'all-five-filter case must include a real match');
  for (const emptyFilter of [
    { region: 'missing-region' }, { genre: 'missing-genre' },
    { ott: 'missing-platform' }, { mood: 'missing-mood' },
  ]) {
    const options = { ...filters, ...emptyFilter, skipRemote: true };
    assert.deepEqual(await getMoviesPage(options), referencePage(options));
    assert.equal(referencePage(options).count, 0);
  }
});

test('local search is case insensitive for title and description and preserves pagination', async () => {
  for (const term of ['  iNtErStElLaR  ', 'WORMHOLE', 'THE', '', 'no-match-unique-xyz']) {
    const needle = term.trim().slice(0, 80).toLowerCase();
    const expected: Movie[] = originalMovies.filter((m) =>
      m.title.toLowerCase().includes(needle) || m.description.toLowerCase().includes(needle));
    for (const page of [1, 2, 20]) {
      const limit = 2;
      const actual = await searchMovies(term, { page, limit, skipRemote: true });
      assert.deepEqual(actual, {
        movies: expected.slice((page - 1) * limit, page * limit),
        count: expected.length, page, limit, totalPages: Math.ceil(expected.length / limit),
      });
    }
  }
});
