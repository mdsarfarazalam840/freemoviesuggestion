# Performance Optimization and Architecture Documentation Design

**Status:** Approved for implementation planning  
**Baseline commit:** `c66e8d6`  
**Scope:** Performance-focused optimization, plus README architecture documentation

## Goal

Improve the application's runtime and delivery efficiency without changing user-visible movie discovery behavior, the existing Astro/Cloudflare/Supabase architecture, or the current cache fallback model. Make the repository architecture easier to understand by documenting the checked-in `architecture.png` asset in `README.md`.

## Current system boundaries

- Astro SSR pages and API routes run through `src/middleware.ts` on Cloudflare Workers.
- `src/services/movieService.ts` owns catalog, search, recommendation, normalization, fallback, and service-level caching behavior.
- `src/services/cache.ts` provides isolate-memory, Cloudflare Cache API, and metered-store caching.
- `src/services/cacheStore.ts` coordinates Upstash Redis and Workers KV with failover diagnostics.
- Supabase is the primary movie-data store; `src/services/sync.ts` and the sync worker ingest/enrich data from TMDB and Wikipedia.
- `architecture.png`, `architecture.html`, and `architecture-interactive.html` describe the system at different levels of detail.

## Proposed implementation

### 1. Establish a performance baseline

Run the existing repository checks before changing source files:

```sh
npx astro check
npm run build
```

Inspect the generated build for oversized or duplicated server/client output and record any limitation caused by missing external service credentials. Run the existing browser/API tests only when their local server and dependencies are available; do not add credentials or modify environment files to make them pass.

### 2. Optimize request and cache hot paths

Review and make focused changes in `src/middleware.ts`, `src/services/cache.ts`, `src/services/cacheStore.ts`, and API routes under `src/pages/api/`.

Potential changes must be evidence-driven and preserve these invariants:

- Health endpoints remain uncached.
- Cache keys continue to ignore tracking/debug query parameters and remain stable for equivalent requests.
- `skipRemote` continues to prevent metered-tier reads and writes for unbounded suggestion/search key spaces.
- Cache failures remain non-fatal and fall back to the next available data path.
- Debug headers continue to report per-request store command deltas when requested.
- Responses retain their current content types and cache-control semantics unless a measured correction is required.

Candidate improvements include consolidating repeated query-parameter normalization, avoiding duplicate serialization or cache work, tightening response cloning and background writes, and reducing avoidable per-request allocations. Do not replace the three-tier cache design or introduce a new cache dependency.

### 3. Optimize movie-service data work

Review `src/services/movieService.ts` and its callers for repeated normalization, redundant filtering/sorting, unnecessarily large result sets, and avoidable fallback work.

Candidate improvements include reusing normalized query values in cache keys and database filters, ensuring filters are pushed to Supabase where supported, avoiding repeated scans of static platform metadata, and preserving bounded remote caching for high-cardinality routes. Any query change must preserve pagination, total counts, filter semantics, fallback behavior, and slug/field normalization.

### 4. Inspect sync and enrichment efficiency

Review `src/services/sync.ts`, `src/services/tmdb.ts`, `src/services/enrichment.ts`, `src/services/wikipedia.ts`, `workers/index.ts`, and `scripts/run-sync.ts` for avoidable sequential requests, duplicate lookups, excessive payload handling, and work that can safely be batched or bounded.

Only make changes that preserve retry, timeout, rate-limit, checkpoint, and partial-progress behavior. Do not increase third-party request rates beyond the existing provider limits.

### 5. Review production build configuration

Inspect Astro/Vite configuration and component imports for safe bundle reductions or server-only/client-only boundary improvements. Preserve SSR output and React island behavior. Do not change dependencies or upgrade packages unless the baseline identifies a direct, verifiable performance benefit.

### 6. Update README architecture documentation

Update `README.md` without removing existing user-authored content. The architecture section will:

- Display the repository-relative image with `./architecture.png`.
- Include useful alternative text.
- Explain the Sync → Store → Serve flow in concise terms.
- Identify Cloudflare Workers, Supabase, Upstash Redis, Workers KV, TMDB, and the edge cache.
- Keep the interactive architecture links and Mermaid diagrams aligned with the actual implementation.

## Testing and verification

The implementation is complete only when:

1. `npx astro check` completes successfully, or any pre-existing/environment-specific failure is clearly isolated.
2. `npm run build` completes successfully and produces the expected `dist/` output.
3. Existing runtime tests that can run locally are executed and their actual result is recorded.
4. Cache-path behavior is checked for cache hit, cache miss, `skipRemote`, health bypass, and backend failover cases using existing test seams or focused tests if the repository has a suitable test location.
5. The final diff is limited to performance-related source/config changes, the README, and this design/plan documentation.
6. `README.md` references `./architecture.png`, and the image exists at that path.

## Non-goals

- No visual redesign or product feature work.
- No database migration unless an existing query bottleneck cannot be addressed safely at the application layer.
- No secret rotation, environment-file changes, or credential inspection.
- No wholesale architectural rewrite.
- No claims of improved latency or cost without a reproducible measurement or a clearly stated measurement limitation.

## Risks and mitigations

- **Cache correctness regression:** retain existing key/version semantics and verify equivalent requests map to equivalent responses.
- **Pagination/filter regression:** compare API response shape and boundary cases before and after changes.
- **Sync provider throttling:** preserve current rate limiter, retry, and timeout controls; prefer bounded concurrency over unrestricted parallelism.
- **Build/runtime incompatibility:** run `astro check` and production build after each logical group of changes.
- **Uncommitted user work:** inspect the diff before editing and avoid overwriting unrelated changes in `README.md` or `wrangler.json`.
