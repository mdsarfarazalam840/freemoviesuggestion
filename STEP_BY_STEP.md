# Analytics and Cloudflare D1: step-by-step runbook

Run all commands from the repository root (`F:\Pro\freemoviesuggestion` on the current Windows checkout). This guide covers the first-party analytics implementation in `src/pages/api/analytics/`, the public live-count endpoint, and the website Worker configured by the root `wrangler.json`.

## 1. Prerequisites

- Node.js `>=22.12.0` and npm. Confirm with `node --version` and `npm --version`.
- Dependencies installed with `npm install`.
- Wrangler is available through the project dependency: use `npx wrangler`, not a different global version.
- A Cloudflare account with access to the `freemoviesuggestion-analytics` D1 database for production operations.
- The production site credentials required by the rest of the app (Supabase, TMDB, and cache settings) when exercising movie pages. Analytics itself only needs the D1 binding and admin secret.

## 2. Authenticate Wrangler and verify the account

```sh
npx wrangler login
npx wrangler whoami
```

Complete the browser login when prompted. Check that `whoami` reports the account that owns the production D1 database before running any command with `--remote`.

## 3. Check and correct the D1 binding

The website binding belongs in the root `wrangler.json`, not `workers/wrangler.toml` (that file configures the separate `movie-sync-worker`). To use your preferred binding name, configure this block while preserving all other settings:

```json
"d1_databases": [
  {
    "binding": "freemoviesuggestion_analytics",
    "database_name": "freemoviesuggestion-analytics",
    "database_id": "<the-real-production-database-id>",
    "migrations_dir": "migrations"
  }
]
```

Keep your existing database ID; do not create another database. The database name (`freemoviesuggestion-analytics`) and the JavaScript binding (`freemoviesuggestion_analytics`) are different names and need not match.

**Required code change before building:** the existing application expects `ANALYTICS_DB`. Changing only the configuration is not enough. Replace the identifier `ANALYTICS_DB` with `freemoviesuggestion_analytics` in these files, including environment type declarations and property accesses:

1. `src/pages/api/analytics/track.ts`
2. `src/pages/api/analytics/live.ts`
3. `src/pages/api/analytics/summary.ts`
4. `src/pages/api/analytics/cleanup.ts`
5. `tests/analytics.test.ts` (mock binding keys must match)

For example, `env.ANALYTICS_DB` becomes `env.freemoviesuggestion_analytics` and `{ ANALYTICS_DB: db }` becomes `{ freemoviesuggestion_analytics: db }`. Check any generated binding types too if you have generated them. Do not rename `ANALYTICS_ADMIN_SECRET`, SQL tables, the database name, or database ID.

This guide describes changes you must make; updating this document does not perform those code/configuration replacements for you. Run the checks in Step 7 afterward.

## 4. Keep local and remote D1 operations separate

Use `--local` for local development and tests. **Never use `--remote` for local tests.** A command without an explicit mode can be ambiguous, so include the mode every time.

Leave `remote: true` out of the D1 binding. It is not required for production deployment; it makes local development use the remote database instead of the local simulator.

Local D1 state is Wrangler's local state under `.wrangler/`; it is disposable and does not change production. Remote commands change the Cloudflare database and require the authenticated production account.

## 5. Apply, list, and query the local migration

The schema is `migrations/0001_analytics.sql` and creates `analytics_visitors`, `analytics_sessions`, and `analytics_page_views`.

```sh
npx wrangler d1 migrations apply freemoviesuggestion-analytics --local
npx wrangler d1 migrations list freemoviesuggestion-analytics --local
npx wrangler d1 execute freemoviesuggestion-analytics --local --command="SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'analytics_%' ORDER BY name;"
npx wrangler d1 execute freemoviesuggestion-analytics --local --command="SELECT COUNT(*) AS visitors FROM analytics_visitors; SELECT COUNT(*) AS sessions FROM analytics_sessions; SELECT COUNT(*) AS page_views FROM analytics_page_views;"
```

If the local database needs a clean rehearsal, remove only the local Wrangler state after stopping dev servers, then apply the migration again. Do not delete a remote database to reset local work.

## 6. Create a local admin secret and ensure it is ignored

Create or edit `.dev.vars` at the repository root with a random value used only on this machine:

```text
ANALYTICS_ADMIN_SECRET=<random-local-only-secret>
```

Do not copy a production secret into this file, commit it, paste it into the guide, or put it in a URL. `.gitignore` includes `.dev.vars`; verify it is ignored with:

```sh
git check-ignore -v .dev.vars
git status --short -- .dev.vars
```

The first command should identify the `.gitignore` rule, and the second should produce no status line for the file. If `.dev.vars` was already tracked in another clone, remove it from the index without deleting the local file (`git rm --cached .dev.vars`) and rotate any exposed value.

## 7. Run repository checks

```sh
npm test
npx astro check
npm run build
```

Run these from the root after the local migration is available. The tests cover payload validation, opt-out, rate limits, aggregate queries, protected summary access, and cleanup SQL. The build output is under `dist/` and is ignored by Git.

## 8. Start local development

```sh
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:4321/`. The Astro dev server reads `.dev.vars`; keep the terminal running while testing. Stop it with `Ctrl+C`.

## 9. Manually test tracking, page views, heartbeats, and opt-out

Use a valid UUID v4 for each ID. The browser script in `src/layouts/Layout.astro` sends a `page_view` on load and a `heartbeat` while the page remains visible (at most once every 15 seconds). It stores the visitor ID in `localStorage` and the session ID in `sessionStorage`.

From a second terminal, post a page view (replace the example UUIDs and timestamp as needed):

```sh
$now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$body = @{ visitorId = '11111111-1111-4111-8111-111111111111'; sessionId = '22222222-2222-4222-8222-222222222222'; path = '/movies'; event = 'page_view'; timestamp = $now } | ConvertTo-Json -Compress
Invoke-WebRequest http://127.0.0.1:4321/api/analytics/track -Method Post -ContentType 'application/json' -Body $body
```

Expect HTTP `202`. A heartbeat uses the same payload with `"event":"heartbeat"`; it updates session activity but does not add a page-view row. The endpoint rejects invalid IDs, non-paths, stale/future timestamps, oversized bodies, and excluded paths. It returns `204` without writing when called as `POST /api/analytics/track?analytics_opt_out=1`.

In browser devtools, confirm that opening `/` or `/movies` creates a request to `/api/analytics/track`, then wait at least 15 seconds in a visible tab to observe a heartbeat. To test client opt-out, run `localStorage.setItem('analytics_opt_out', '1')`, reload, and confirm no new tracking request is sent. Also test `http://127.0.0.1:4321/?analytics_opt_out=1`; clear that local-storage key afterward if you want to resume local tracking.

## 10. Test the public homepage live count

The homepage (`src/pages/index.astro`) calls the public `GET /api/analytics/live` endpoint. The homepage Live now count is first-party presence: a distinct session with `last_seen_at` in the last **45 seconds**, refreshed every 15 seconds. GA4 remains available for reporting but does not control this presence count. The browser receives only the aggregate count.

1. Open the homepage in one visible browser tab and confirm the browser sends its `page_view`.
2. Open or refresh `http://127.0.0.1:4321/` and confirm the live-count UI is populated rather than showing its unavailable state.
3. Query the endpoint directly: `curl.exe -i http://127.0.0.1:4321/api/analytics/live`.
4. Close the tab or stop sending heartbeats, wait more than 45 seconds, and refresh; the session should no longer count as live.

### 10.1 Optional GA4 Realtime setup

The GA4 path is server-side only. Obtain the numeric GA4 Property ID for the property using your existing measurement ID, enable the Google Analytics Data API in Google Cloud, and grant a service account Viewer access to the GA4 property. Then set these Worker secrets interactively; never commit their values or paste them into source files:

```powershell
npx wrangler secret put GA4_PROPERTY_ID
npx wrangler secret put GA4_CLIENT_EMAIL
npx wrangler secret put GA4_PRIVATE_KEY
```

`GA4_PRIVATE_KEY` is the service-account private key in PEM form. The public response contains only `available`, `liveVisitors`, `source`, and `generatedAt`. If any GA4 secret is absent, or Google returns an error, the endpoint uses D1 without affecting homepage rendering.

## 11. Test the protected dashboard summary

Open `http://127.0.0.1:4321/admin/analytics`. Enter the value from local `.dev.vars`; the page sends it only as `x-analytics-admin-secret` to `GET /api/analytics/summary`. Confirm that the dashboard loads aggregate metrics and that an incorrect secret returns HTTP `401`.

The summary definitions are:

- **Live sessions:** distinct sessions seen in the last 45 seconds for the homepage presence counter.
- **Visitors (24h):** distinct visitors found in page views or sessions during the rolling last 24 hours.
- **Total visitors:** rows in `analytics_visitors` (all retained visitor aggregates).
- **Page views (24h):** page-view rows in the rolling last 24 hours.
- **Retained page views:** all currently retained rows in `analytics_page_views`.

The response also includes hourly activity, top paths, source breakdown, and social sources. It contains aggregates only; visitor IDs are not returned.

## 12. Test the authenticated cleanup endpoint

Cleanup is `POST /api/analytics/cleanup` with the same header. It deletes at most 1,000 page views older than **90 days** and at most 1,000 sessions older than **180 days** per request; it preserves `analytics_visitors` aggregates.

```sh
curl.exe -i -X POST http://127.0.0.1:4321/api/analytics/cleanup -H "x-analytics-admin-secret: <local-secret>"
```

Expect HTTP `200` with `{"available":true,"cleaned":true}` when the local D1 binding is present. Missing or incorrect authentication returns `401`; missing or failing D1 returns `503`. Never place the secret in the command history, a URL, or a committed script.

## 13. Set the production secret without exposing its value

After choosing the production value privately, set it through Wrangler's secret prompt. Do not put the value in a shell command, source file, log, ticket, or this guide:

```sh
npx wrangler secret put ANALYTICS_ADMIN_SECRET
```

When prompted, paste the value directly into Wrangler. Verify only that the command completed; do not echo or print the secret. The secret is for the website Worker configured by the root `wrangler.json`.

## 14. Apply the production D1 migration and deploy

Follow this production checklist in order. You already created the database and configured the secret, so verify those rather than creating or replacing them again.

### 14.1 Verify the binding and code agree

Complete Step 3: root `wrangler.json` must use `freemoviesuggestion_analytics`, your existing database ID, database name `freemoviesuggestion-analytics`, and `migrations_dir: "migrations"`. All four analytics routes and test mocks must use the same binding property.

### 14.2 Verify your account and existing secret

```sh
npx wrangler whoami
npx wrangler secret list --config wrangler.json
```

Confirm `ANALYTICS_ADMIN_SECRET` is listed for the website Worker. The list shows names, not values. Only if it is absent, run the interactive command in Step 13. A local `.dev.vars` secret does not configure the production secret.

### 14.3 Check remote migrations and tables

```sh
npx wrangler d1 migrations list freemoviesuggestion-analytics --remote --config wrangler.json
npx wrangler d1 execute freemoviesuggestion-analytics --remote --config wrangler.json --command="SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'analytics_%' ORDER BY name;"
```

Expect `analytics_visitors`, `analytics_sessions`, and `analytics_page_views`. Creating a D1 database alone does not create these tables. If migrations are pending, apply them:

```sh
npx wrangler d1 migrations apply freemoviesuggestion-analytics --remote --config wrangler.json
```

If all migrations are already applied and all three tables exist, skip the apply command. Do not delete or recreate the database.

### 14.4 Validate and build

```sh
npm ci
npm audit
npm test
npx astro check
npm run build
```

Stop if tests, typechecking, or the build fail. Review any audit findings before proceeding. Rebuild after changing bindings; do not deploy stale `dist/` output. Keep `.dev.vars`, `.env`, and generated secret-bearing files private; do not upload `dist/` as a public ZIP or static directory.

### 14.5 Deploy the website Worker

```sh
npx wrangler deploy --config wrangler.json
```

Use the website URL printed by Wrangler, or your custom domain if already routed to this Worker. Do not deploy `workers/wrangler.toml` as a replacement: that is the separate movie-sync Worker.

### 14.6 Verify production end-to-end

1. Open the production homepage with tracking opt-out disabled. In browser DevTools, confirm a `POST /api/analytics/track` request occurs.
2. Open `/api/analytics/live` on the same production host. Expect HTTP 200 with `available: true`, a numeric `liveVisitors`, and `generatedAt`. A count of zero is valid when there are no recent recorded sessions.
3. Keep the homepage visible and wait for the next 60-second refresh. The public widget should reflect sessions active in the last five minutes, not an exact count of human beings.
4. Open `/admin/analytics` and enter the production admin secret in the form, never the URL. Confirm aggregate metrics load; a wrong secret must not load them.
5. Confirm actual persistence, not just HTTP 202 (tracking deliberately returns 202 even if storage fails):

```sh
npx wrangler d1 execute freemoviesuggestion-analytics --remote --config wrangler.json --command="SELECT COUNT(*) AS page_views FROM analytics_page_views;"
```

6. If unavailable, inspect logs with `npx wrangler tail --config wrangler.json`. Check matching binding names, migration tables, and the production secret. Do not print secrets or visitor payloads to diagnose the issue.

The remote migration and deploy commands change production. They are not substitutes for the local testing steps above.

## 15. Optional scheduled cleanup

The current cleanup route is manual and best-effort. A cron entry alone is not enough: the deployed Worker must have a scheduled handler that invokes the same retention logic with its bound `ANALYTICS_DB` and must be reviewed and tested before enabling it. If implementing this option, add an explicit daily UTC trigger to the website Worker configuration, deploy the handler and migration together, and monitor the first runs. Keep manual `POST /api/analytics/cleanup` available as a fallback. Do not add a cron to `workers/wrangler.toml` expecting it to clean the website analytics database; that is a separate sync Worker.

## 16. Cloudflare/WAF rate limiting

The application has in-memory defense-in-depth limits in `src/pages/api/analytics/track.ts`: at most 120 accepted requests per 60-second isolate window, at most 30 events per visitor per window, and a one-second minimum visitor interval. These reset when an isolate is replaced and are not distributed. Add a Cloudflare WAF/Rate Limiting rule for `POST /api/analytics/track` in production, with a threshold appropriate to real traffic, and monitor false positives. Do not rely on raw IP logging; this implementation does not collect raw IP addresses.

## 17. Privacy behavior

The first-party implementation uses random UUIDs in local/session storage, stores page paths without query strings or fragments, records broad referrer/UTM categories, and does not use cookies or raw IP addresses for this analytics path. `/admin/*`, health endpoints, assets, crawler-like paths, and common static files are excluded. Users can opt out with `localStorage.setItem('analytics_opt_out', '1')` or the `analytics_opt_out=1` URL parameter. Keep `src/pages/privacy.astro` accurate if retention, providers, or consent behavior changes; Google Analytics and AdSense are separate providers with their own controls and notices.

## 18. Troubleshooting and rollback/safety

- **D1 unavailable / HTTP 503:** confirm both code and root `wrangler.json` use `freemoviesuggestion_analytics`, check the database ID, restart local dev after changing `.dev.vars`, and verify migrations with `--local` for local testing or `--remote` for production. Old code that still reads `ANALYTICS_DB` cannot access the renamed binding.
- **HTTP 401 on summary or cleanup:** send the exact local/production secret in the `x-analytics-admin-secret` header; do not use a query parameter.
- **No live count:** confirm a visible page has produced a page view or heartbeat, check browser network requests, and remember the 45-second presence window.
- **Migration says it is already applied:** list migrations before rerunning; do not edit an applied migration in place. Create a new numbered migration for schema changes.
- **Wrong account or wrong database:** stop before any remote write, run `npx wrangler whoami`, inspect `wrangler.json`, and re-authenticate if necessary.
- **Rollback:** preserve the last known-good Worker version and redeploy it using the normal Wrangler deployment history/workflow. Do not roll back by deleting D1 tables or reversing an applied migration blindly. For a bad schema change, write a forward corrective migration, test it with `--local`, then apply it remotely during a reviewed maintenance step.
- **Secret exposure:** do not print it or commit it. Rotate it immediately with `npx wrangler secret put ANALYTICS_ADMIN_SECRET`, then update only the private operators who need the new value.
