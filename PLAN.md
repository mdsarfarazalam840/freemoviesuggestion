# Free Movie Suggestion Deployment and Data Plan

## Roadmap At A Glance

| Phase | Status | What It Covers |
| --- | --- | --- |
| Phase 1 | Complete | Safe baseline, schema/index prep, bounded reads, env cleanup |
| Phase 2 | Complete | Import 1,000 movies with resumable sync and upserts. Added public API routes. |
| Phase 3 | Complete | Upstash cache for pages and API responses |
| Phase 4 | Complete | Expand importer toward 10,000 useful movies |
| Phase 5 | Complete | Cloudflare Pages deployment prep |
| Phase 6 | Complete | Optional GitHub Actions scheduled sync |
| Phase 7 | Complete | Custom 404 page implementation |

## Recommended Phase Order

1. Phase 1: Safe Baseline
   - Add/confirm Supabase schema/index migration files.
   - Add server-safe env handling without exposing secrets.
   - Refactor movie reads into paginated Supabase query helpers.
   - Keep existing UI/routes working.
   - Confirm TMDB is not called from browser-facing code.

2. Phase 2: API Routes
   - Add `/api/movies`, `/api/movie/:id`, `/api/search`, `/api/genres/:slug`, `/api/recommendations`.

3. Phase 3: Upstash Cache
   - Add planned cache keys/TTLs around API routes.

4. Phase 4: Importer
   - Upgrade `npm run sync` to controlled TMDB import.
   - Add filters, upsert by `tmdb_id`, retry/backoff, progress resume, and count logs.

5. Phase 5: Cloudflare Prep
   - Switch Astro deployment config from Node adapter to Cloudflare.

6. Phase 6: Scheduled Sync
   - Add GitHub Actions workflow for daily data updates.

7. Phase 7: UI Enhancement
   - Implement custom 404 error page with animations (GSAP).

## Current Status

- All phases (1-7) are implemented and verified.
- Build and Astro diagnostics are passing.

## Handoff Checkpoint

Project is now fully set up with:
- Cloudflare Pages for hosting.
- Supabase for primary data storage.
- Upstash Redis for API caching.
- Automated daily TMDB sync via GitHub Actions.
- Custom branded 404 page.

Completed in Phase 1:

- Added server-side env helpers with fallback support for the existing env names.
- Added a baseline Supabase migration for `movies` plus indexes and full-text search.
- Refactored movie reads to use bounded page queries instead of loading all movies.
- Updated the existing movie, genre, region, OTT, and movie list pages to use those bounded reads.
- Fixed JSONB filtering so genre and OTT pages query Supabase correctly.

Completed in Phase 2:
- Implemented API routes for movies, search, genres, and recommendations.
- Integrated TMDB sync service with Supabase for bulk movie data.

Completed in Phase 3:
- Added Upstash Redis caching to all core API routes (`/api/movies`, `/api/movie/:id`, `/api/search`, `/api/genres/:slug`, `/api/recommendations`).
- Implemented X-Cache headers to monitor cache performance.
- Set appropriate TTLs for different data types (15m to 24h).

Completed in Phase 7:
- Implemented custom 404 page using Astro, Tailwind CSS, and GSAP for animations.

This plan is written for future AI agents or developers working on this repo. Follow it when adding TMDB bulk data, Supabase storage, Upstash caching, and Cloudflare hosting. Keep changes incremental and avoid breaking existing user-facing pages.

## Current Project Context

- Framework: Astro.
- Existing sync command: `npm run sync`.
- Existing sync entry point: `scripts/run-sync.ts`.
- Existing dependencies include Supabase and Upstash:
  - `@supabase/supabase-js`
  - `@upstash/redis`
- Target hosting preference: free or free-tier-first.

## Recommended Free Architecture

Use this architecture:

```txt
Cloudflare Pages
  - hosts Astro frontend
  - hosts API routes through Pages Functions / Astro server endpoints

Supabase
  - main movie database
  - source of truth for website reads

Upstash Redis
  - small response cache
  - optional rate limiting
  - not the main movie database

TMDB
  - background data source only
  - never called directly from browser
  - never called during normal public page views unless explicitly needed as an admin-only fallback

Importer
  - run locally first with `npm run sync`
  - later may run from GitHub Actions cron
  - should be slow, resumable, and rate-limited
```

Do not add a separate backend host unless the free Cloudflare Pages Functions quota becomes a real bottleneck.

## Hosting Decision

Use Cloudflare Pages for the frontend and API.

- Frontend: Cloudflare Pages.
- API routes: Cloudflare Pages Functions or Astro server endpoints deployed with Cloudflare support.
- Do not host normal public API routes on Render, Railway, or a VPS while the project is still free-tier-first.
- Do not use Cloudflare Workers as a long-running bulk importer on the free plan.

Expected public API shape:

```txt
/api/movies
/api/movie/:id
/api/search?q=batman
/api/genres/:slug
/api/recommendations
```

These API routes should read from Upstash first, then Supabase, then return JSON.

## TMDB Safety Rules

The TMDB API key must never be exposed to the browser.

Normal public website traffic must not call TMDB. This prevents:

- API key leakage.
- High request spikes.
- Slow page loads.
- Higher ban/rate-limit risk.

TMDB calls are allowed only in:

- `scripts/run-sync.ts`
- service files used by the sync/import pipeline
- future admin-only maintenance routes, if protected
- future GitHub Actions cron jobs

Importer rules:

- Use TMDB daily ID exports to discover valid IDs.
- Fetch movie details slowly.
- Start with 1,000 movies, then 10,000 useful movies, then increase only if storage and performance are healthy.
- Use low concurrency, for example 1-3 requests per second.
- Add retry with exponential backoff for `429`, `5xx`, and network failures.
- Persist progress so the import can resume.
- Upsert by `tmdb_id`; never blindly insert duplicates.
- Log failures without stopping the full import.
- Keep TMDB attribution visible on the website.
- Refresh old data periodically instead of treating TMDB data as permanent.

## Data Scope

Do not import all TMDB fields by default. Store only fields needed by the website.

Recommended `movies` fields:

```txt
id
tmdb_id
title
slug
overview
poster_path
backdrop_path
release_date
release_year
runtime
vote_average
vote_count
popularity
original_language
genres
director
top_cast
tmdb_updated_at
created_at
updated_at
```

Optional fields:

```txt
raw_json
keywords
providers
certification
```

Avoid storing:

- Full image files in Supabase Storage.
- Full cast and crew for every movie unless a page needs it.
- Large raw JSON for every movie on the Supabase free tier.
- Every obscure/empty/adult/video TMDB record.

Useful import filters:

```txt
adult = false
video = false
poster_path is not null
overview is not empty
release_date is not null
vote_count > 20
popularity > 1
```

Adjust thresholds if the catalog is too small.

## Supabase Plan

Supabase is the source of truth for movie data.

Use indexes for every common query path. At minimum, add indexes for:

```sql
create unique index if not exists movies_tmdb_id_idx on movies(tmdb_id);
create index if not exists movies_popularity_idx on movies(popularity desc);
create index if not exists movies_release_date_idx on movies(release_date desc);
create index if not exists movies_vote_average_idx on movies(vote_average desc);
create index if not exists movies_original_language_idx on movies(original_language);
```

For search, use Postgres full-text search instead of scanning rows in application code.

Recommended search pattern:

```sql
alter table movies
add column if not exists fts tsvector
generated always as (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(overview, '') || ' ' || coalesce(director, '')
  )
) stored;

create index if not exists movies_fts_idx on movies using gin (fts);
```

All list APIs must use pagination. Never return thousands of movies in one response.

Recommended limits:

```txt
movie grids: 20-30 items per page
search results: 10-20 items per page
homepage sections: 10-24 items per section
```

## Upstash Cache Plan

Use Upstash only for high-value cached responses and optional rate limiting.

Good cache keys:

```txt
home:popular
home:trending
movies:popular:page:1
movies:latest:page:1
genre:action:page:1
movie:tmdb:550
search:batman:page:1
```

Suggested TTLs:

```txt
homepage: 15-60 minutes
popular/genre pages: 1-6 hours
movie detail: 1-7 days
search: 5-30 minutes
```

Do not cache unlimited search queries forever. Search caches must have short TTLs.

When the importer updates movies, invalidate related broad keys if practical:

```txt
home:*
movies:popular:*
movies:latest:*
genre:*
```

If wildcard deletion is not available or too expensive, use versioned cache keys:

```txt
cache_version = v1
home:v1:popular
```

Then increment the version after a large import.

## API Route Rules

Public API routes should follow this sequence:

```txt
1. Validate query params.
2. Build stable cache key.
3. Try Upstash cache.
4. If cache hit, return cached JSON.
5. Query Supabase with pagination and indexed filters.
6. Store compact JSON in Upstash with TTL.
7. Return response with cache headers.
```

API routes must not:

- Return secret environment variables.
- Call TMDB during normal public traffic.
- Return unbounded result sets.
- Load all movies into memory.
- Store huge payloads in Upstash.

Recommended response headers for public data:

```txt
Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=86400
```

Tune this per endpoint.

## Environment Variables

Keep secrets server-side only.

Expected variables:

```txt
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
TMDB_API_KEY or TMDB_ACCESS_TOKEN
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Rules:

- `SUPABASE_SERVICE_ROLE_KEY` must be used only in trusted server scripts/routes.
- `TMDB_API_KEY` / `TMDB_ACCESS_TOKEN` must never be exposed to the browser.
- `PUBLIC_*` variables are browser-visible; do not put secrets there.

## Implementation Phases

### Phase 1: Safe Baseline

- Confirm current Supabase schema.
- Confirm current sync behavior in `src/services/sync`.
- Add missing indexes.
- Ensure all movie list pages use pagination.
- Ensure browser code does not call TMDB directly.

### Phase 2: Import 1,000 Movies

- Update `npm run sync` to import a small controlled batch.
- Use TMDB daily ID export or a constrained TMDB endpoint.
- Upsert by `tmdb_id`.
- Store only required fields.
- Log import counts:
  - fetched
  - inserted
  - updated
  - skipped
  - failed

### Phase 3: Add API Cache

- Add a small Upstash helper.
- Cache homepage, movie detail, genre page 1, and search.
- Add TTLs.
- Add cache bypass for development if needed.

### Phase 4: Import 10,000 Useful Movies

- Increase sync batch size gradually.
- Keep low concurrency.
- Resume from saved progress.
- Monitor Supabase database size.
- Avoid storing raw JSON if Supabase free tier becomes tight.

### Phase 5: Deploy to Cloudflare Pages

- Configure Astro for Cloudflare if server/API routes are needed.
- Set Cloudflare Pages build command:

```txt
npm run build
```

- Set environment variables in Cloudflare Pages.
- Verify API routes work after deployment.
- Verify TMDB secrets are not present in client bundles.

### Phase 6: Optional Scheduled Sync

If local sync becomes inconvenient, use GitHub Actions cron:

```txt
GitHub Actions scheduled job
  -> npm install
  -> npm run sync
  -> writes to Supabase
```

Keep GitHub Actions secrets private:

```txt
SUPABASE_SERVICE_ROLE_KEY
TMDB_API_KEY or TMDB_ACCESS_TOKEN
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Do not move bulk sync into public request handlers.

## Verification Checklist

Before considering the work complete:

- `npm run build` passes.
- Public pages do not expose TMDB key.
- Public pages do not call TMDB in browser devtools network tab.
- API routes return paginated results.
- Search uses an index or RPC, not application-side filtering over all rows.
- Upstash failures do not break the website; they should fall back to Supabase.
- Supabase failures return clean API errors.
- Importer can resume after interruption.
- Importer does not create duplicate movies.
- TMDB attribution is visible where TMDB data is used.

## Things Future Agents Should Avoid

- Do not replace Supabase with Cloudflare D1 without explicit approval.
- Do not download TMDB images into Supabase Storage by default.
- Do not add live TMDB calls to homepage, search, genre, or detail pages.
- Do not import hundreds of thousands of movies on the free Supabase tier.
- Do not use Upstash as the primary movie database.
- Do not remove existing routes or UI while adding infrastructure.
- Do not commit real API keys or `.env` files.
- Do not add broad refactors while implementing one phase.

## Practical Default Recommendation

For the current goal, build toward this first:

```txt
Cloudflare Pages + Pages Functions
Supabase movies table with indexes
Upstash cache for common responses
Local `npm run sync` importer for TMDB
10,000 filtered useful movies, not all TMDB records
```

This gives a free-tier-friendly launch path while keeping the website fast and reducing TMDB API risk.
ath while keeping the website fast and reducing TMDB API risk.
