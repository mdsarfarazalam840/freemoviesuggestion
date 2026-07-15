# Free Movie Suggestion — Project Plan

## Architecture

```
Cloudflare Pages (Astro SSR)
  ├── Movie catalog, detail, search, genre/region/OTT pages
  ├── REST API endpoints (/api/movies, /api/search, /api/movie/:id, ...)
  └── Middleware (CSP, cache, env injection)

Supabase (PostgreSQL)
  └── movies table (tmdb_id, title, genres, imdb_id, watchscore, mood_tags, ...)

Upstash Redis
  └── Response cache for API routes and page data

TMDB API
  └── Background sync only (never called during page views)

Wikipedia API (optional enrichment)
  └── Best-effort Rotten Tomatoes score extraction from infoboxes
```

---

## Completed Phases (1–7 — Baseline)

| Phase | What |
|---|---|
| 1 | Safe baseline: schema/index prep, bounded reads, env cleanup |
| 2 | Import 1,000 movies with resumable sync, public API routes |
| 3 | Upstash Redis cache for pages and API responses |
| 4 | Expand importer toward 10,000 useful movies |
| 5 | Cloudflare Pages deployment prep |
| 6 | GitHub Actions scheduled sync (every 4h) |
| 7 | Custom 404 page with GSAP animation |

---

## Phase 8: IMDB + Rotten Tomatoes Integration & Unique Identity (COMPLETED)

### Goal
Make the site a **Suggestion Engine** (not a rating aggregator clone) by integrating IMDB/RT as outbound credibility links while building unique, proprietary discovery features.

### What was built

#### Data Layer
- **`supabase/migrations/002_enrichment.sql`** — New columns: `imdb_id`, `watchscore`, `mood_tags` (JSONB), `rt_tomatometer`, `rt_audience_score`, `rt_certification` with indexes
- **`src/services/tmdb.ts`** — Added `external_ids` to `fetchMovieFullDetails()` so `imdb_id` is captured during sync
- **`src/services/wikipedia.ts`** **NEW** — Free, unlimited Wikipedia API client that searches for movie pages and parses infoboxes for Rotten Tomatoes scores (best-effort enrichment, no API key needed)
- **`src/services/sync.ts`** — Updated `mapTmdbMovie()` to extract `imdb_id`, compute `WatchScore`, and assign `MoodTags`. Updated `syncTrendingMovies()` similarly. Added post-upsert Wikipedia enrichment step.
- **`src/data/movies.ts`** — Added `MoodTag` type, `MOOD_TAGS`, `MOOD_EMOJI`, `MOOD_DESCRIPTION` constants. Updated `Movie` interface with `imdbId`, `imdbUrl`, `rtUrl`, `rtTomatometer`, `rtAudienceScore`, `rtCertification`, `watchScore`, `moodTags`. Updated all 12 fallback movies with enriched data.
- **`src/services/movieService.ts`** — Updated `normalizeMovie()` to pass through all new fields. Added `mood` filter support to queries and local fallback.

#### Unique Features

| Feature | Description |
|---|---|
| **WatchScore™** | Proprietary 0-100 score: 50% TMDB rating + 30% popularity + 20% recency. Displayed as a circular gauge — unique visual language, not stars |
| **Mood Tags** | 10 mood categories (Intense, Feel-Good, Mind-Bender, Emotional, etc.) derived from genre + rating patterns. Each has an emoji and description |
| **IMDB Outbound Link** | "View on IMDB" amber pill button linking to `imdb.com/title/{imdb_id}` — shows the movie is recognized on IMDB without stealing their score |
| **RT Outbound Link** | "🍅 Check Rotten Tomatoes" red pill button linking to RT search — credibility without copying their percentage |
| **OTT Intelligence** | "Available on {N} streaming platforms" summary with exclusivity hints |
| **Browse by Mood** | New homepage section with 10 mood cards linking to filtered catalog |
| **Mood Filter** | Catalog sidebar filter for mood alongside existing genre/OTT/region filters |
| **Rating Detail** | Movie detail page shows WatchScore as hero metric, TMDB as secondary, plus sidebar with all enrichment data |

#### UI Changes
- **MovieCard.astro** — Replaced star rating with WatchScore circular gauge overlay, added IMDB/RT badges, added mood tag pill
- **MovieCard.tsx** (React) — Same enhancements for the animated card variant
- **`[slug].astro`** (movie detail) — Full redesign: WatchScore gauge + contextual label, Mood Tags with emojis/tooltips, IMDB "View on IMDB" + "🍅 Check RT" buttons, OTT availability summary, enhanced Movie Intelligence sidebar with WatchScore, mood, OTT count, and IMDB/RT links
- **`index.astro`** (homepage) — New "Browse by Mood" section with 10 emoji + label mood cards
- **`movies/index.astro`** (catalog) — New Mood filter in sidebar with emoji pills
- **`/api/movies`** — Supports `?mood=` query parameter

#### Cost: $0
- IMDB IDs: Free via TMDB `external_ids`
- Wikipedia enrichment: Free (no API key, unlimited)
- RT search links: Free (constructed from movie title)
- All unique features: Built from existing TMDB data

---

## Enrichment Pipeline (GitHub Actions)

The sync + enrichment runs in GitHub Actions every 4 hours:

```
1. npx tsx scripts/run-sync.ts    →  Syncs trending + bulk movies from TMDB
2. npx tsx scripts/enrich-movies.ts →  Populates imdb_id, watchScore, mood_tags
```

`scripts/enrich-movies.ts` orchestrates:
1. **Trending sync** — quick refresh of homepage picks
2. **Bulk sync** — resumable sync from TMDB (picks up where last run paused)
3. **IMDB enrichment** — fetches `imdb_id` via TMDB's lightweight `/movie/{id}/external_ids` endpoint (no 500ms delay, ~3min per 1K movies)
4. **Score enrichment** — computes `watchScore` and `mood_tags` from existing DB data (no API calls, pure computation)

The Cloudflare Worker cron (`workers/index.ts`) also runs enrichment after its daily sync.

### Key files

| File | Purpose |
|---|---|
| `src/services/enrichment.ts` | Shared module: `computeWatchScore()`, `assignMoodTags()`, `enrichMissingImdbIds()`, `enrichWatchScoreAndMoodTags()` |
| `scripts/enrich-movies.ts` | CLI script called by GitHub Actions |
| `.github/workflows/sync.yml` | Runs `run-sync.ts` then `enrich-movies.ts` every 4h |
| `workers/index.ts` | Cron daily: sync + enrich on Cloudflare |

---

## Future Possibilities

### Short-term (no paid APIs)

| Idea | Effort | Impact |
|---|---|---|
| **Wikipedia RT enrichment** — Add Wikipedia infobox RT score extraction as a post-sync GitHub Action step. Already have `src/services/wikipedia.ts` — just needs a scheduler script. | Low | Medium |
| **Wikidata SPARQL enrichment** — Query Wikidata for `imdb_id`, RT ID, budget, box office using free SPARQL endpoint. More structured than Wikipedia parsing. | Medium | Medium |
| **"Why You'll Love This"** — AI-generated or template-based suggestion line on detail page (e.g., "If you loved Inception's mind-bending twists, you'll love this"). | Medium | High |
| **WatchScore leaderboard** — `/top-rated` page showing highest WatchScore movies across all regions. | Low | Medium |
| **Mood-based movie carousels** on homepage (e.g., "Feel-Good Picks", "Mind-Bending Movies"). Already have mood tags, just need to add sections. | Low | High |
| **User collections** — "Mood Boards" where users can save/group movies by mood. | High | High |
| **Rating discrepancy badge** — Highlight movies where TMDB rating and WatchScore diverge significantly (>2 points), indicating hidden gems or overrated titles. | Low | Medium |
| **Trending mood** — Show which mood category is most popular this week (e.g., "This week: Mind-Bender movies are trending"). | Low | Medium |
| **Better OTT data** — Currently OTT platforms are assigned randomly. Use TMDB `watch/providers` endpoint to get real OTT availability per region. | Medium | High |
| **IMDB Top 250 indicator** — Cross-reference IMDB IDs against a curated list to show "In IMDB Top 250" badge. | Low | Medium |

### Medium-term (may need paid APIs or external services)

| Idea | Effort | Impact |
|---|---|---|
| **OMDb API enrichment** ($1/month) — Get precise IMDB rating, RT scores, Metacritic for every movie. More reliable than Wikipedia scraping. | Low | High |
| **Aggregated rating** — Show TMDB + OMDb scores side-by-side when OMDb is available. | Low | Medium |
| **User voting** — Let users rate movies and create a community-driven score alongside WatchScore. | High | High |
| **AI recommendation engine** — Use TMDB keywords + user preferences to generate personalized suggestions. | High | Very High |
| **Watchlist / Favorites** — Let logged-in users save movies. | Medium | High |
| **Email digest** — Weekly email of "Top 10 Suggestions Based on Your Moods". | Medium | Medium |
| **TMDB keyword import** — TMDB has rich keyword data per movie (~50 keywords/movie). Importing these would enable much better "More Like This" recommendations. | Medium | High |

### Long-term vision

```
Personalized AI Suggestion Engine
  ├── Learns from your mood preferences
  ├── Cross-references TMDB keywords, cast, directors
  ├── Generates "Why You'll Love This" for every movie
  └── Builds custom "Mood Playlists" — like Spotify but for movies
```

---

## Verification Checklist

- [x] `npm run build` passes
- [x] `npx astro check` — 0 errors
- [x] No TMDB keys exposed to browser
- [x] All existing routes and functionality preserved
- [x] New fields (`imdb_id`, `watchscore`, `mood_tags`) in DB migration
- [x] Local fallback movies updated with new fields
- [x] MovieCard.astro + React MovieCard.tsx both updated
- [x] Movie detail page enhanced with WatchScore, moods, IMDB/RT links
- [x] Homepage "Browse by Mood" section added
- [x] Catalog mood filter added
- [x] API supports `?mood=` parameter
- [x] Wikipedia enrichment service created (free, no API key)
- [x] Sync pipeline maps `imdb_id`, computes WatchScore, assigns MoodTags
