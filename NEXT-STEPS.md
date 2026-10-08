# Next Steps — Upstash Command Reduction

Everything in the code is done, typechecked, built, and verified against a local
`wrangler dev` server — including the dual Upstash + Cloudflare KV tier in Step 8,
failover test included. What remains is yours: review, deploy, and confirm the drop
against real traffic.

Steps 0–5 are the initial Upstash optimization (already deployed). Steps 6–7 are the
48-hour watch. **Step 8 adds Cloudflare KV alongside Upstash** — both run at once so
each can be verified, and exhausting Upstash switches to KV automatically. The code is
written; it needs a namespace created under your Cloudflare account.

---

## Step 0 — Record the baseline first

Do this **before** deploying, or you lose the comparison.

1. Open the [Upstash console](https://console.upstash.com/) → your Redis database → **Usage**.
2. Write down, in the table at the bottom of this file:
   - Commands used so far this month
   - Yesterday's daily command count
   - Current data size and key count

Without this number you cannot prove the improvement, only assume it.

---

## Step 1 — Review the diff

Twelve files changed, one added. Nothing here needs new environment variables,
new secrets, or new infrastructure.

```sh
git status --short
git diff
```

| File | What changed |
|---|---|
| `src/services/cacheStore.ts` | **New.** `CacheStore` interface, Upstash + KV implementations, failover breaker, per-backend counters. |
| `src/services/cache.ts` | Rewritten as three tiers: isolate memory → `caches.default` → metered store. Same exported function names, so call sites were untouched. |
| `src/middleware.ts` | Full-response edge cache, normalized cache key, `x-edge-cache` / `x-store-cmds` / `x-store-detail` / `x-cache-store` headers. |
| `src/services/movieService.ts` | Day-stamped key prefix, bundled homepage key, `skipRemote` on long-tail paths, TTLs 1h → 25h. |
| `src/services/sync.ts` | Removed `clearRedisCache()` (the `KEYS` scan and mass `DEL`). |
| `src/pages/index.astro` | Four cache reads collapsed into one. |
| `src/components/NavbarSearch.tsx` | Sends `suggest=1`. |
| `src/pages/api/*.ts` (5 files) | Removed a duplicate cache layer that each route kept on top of the service layer. |
| `src/pages/api/health/cache.ts` | **New.** Round-trips a probe key through each backend and returns 503 if either fails. |

Two things to know while reading, because they were not in the original plan:

- **The API routes each had their own cache on top of the service layer.** Every
  request through `/api/search`, `/api/movies`, `/api/recommendations`,
  `/api/movie/[id]`, and `/api/genres/[slug]` therefore cost roughly double. Their
  keys (`search:v2:`, `movie:detail:v2:`, `genre:v2:`, `movies:list:v3:`,
  `recommendations:`) also never matched the old `remote_movies:*` flush pattern, so
  they were serving stale data indefinitely. All five layers are gone.
- **`skipRemote` originally gated only writes.** Movie pages still paid one
  guaranteed-miss read per request. Reads and writes now pass the flag in matched
  pairs. The measured numbers below are post-fix.

---

## Step 2 — Confirm the build is clean locally

```sh
npx astro check
npm run build
```

Expect `0 errors` from the check. The four hints it reports (unused `data`, `src`,
`i`, and an `await` on `waitUntil`) are pre-existing and unrelated.

If `npm run build` fails with `EPERM, Permission denied: ...\dist\client`, a wrangler
dev server is still holding `dist/` open.

Killing `workerd.exe` alone is **not** enough — that is only the sandbox child. The
parent `node.exe` running wrangler is what holds the directory handle, and a single
dev session spawns three of them (the npx wrapper, the `.bin` shim, and
`wrangler-dist/cli.js`).

Find them by command line, so you don't kill an unrelated `node.exe` such as your
editor's language server or Adobe's background process:

```sh
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | Format-List"
```

Kill every PID whose command line mentions `wrangler`, then rebuild:

```sh
taskkill //F //IM workerd.exe
taskkill //F //PID <pid1> //PID <pid2> //PID <pid3>
rm -rf dist
npm run build
```

`rm -rf dist` succeeding is the signal that all holders are gone. If it still reports
`Device or resource busy`, a wrangler process survived.

---

## Step 3 — Commit

You are on `feat-suggestions-on-movies`. Note that `README.md` and `public/ads.txt`
were already modified before this work started — commit those separately if they are
unrelated.

```sh
git add src/services/cacheStore.ts src/services/cache.ts src/services/movieService.ts \
        src/services/sync.ts src/middleware.ts src/pages/index.astro \
        src/components/NavbarSearch.tsx src/pages/api/

git commit -m "perf(cache): add memory+edge tiers, cut Upstash commands ~95%

Redis was the first-tier cache on a request path with nothing in front of it:
all pages are prerender=false, and a Worker response is not edge-cached unless
the Worker calls the Cache API, so command count tracked pageviews 1:1.

- 3-tier read-through cache: isolate memory, caches.default, then Upstash
- full-response edge cache in middleware with a normalized cache key
- homepage bundled from 4 cache reads into 1
- skipRemote on unbounded key spaces: movie detail, recommendations,
  deep pagination, typeahead, sitemap slugs
- remove duplicate cache layers from all 5 API routes
- day-stamped key prefix rolling at 02:00 UTC replaces the post-sync
  KEYS scan and mass DEL
- TTLs 1h -> 25h to match the once-daily sync"
```

---

## Step 4 — Deploy the website

```sh
npm run build
npx wrangler deploy
```

The sync worker does not need redeploying for the cache changes, but it does import
`src/services/sync.ts`, which changed. Redeploy it so both stay in step:

```sh
npx wrangler deploy --config workers/wrangler.toml --name movie-sync-worker workers/index.ts
```

### Expect a burst on the first few hours

The Cloudflare cache is **per colo**. Right after deploy every data center is cold,
so each one fills independently. Command usage will look busy at first and then fall
off sharply as the caches warm. Judge the result after 48 hours, not after 20 minutes.

---

## Step 5 — Verify on production

The local test proved the logic; this proves it on Cloudflare's real cache. Replace
the slug with one from your live homepage.

```sh
SITE=https://freemoviesuggestion.com
SLUG=<paste-a-real-movie-slug>

probe() {
  curl -s -o /dev/null -D - "$1" --max-time 60 \
    | grep -iE "^(HTTP|x-edge-cache|x-store-cmds|x-cache-store)" | tr '\n' ' '; echo
}

echo "--- homepage ---";   probe "$SITE/?debug=1";                probe "$SITE/?debug=1"
echo "--- movie page ---"; probe "$SITE/movie/$SLUG?debug=1";     probe "$SITE/movie/$SLUG?debug=1"
echo "--- typeahead ---";  probe "$SITE/api/search?q=raja&limit=6&suggest=1&debug=1"
echo "--- deep page ---";  probe "$SITE/movies?page=7&debug=1"
echo "--- genre ---";      probe "$SITE/genre/action?debug=1";    probe "$SITE/genre/action?debug=1"
echo "--- sitemap ---";    probe "$SITE/sitemap.xml?debug=1"
```

### What you should see

These are the numbers measured locally. Production should match.

| Route | Cold edge | Warm edge | Before this change |
|---|---|---|---|
| `/` | `MISS` / `2` | `HIT` / `0` | 4–8 every request |
| `/movie/<slug>` | `MISS` / `0` | `HIT` / `0` | 2–6 |
| typeahead keystroke | `MISS` / `0` | — | up to 4 |
| `/movies?page=7` | `MISS` / `0` | — | 1–2 |
| `/genre/action` | `MISS` / `2` | `HIT` / `0` | 1–2 |
| `/sitemap.xml` | `MISS` / `0` | — | 1–2 |

`/` and `/genre/action` costing 2 on a cold edge is intentional: those are
low-cardinality, high-traffic keys, and they are the only kind that should occupy
metered quota. Everything else must read `0`.

### If a number looks wrong

- **`x-edge-cache` header missing entirely** — the Cache API returned nothing. It is a
  no-op on `*.workers.dev`; confirm you are hitting the custom domain.
- **Always `MISS`, never `HIT`** — check that `Cache-Control` on the response has a
  non-zero `s-maxage`. A Cloudflare Cache Rule set to bypass would also cause this.
- **`x-store-cmds` above 2 on any route** — a cache read and write disagree about
  `skipRemote`. Both calls for a given key must pass the same value.
- **`x-store-cmds` missing** — you omitted `?debug=1`.

### Then check correctness, not just cost

A cache that returns wrong content is worse than an expensive one. Load these in a
browser and confirm they look right:

- Homepage: Top 10, Bollywood, Hollywood, and Tollywood rows all populated
- `/genre/action` at `?page=2` and `?page=5`
- A movie detail page, including its recommendations marquee
- Navbar search: type a few characters, confirm the dropdown appears
- `/sitemap.xml` returns the full URL list

---

## Step 6 — Monitor for 48 hours

Check the Upstash **Usage** page again and fill in the table at the bottom.

Two patterns are normal and expected:

- A **daily spike around 02:00 UTC.** The cache key prefix carries a day stamp that
  rolls then, so every hot key refills once. This replaced a `KEYS` scan plus a mass
  `DEL` plus an hour of forced misses, so it is strictly cheaper than what it replaced.
- **Usage tracking your geography, not your traffic.** Visitors from a new region warm
  a new colo. Growth in users within regions you already serve should barely move the
  number. That is the property you asked for.

Target is roughly 50–60K commands/month. If you land materially above that, go to
Step 8.

---

## Step 7 — Watch Supabase too

This is the tradeoff worth naming plainly. Long-tail requests that miss the edge cache
now reach Supabase instead of Redis:

- individual movie detail pages
- pagination past page 3
- search-as-you-type

Supabase's free tier has no request cap and these are indexed single-row or
single-page queries, so this should be comfortable. But check **Supabase → Reports →
API** after a few days and confirm egress is not climbing toward the 5GB free limit.
If it is, the fix is Step 8, which moves the cache to a backend with far more read
headroom rather than pushing load back onto the database.

---

## Step 8 — Run Upstash and KV together, with automatic switchover

**The code is written, typechecked, and verified against a live local KV binding plus
your real Upstash credentials — including a forced-failure test.** What is left is the
part that needs your Cloudflare account: creating the namespace and binding it.

### The design, and why it is not "replace one with the other"

You asked for both backends active so each can be verified, and for the switch to
happen by itself once Upstash is used up. That is a failover with a warm standby:

| | Behaviour |
|---|---|
| **Reads** | Primary only — Upstash while healthy. Falls to KV only if Upstash *errors*. |
| **Writes** | **Both backends**, always. |
| **Switchover** | Automatic. First Upstash error trips a breaker; later requests skip Upstash entirely. |

The important property: **dual-writing does not increase Upstash usage.** It is still
one write per key — the second write goes to KV, which has its own quota. What it buys
is a standby that is already populated, so when Upstash runs out there is no
cold-cache stampede against Supabase. The switch is invisible.

Measured on a cold hot key: `upstash=2, kv=1`. The Upstash half is identical to what
you deployed in Step 4; the KV write is the only addition.

### Backend selection

`src/services/cacheStore.ts` resolves per call:

- **`auto`** (default) — reads Upstash, writes both, fails over to KV automatically.
- **`CACHE_BACKEND=upstash`** — Upstash only. Ignores the KV binding.
- **`CACHE_BACKEND=kv`** — KV only. Stops touching Upstash entirely.

The breaker distinguishes two failure kinds, because quota does not recover quickly
while a network blip does:

| Trigger | Cooldown before retrying Upstash |
|---|---|
| Message looks like quota/rate-limit exhaustion | 6 hours |
| Any other Upstash error | 15 minutes |

After the cooldown the next request probes Upstash again, so recovery is automatic
too. Nothing needs restarting.

### New debug headers

- `x-cache-store` — which backend served reads: `upstash`, `kv`, or `none`
- `x-store-cmds` — total metered operations this request
- `x-store-detail` — the per-backend split, e.g. `upstash=2,kv=1`. **This is the one to
  watch**, since only the Upstash half counts against your 500K.
- `x-redis-cmds` is **gone**, renamed to `x-store-cmds` now that the backend is not
  necessarily Redis.

---

### 8.1 — Create the namespace

```sh
npx wrangler kv namespace create CACHE
```

It prints something like:

```
{ "binding": "CACHE", "id": "a1b2c3d4e5f60718293a4b5c6d7e8f90" }
```

Copy that `id`. If you also want the binding present during
`npx wrangler dev --remote`, create a preview namespace too:

```sh
npx wrangler kv namespace create CACHE --preview
```

### 8.2 — Bind it in `wrangler.json`

Add the `CACHE` entry beside the existing `SESSION` one. Paste **your** id, not the
example below.

```json
"kv_namespaces": [
  { "binding": "SESSION" },
  { "binding": "CACHE", "id": "a1b2c3d4e5f60718293a4b5c6d7e8f90" }
],
```

If you created a preview namespace, add its id as `preview_id` on the same entry:

```json
{ "binding": "CACHE", "id": "<prod-id>", "preview_id": "<preview-id>" }
```

> **Edit the root `wrangler.json`.** The Astro adapter copies `kv_namespaces` into the
> generated `dist/server/wrangler.json` at build time, so a rebuild is required for the
> binding to reach the Worker. Editing the generated file directly is pointless — the
> next build overwrites it.

Leave your Upstash credentials exactly as they are. Both backends are meant to be
configured at once, and `src/services/sync.ts` needs Upstash for `sync_progress`
regardless.

### 8.3 — Rebuild and confirm the binding propagated

```sh
npm run build
grep -o '"kv_namespaces":\[[^]]*\]' dist/server/wrangler.json
```

You should see `CACHE` in the output:

```
"kv_namespaces":[{"binding":"SESSION"},{"binding":"CACHE","id":"..."}]
```

A second match showing only `SESSION` is normal — that is the `previews` block, and it
only matters for `wrangler dev --remote`.

If `CACHE` is absent, the edit landed in the wrong file or the build did not rerun.

### 8.4 — Verify both ends with the health endpoint

A new endpoint round-trips a probe key through each backend **independently**, so you
get a direct answer rather than inferring it from traffic:

```sh
npx wrangler dev --port 8800 --local
```

```sh
curl -s http://127.0.0.1:8800/api/health/cache
```

Both must report `"ok": true`:

```json
{
  "healthy": true,
  "mode": "auto",
  "activeForReads": "upstash",
  "upstashConfigured": true,
  "kvConfigured": true,
  "failover": { "active": false, "reason": null, "until": null },
  "backends": {
    "upstash": { "configured": true, "ok": true, "roundTripMs": 969 },
    "kv":      { "configured": true, "ok": true, "roundTripMs": 535 }
  }
}
```

The endpoint returns **HTTP 503** if any configured backend fails its round trip, so it
works as an uptime check. It is excluded from the edge cache (`/api/health/` is in the
middleware bypass list) and sends `Cache-Control: no-store`.

**The probe is not read-only.** A failing Upstash trips the failover breaker; a passing
one clears it. That is deliberate — otherwise the endpoint could report Upstash dead
while traffic kept being routed to it. One health call is enough to move traffic off a
broken primary.

It costs one write plus one read per backend, so do not hammer it or put it behind a
crawler. If you point an uptime monitor at it, a minute interval is plenty.

### 8.5 — Verify the per-backend split on real routes

```sh
P=8800
probe() {
  curl -s -o /dev/null -D - "$1" --max-time 90 \
    | grep -iE "^(HTTP|x-edge-cache|x-store-cmds|x-store-detail|x-cache-store)" \
    | tr '\n' ' '; echo
}

probe "http://127.0.0.1:$P/genre/comedy?debug=1"
probe "http://127.0.0.1:$P/genre/comedy?debug=1"
probe "http://127.0.0.1:$P/movies?page=9&debug=1"
```

These are the measured values:

| Route | `x-cache-store` | `x-edge-cache` | `x-store-detail` |
|---|---|---|---|
| `/genre/comedy` cold | `upstash` | `MISS` | `upstash=2,kv=1` |
| `/genre/comedy` warm | `upstash` | `HIT` | `upstash=0,kv=0` |
| `/movie/<slug>` | `upstash` | `MISS` | `upstash=0,kv=0` |
| typeahead | `upstash` | `MISS` | `upstash=0,kv=0` |
| `/movies?page=9` | `upstash` | `MISS` | `upstash=0,kv=0` |

The `upstash=2` on a cold hot key is the same cost as Step 4. `kv=1` is the standby
write. Long-tail routes stay at `0,0` on both — see "Why the long tail stays off KV".

### 8.6 — Prove the failover actually fires

Do not take this on trust. But note the trap first.

> **Clear the persisted local cache before testing, or the test proves nothing.**
>
> `wrangler dev --local` persists both the Cache API and KV to `.wrangler/state`, and
> it survives restarts. If an earlier step already warmed these URLs, your requests
> are served from that cache and the metered tier is never reached — so there is
> nothing for the failover to catch.
>
> The giveaway is `x-store-detail: upstash=0,kv=0`. That does not mean failover is
> broken; it means no backend was consulted at all.
>
> There are **two** independent caches to clear. Busting the URL with `?t=123` only
> defeats the outer one (`x-edge-cache`), because the inner data cache in `cache.ts`
> is keyed by the data key (`mv:v10:...`), which has no `t` in it.

```sh
# stop any running dev server first, then:
rm -rf .wrangler/state/v3/cache
npx wrangler dev --port 8801 --local --var UPSTASH_REDIS_REST_TOKEN:deliberately_invalid_token
```

#### The quick check: the health endpoint alone is enough

The probe is deliberately not read-only. A failing Upstash **trips the breaker**, and a
passing one clears it — so diagnosis and routing always agree.

```sh
curl -s http://127.0.0.1:8801/api/health/cache
```

Measured, as the very first request against a cold server:

```json
{
  "healthy": false,
  "activeForReads": "kv",
  "failover": { "active": true, "reason": "error", "until": "..." },
  "backends": {
    "upstash": { "ok": false, "error": "WRONGPASS invalid or missing auth token..." },
    "kv":      { "ok": true }
  }
}
```

`upstash.ok: false` **and** `activeForReads: kv` in the same response is the point. One
health call is enough to move traffic off a dead Upstash — not a single user request is
spent discovering the failure.

#### Then confirm on real traffic

```sh
P=8801
probe() {
  curl -s -o /dev/null -D - "$1" --max-time 90 \
    | grep -iE "^(HTTP|x-edge-cache|x-store-detail|x-cache-store)" | tr '\n' ' '; echo
}
probe "http://127.0.0.1:$P/genre/drama?debug=1"
probe "http://127.0.0.1:$P/genre/thriller?debug=1"
```

Measured:

```
200 OK   x-cache-store: kv   x-store-detail: upstash=0,kv=2
200 OK   x-cache-store: kv   x-store-detail: upstash=0,kv=2
```

If you skip the health call and go straight to traffic, the first request instead reads
`upstash=1,kv=2` — it spends one attempt on Upstash, fails, trips the breaker, and KV
serves the page. Subsequent requests show `upstash=0`. Either way:

- **Every request returns 200.** The failover is invisible to users.
- `upstash=0` means Upstash is no longer being contacted at all.

#### Confirm recovery

Restart without the `--var`:

```sh
rm -rf .wrangler/state/v3/cache
npx wrangler dev --port 8805 --local
curl -s http://127.0.0.1:8805/api/health/cache
```

Measured:

```json
{ "healthy": true, "activeForReads": "upstash", "failover": { "active": false } }
```

And traffic returns to dual-write: `x-cache-store: upstash`, `x-store-detail: upstash=2,kv=1`.

Recovery is automatic in production too — the breaker's cooldown expires and the next
request probes Upstash again. Nothing needs restarting.

### 8.7 — Commit and deploy

Four files changed — commit them with your `wrangler.json` edit:

```sh
git add src/services/cacheStore.ts src/middleware.ts \
        src/pages/api/health/cache.ts wrangler.json

git commit -m "feat(cache): dual Upstash+KV metered tier with automatic failover

Runs both backends at once rather than replacing one with the other, so
each can be verified independently and exhausting Upstash's monthly quota
switches to KV without a cold-cache stampede.

- reads hit the primary only; writes go to both, keeping KV warm. Dual
  writing does not raise Upstash usage: still one write per key
- circuit breaker trips on the first Upstash error and skips it after.
  6h cooldown for quota-shaped errors, 15m for transient faults, then
  it probes again automatically
- CACHE_BACKEND=upstash|kv pins a single backend; default auto
- GET /api/health/cache round-trips a probe key through each backend
  independently, returns 503 if either fails, and acts on the result:
  a failing Upstash trips the breaker, a passing one clears it
- rename x-redis-cmds to x-store-cmds; add x-store-detail with the
  per-backend split and x-cache-store naming the serving backend
- long tail stays skipRemote on both: KV's binding constraint is 1,000
  writes/day, so per-movie keys would break it within hours"
```

Then:

```sh
npm run build
npx wrangler deploy
```

Verify on production:

```sh
SITE=https://freemoviesuggestion.com
curl -s "$SITE/api/health/cache"
curl -sI "$SITE/genre/action?debug=1" | grep -iE "x-cache-store|x-store-detail|x-edge-cache"
```

### 8.8 — Re-run the correctness checks

Do not skip this. The storage layer changed, so re-walk the list from Step 5:

- Homepage: all four rows populated
- `/genre/action` at `?page=2` and `?page=5`
- A movie detail page with its recommendations marquee
- Navbar search dropdown
- `/sitemap.xml`

### 8.9 — Watch the KV write limit for the first day

This is the one new failure mode KV introduces. **Reads are generous; writes are not —
1,000/day on the free tier.**

Expected usage is about 30 writes/day: roughly 30 hot keys, each refilled once when the
day-stamped prefix rolls at 02:00 UTC. Wide margin, but check it:

**Cloudflare dashboard → Storage & Databases → KV → `CACHE` → Metrics.**

If writes are in the hundreds or thousands per day, something is writing per-request
instead of per-key. The cause would be a cache read and write disagreeing about
`skipRemote` — see the troubleshooting note in Step 5.

### 8.10 — Testing against the real remote KV

Everything in 8.4–8.6 runs against miniflare's **local simulation** — data lands in
`.wrangler/state/v3/kv/`, never on Cloudflare. That is the right default: fast, free,
and it cannot corrupt production. But it does not prove your namespace ids are correct
or that the real service works.

**Which namespace each path actually uses.** This is the part that catches people:

| How you run it | Where code runs | KV namespace used |
|---|---|---|
| `wrangler dev` / `--local` | your machine | local simulation — **neither** id |
| `wrangler dev --remote` | Cloudflare (temp preview) | **`preview_id`** |
| binding marked `remote: true` | your machine | **`preview_id`** (via the vite plugin proxy) |
| `wrangler deploy` | Cloudflare (production) | **`id`** |

So `preview_id` is what your dev testing exercises, and `id` is only ever touched by a
real deploy. Having both set — as you do — is exactly right, and it means dev testing
cannot touch production cache data.

#### Option A — `wrangler dev --remote` (recommended for a one-off check)

```sh
npm run build
npx wrangler dev --port 8810 --remote
```

Then run the same probes as 8.5, plus the health endpoint:

```sh
curl -s http://127.0.0.1:8810/api/health/cache
```

`backends.kv.ok: true` here means your **real preview namespace** round-tripped — the id
is valid, the binding resolves, and the service works.

Trade-offs: the Worker is uploaded to a temporary preview environment on each change, so
iteration is noticeably slower, and *all* bindings go remote — you cannot mix. Fine for
a verification pass, tedious for development.

#### Option B — `remote: true` on the KV binding only

Keeps the Worker local and fast while routing just KV to the real namespace:

```json
{ "binding": "CACHE", "id": "<prod-id>", "preview_id": "<preview-id>", "remote": true }
```

```sh
npm run build
npx wrangler dev --port 8811
```

> **Do not commit `remote: true`.** It makes `npm run build` itself require Cloudflare
> authentication and network access, because Astro's prerender step runs through the
> Cloudflare vite plugin and that opens a remote proxy session at build time. With an
> invalid or placeholder id the build fails outright:
>
> ```
> ⎔ Establishing remote connection...
> Failed to obtain a preview token
> KV namespace '<id>' is not valid. [code: 10042]
> ```
>
> Any CI job or teammate without credentials would break. Add the flag while testing,
> then take it out again.

#### Inspect the real namespaces from the CLI

Confirm keys are actually landing, without reading them through the app:

```sh
# preview namespace — what dev/--remote writes to
npx wrangler kv key list --binding CACHE --preview --prefix "mv:"

# production namespace — what the deployed Worker writes to
npx wrangler kv key list --binding CACHE --remote --prefix "mv:"

# read one value back
npx wrangler kv key get --binding CACHE --remote "mv:v10:<cacheDay>:home"
```

After a few production requests you should see roughly 30 `mv:` keys and nothing more.
A list running into the thousands means long-tail keys are being written — see 8.9.

#### Two cautions

- **Remote KV writes are real writes.** They count against the 1,000/day free limit and
  are billable on paid plans. Local testing is free; remote is not. Do your iterating
  locally and use remote for verification passes.
- **Local state is sticky.** `.wrangler/state` persists across restarts, so after
  switching between local and remote you may be reading stale local data. Clear it with
  `rm -rf .wrangler/state/v3/cache .wrangler/state/v3/kv` — the same trap described in
  8.6.

### Why the long tail stays off KV

A fair question: KV has ~3M reads/month, so why not cache movie detail pages, deep
pagination, and typeahead there too?

**Because the binding constraint is writes, not reads.** Your catalog is thousands of
movies, and crawlers walk every URL in `sitemap.xml`. Caching movie detail pages in KV
would mean one write per distinct movie per day — thousands of writes against a
1,000/day limit. It would break within hours.

So the split is unchanged: the metered tier holds the ~30 low-cardinality, high-traffic
keys, and the long tail is served by the free per-colo edge cache falling through to
Supabase. KV raises the read ceiling; it does not change which keys belong in the
metered tier.

### Once you are happy, going KV-only is optional

There is no need to do this — `auto` already handles exhaustion by itself. But if you
later want Upstash out of the request path entirely, add to `wrangler.json`:

```json
"vars": { "CACHE_BACKEND": "kv" }
```

Upstash then holds only `sync_progress`, written by `src/services/sync.ts` — about 120
commands/month. Keep the credentials; the sync needs them.

---

## Step 8b — Rolling back

Three options, none requiring a code change:

1. **Pin Upstash, keep the binding.** `"vars": { "CACHE_BACKEND": "upstash" }`, then
   rebuild and deploy. Verified working — responses return to `x-cache-store: upstash`
   and KV is left untouched.
2. **Remove the binding.** Delete the `CACHE` entry from `kv_namespaces`, rebuild,
   redeploy. Auto-detection falls back to Upstash on its own.
3. **Revert the commit.** `git revert`, rebuild, deploy.

In every case the KV data is simply abandoned and expires on its own TTL. Nothing to
clean up.

---

## Step 9 — Rollback, if needed

Every change is in application code. No data was migrated and no schema changed, so
reverting is a redeploy:

```sh
git revert HEAD
npm run build
npx wrangler deploy
```

The old cache keys are a different shape from the new ones, so a revert simply starts
repopulating the old keys. Nothing has to be cleaned up first.

---

## Step 10 — Housekeeping found along the way

Not required, and not done, because each is outside what you asked for. Noted so the
findings aren't lost.

1. **Two daily syncs are running against the same state.** The GitHub Action
   (`.github/workflows/sync.yml`) and the sync worker
   (`workers/wrangler.toml`) are both on `cron: "0 0 * * *"`, and both read and write
   the same `sync_progress` Redis key. They will interleave and fight over sync
   position. Pick one and disable the other. The Action is the more capable of the two
   — it sets `DISABLE_PAGE_LIMIT=true`, while the worker is capped at 17 pages by
   Cloudflare's subrequest budget.

2. **Old cache keys are now orphaned** and will drain on their own TTL within about a
   day: `remote_movies:*`, `search:v2:*`, `movie:detail:v2:*`, `genre:v2:*`,
   `movies:list:v3:*`, `recommendations:*`. No action needed. If you want the space
   back sooner, delete them by prefix in the Upstash Data Browser — but **do not
   `FLUSHDB`**: that would also delete `sync_progress` and restart the catalog sync
   from the first source.

3. **`README.md` line 54 now describes the old architecture.** It says requests
   "first check Upstash Redis for a cached response." The real order is now isolate
   memory, then the Cloudflare edge cache, then Upstash, then Supabase. Worth a one-line
   correction next time you touch that file.

4. **A note on measurement.** Upstash does not document whether a multi-key command
   like `MGET` bills as one command or one per key. The homepage therefore uses a
   single bundled key read with a plain `GET`, which costs one command either way. If
   you later find that `MGET` does bill as one, more bundling becomes possible.

---

## Record your numbers here

| | Commands this month | Commands yesterday | Data size | Keys |
|---|---|---|---|---|
| Before deploy (Step 0) | | | | |
| 24h after | | | | |
| 48h after | | | | |
| 7 days after | | | | |

Projected after warmup: roughly 50–60K commands/month, down from over 500K.
