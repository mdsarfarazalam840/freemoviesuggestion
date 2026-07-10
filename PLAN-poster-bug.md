# Plan: Fix Bollywood Poster Black Screen / No Image Bug

## Problem Summary

Some Bollywood movies show a black screen or no image in the poster. This happens in two places:
1. **Movie detail page** (`src/pages/movie/[slug].astro`) — the poster image and background hero image show as blank/black
2. **Movie cards** (components `MovieCard.tsx` and `MovieCard.astro`) — the poster thumbnail fails and falls back inconsistently

---

## Root Causes Found

### 1. Missing fallback on Movie Detail Page (`src/pages/movie/[slug].astro:77-91`)

The detail page renders **two images** using `movie.thumbnail` **without any fallback**:

```astro
<!-- Background blur image — NO onerror handler, NO fallback -->
<img src={movie.thumbnail} ... class="blur-3xl opacity-40 ..." />

<!-- Poster image — NO onerror handler, NO fallback -->
<img src={movie.thumbnail} ... />
```

If `movie.thumbnail` is an empty string `""` or a broken URL, the browser displays nothing. Combined with the dark gradient overlay (`bg-gradient-to-t from-canvas via-canvas/40`), this creates a **near-black screen** — especially in dark mode.

**Both `MovieCard.tsx` and `MovieCard.astro` already have `onerror` handlers and `|| PLACEHOLDER_SVG` fallbacks**, so the cards work correctly. The detail page is the main culprit.

### 2. Empty thumbnail stored in database via `syncTrendingMovies()`

**`src/services/sync.ts:347-401` — `syncTrendingMovies()`**: This function syncs trending movies but **does NOT filter out movies without `poster_path`**. The main `syncMovies()` function does filter at line 286:

```typescript
if (basicMovie.adult || !basicMovie.poster_path || !basicMovie.release_date) {
    stats.skipped++;
    continue;
}
```

But `syncTrendingMovies()` processes ALL TMDB results unconditionally, storing empty `poster_path` values. Since `upsert` overwrites on `tmdb_id` conflict, a trending sync can write incomplete data that overwrites good data.

### 3. `normalizeMovie()` returns empty string for missing thumbnails

**`src/services/movieService.ts:131-148`**: When both `row.thumbnail` and `row.poster_path` are missing, `thumbnail` is set to `""` (empty string):

```typescript
thumbnail: (row.thumbnail && row.thumbnail.trim()) ||
    (row.poster_path && row.poster_path.trim()
        ? `https://image.tmdb.org/t/p/w500${row.poster_path.trim()}`
        : ''),
```

The `|| PLACEHOLDER_SVG` in the cards catches this (since `""` is falsy), but it's still a data quality issue.

### 4. `getMoviesPage()` caches movies with empty thumbnails

**`src/services/movieService.ts:308-335`**: Unlike `searchMovies()` (which checks for empty thumbnails at line 500-502 and skips caching), `getMoviesPage()` does **not** validate thumbnail presence before caching. Empty-thumbnail movies get cached in Upstash Redis and served repeatedly.

### 5. Bollywood syncs more data with lower quality threshold

In `src/services/sync.ts`, Bollywood (Hindi) has the highest page counts:
- **40 pages** for popular (vs 20 for other regions)
- **35 pages** for latest (vs 15 for other regions)
- Uses `vote_count.gte: '1'` — very permissive

This pulls in more obscure movies with potentially incomplete TMDB data (missing posters, low vote counts, etc.).

### 6. TMDB poster CDN reliability

The CSP (`src/middleware.ts:11`) restricts images to `https://image.tmdb.org`. If TMDB's CDN is slow, rate-limited, or a specific poster path returns a 404/403, the image fails to load. The cards handle this via `onerror`, but the detail page doesn't.

---

## Investigation / Diagnosis Steps

### Step 1: Identify which movies have empty/broken thumbnails

- Query Supabase: `SELECT tmdb_id, title, region, poster_path FROM movies WHERE region = 'Bollywood' AND (poster_path IS NULL OR poster_path = '' OR thumbnail IS NULL OR thumbnail = '')`
- Check Redis cached pages for movies with empty `thumbnail` fields
- Log the count of empty-thumbnail movies by region to understand the scale

### Step 2: Test TMDB poster URL validity

- For a sample set of Bollywood movies with empty `poster_path`, check whether TMDB actually has poster data via their API: `GET https://api.themoviedb.org/3/movie/{tmdb_id}`
- If TMDB has data, the issue is the sync process not fetching it
- If TMDB doesn't have data, these movies genuinely lack posters and need the placeholder

### Step 3: Reproduce the "black screen" on the movie detail page

- Navigate to `/movie/{slug}` for a Bollywood movie known to have an empty thumbnail
- Observe the blank poster and near-black background area
- Check browser DevTools console for image 404 errors

### Step 4: Review cached data

- Check Redis for cached entries (`remote_movies:v7:*`) containing movies with empty thumbnails
- Verify whether clearing the Redis cache resolves the issue temporarily (until stale data is re-cached)

---

## Fix Plan

### Fix 1: Add fallback image handling to Movie Detail Page

**File: `src/pages/movie/[slug].astro`**

- Add `onerror` handler to the background `<img>` (line 78-81) to fallback to a gradient or hide
- Add `onerror` handler to the poster `<img>` (line 88-91) to fallback to the placeholder SVG
- Optionally add CSS-only fallback using a gradient background on the poster container when image fails

The cards already handle this. The detail page must be brought to parity.

### Fix 2: Fix `syncTrendingMovies()` to filter out movies without poster_path

**File: `src/services/sync.ts`**

- Add the same `poster_path` filter to `syncTrendingMovies()` that exists in `syncMovies()`:
  ```typescript
  if (!basicMovie.poster_path) continue;
  ```
- This prevents empty-thumbnail movies from entering the database via trending sync

### Fix 3: Add thumbnail validation before caching in `getMoviesPage()`

**File: `src/services/movieService.ts`**

- Add the same empty-thumbnail check that `searchMovies()` uses:
  ```typescript
  const hasEmptyThumbnails = result.movies.some((m) => !m.thumbnail);
  if (hasEmptyThumbnails) {
      console.warn(`[page] ${result.movies.filter((m) => !m.thumbnail).length}/${result.movies.length} movies have empty thumbnails — skipping cache`);
  } else {
      await setCachedData(cacheKey, result, ttl);
  }
  ```

### Fix 4: Add empty-thumbnail filtering in `normalizeMovie()` or at the display layer

**File: `src/services/movieService.ts`** (or card components)

- Option A: In `normalizeMovie()`, set thumbnail to an empty string and let the UI handle it (current approach — cards already work, just fix detail page)
- Option B: In `normalizeMovie()`, inject the placeholder SVG URL as default:
  ```typescript
  thumbnail: (row.thumbnail && row.thumbnail.trim()) ||
      (row.poster_path && row.poster_path.trim()
          ? `https://image.tmdb.org/t/p/w500${row.poster_path.trim()}`
          : PLACEHOLDER_URL),
  ```
  This would need the placeholder to be available server-side (either inline base64 or a hosted file).

**Recommendation**: Option A (UI handles fallback) is cleaner since the placeholder SVG is already in the frontend code.

### Fix 5: Re-sync affected Bollywood movies

- After fixing fixes 1-4, clear the Redis cache to force re-fetch
- Re-run the sync for Bollywood to re-populate movies that were missing poster_path
- For movies that genuinely have no TMDB poster, the UI fallback will display the placeholder SVG

### Fix 6: Add monitoring for thumbnail health

- Add a simple health check that queries Supabase weekly for movies with empty `thumbnail` or `poster_path`
- Log the count by region to detect if new syncs are introducing bad data

---

## Files to Modify

| File | Change |
|---|---|
| `src/pages/movie/[slug].astro` | Add `onerror` handlers to both `<img>` tags; add `|| PLACEHOLDER_SVG` fallback |
| `src/services/sync.ts` | Add `poster_path` filter in `syncTrendingMovies()` |
| `src/services/movieService.ts` | Add empty-thumbnail check before caching in `getMoviesPage()` |
| `src/services/movieService.ts` | (Optional) Consider `searchMovies()`-style validation in `fetchMoviePage()` |

## Files NOT to Modify (already correct)

| File | Reason |
|---|---|
| `src/components/MovieCard.tsx` | Already has `movie.thumbnail || PLACEHOLDER_SVG` AND `onerror` |
| `src/components/MovieCard.astro` | Already has `movie.thumbnail || 'data:image/svg+xml...'` AND `onerror` |
| `src/pages/api/movies.ts` | API just proxies `movieService`, the fix happens in the service layer |
| `src/middleware.ts` | CSP already allows `data:` and `https://image.tmdb.org` |
