# SEO Plan: freemoviesuggestion.com

## Current SEO Health

| ✅ Strengths | ❌ Gaps |
|---|---|
| Custom dynamic XML sitemap (`/sitemap.xml`) | Same OG image on every page (always app icon) |
| `robots.txt` correctly configured | No `prev`/`next` rel tags on paginated pages |
| `<link rel="canonical">` on every page (global layout) | No `nofollow` on external OTT links |
| `Movie` + `AggregateRating` JSON-LD on movie pages | `maximum-scale=5` in viewport meta (accessibility flag) |
| `BreadcrumbList` schema on listing pages | No per-page OG images for movie detail pages |
| `FAQPage` schema on homepage | No `X-Robots-Tag` header for filtered/parameterized pages |
| `Open Graph` + `Twitter Card` on every page | No hreflang (single language, but no annotation) |
| `WebApplication` schema on all pages | No `WebSite` schema with `searchAction` |
| Semantic HTML, good heading structure | No analytics integration |
| PWA support (manifest, icons) | No `Organization` schema on about/contact |
| Security headers (CSP, X-Content-Type-Options, Referrer-Policy) | No `ItemList` schema on listing pages (carousel eligibility) |
| Mobile-responsive design | Occasional duplicate movie entries (e.g., Satluj appears twice) |

---

## Phase 1: Critical Technical Fixes (0–2 weeks)

### 1.1 Per-Movie OG Images (High Priority)

Movie detail pages use the generic `/web-app-manifest-512x512.png` as `og:image`. Replace with the TMDB movie poster to dramatically improve social share click-through rate.

**Action:** In `src/layouts/Layout.astro`, pass an `ogImage` prop. In `src/pages/movie/[slug].astro`, pass `ogImage={movie.poster_path}` (full TMDB URL).

### 1.2 Pagination `prev`/`next` rel Tags (High Priority)

Add `<link rel="prev">` and `<link rel="next">` to paginated pages: `/movies?page=N`, `/genre/[genre]?page=N`, `/region/[region]?page=N`, `/ott/[ott]?page=N`.

**Action:** Read current page number from URL params, conditionally render `<link rel="prev">` / `<link rel="next">` in the `<head>` of listing pages.

### 1.3 Nofollow External OTT Links (Medium Priority)

All links to Netflix, Prime Video, Disney+, Hotstar, JioCinema, Zee5 should have `rel="nofollow ugc"` to avoid leaking PageRank.

**Action:** Add `rel="nofollow ugc"` to OTT platform links in movie cards and movie detail pages.

### 1.4 Fix Viewport `maximum-scale` (Low Priority)

Change `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">` to remove `maximum-scale=5`. Google flags this as an accessibility issue.

**Action:** In `Layout.astro`, change to `content="width=device-width, initial-scale=1"`.

### 1.5 Deduplicate Movie Entries (Medium Priority)

The homepage currently shows two "Satluj" entries with different TMDB IDs. Investigate the data pipeline to prevent duplicate movies from appearing.

**Action:** Check TMDB import pipeline in `scripts/` and `src/services/` — add deduplication by movie title/slug before inserting into database.

---

## Phase 2: Content Strategy (2–6 weeks)

### 2.1 Target Long-Tail Keywords

Compete on specific, low-competition queries rather than generic "movie suggestions":

| Cluster | Target Keywords | Pages |
|---|---|---|
| Bollywood + Platform | "best bollywood movies on netflix 2026", "top bollywood movies on prime video" | Curated lists linking to region+OTT filtered views |
| Genre + Platform | "best sci-fi movies on prime video india", "top horror movies on netflix" | Genre+OTT landing pages (e.g., `/genre/sci-fi/ott/netflix`) |
| Mood / Occasion | "movies to watch with friends weekend", "romantic movies for date night" | Occasion-based editorial pages |
| Comparisons | "netflix vs prime video india 2026", "best ott platform for tamil movies" | Comparison articles with embedded suggestions |
| Listicles | "top 10 movies 2026", "best hollywood movies this month" | Yearly/monthly roundup pages |

### 2.2 Enrich Movie Detail Pages

Current movie pages are thin (poster, rating, genre, OTT link). Add:
- Cast & crew names (from TMDB `/movie/{id}/credits`)
- Runtime, release year, language
- "Similar Movies" section (use TMDB recommendations endpoint)
- "Where to Watch" with direct OTT links
- Trailer embed (from TMDB videos)
- User rating summary text

### 2.3 Create Pillar Pages

Evergreen content that attracts links and ranks for competitive terms:
- `/best-movies-2026` (update annually)
- `/top-rated-bollywood-movies-all-time`
- `/best-horror-movies-ever`
- `/movies-by-category` (comprehensive guide with internal links to all genres)

Each pillar page links to dynamic movie detail pages and vice versa.

---

## Phase 3: Google Search Console & Indexing (Week 1, ongoing)

- [ ] **Set up GSC** for `https://freemoviesuggestion.com`
- [ ] **Submit sitemap** (`/sitemap.xml`) in GSC
- [ ] **Check Coverage report** — fix any indexing errors, soft 404s, etc.
- [ ] **Request indexing** for homepage and key pages
- [ ] **Monitor Core Web Vitals** report
- [ ] **Set up domain property** in GSC (covers all subdomains/protocols)

---

## Phase 4: Core Web Vitals & Performance (2–4 weeks)

### 4.1 Image Optimization
- Serve all TMDB images as WebP (append `?format=webp` to TMDB URLs)
- Add explicit `width`/`height` attributes to movie posters to prevent CLS
- Reserve aspect ratio containers for lazy-loaded images
- Preload the largest movie poster on each page (LCP element)

### 4.2 Font Optimization
- Self-host Google Fonts (Inter Tight + Playfair Display) to eliminate render-blocking font requests
- Use `font-display: swap` (already likely — verify)
- Subset fonts for Latin-only usage

### 4.3 Caching
- Verify Cloudflare Workers cache hit ratio
- Add `Cache-Control` headers for API responses
- Cache movie data at the edge (consider using KV or CDN cache)

---

## Phase 5: Link Building & Authority (1–6 months)

### Low Effort
- Submit to movie directory/listing sites
- Create an embeddable badge/widget: "Powered by FreeMovieSuggestion" for movie bloggers
- Guest post on movie blogs about "how to find what to watch"
- Add site to relevant subreddits, forums, and communities

### Medium Effort
- Create shareable infographics (e.g., "Visual Guide to Bollywood Movies on Netflix 2026")
- Publish original data studies (e.g., "Most Searched Movies in India 2026 by Region")
- Build social presence on X/Twitter + Instagram with daily movie suggestions
- Get listed on "best movie recommendation sites" roundup posts

### High Effort
- Reach out to movie bloggers for reviews/mentions
- Build a quiz tool ("What Movie Should You Watch Tonight?") that drives embeds and backlinks
- Partner with movie-related YouTubers/Twitch streamers

---

## Phase 6: On-Page Refinements (Ongoing)

| Element | Current | Goal |
|---|---|---|
| **Title tags** | "Free Movie Suggestion \| Discover..." | "Free Movie Suggestion: Find What to Watch on Netflix, Prime & More" — keyword near front |
| **H1 usage** | One per page ✅ | Keep |
| **Internal linking** | Good on homepage | Add contextually relevant cross-links from enrichment sections |
| **Anchor text** | "View Details", "Browse All →" | Descriptive anchors: "Browse Bollywood Movies on Netflix" |
| **URL structure** | `/movie/obsession-1339713` | Consider removing TMDB ID: `/movie/obsession` (requires redirects) |
| **Alt text** | Movie title as alt | "Obsession (2026) Hollywood Movie Poster on FreeMovieSuggestion" |
| **Meta descriptions** | Present ✅ | Ensure unique per page, include target keyword, compelling CTA |

---

## Phase 7: Schema Markup Enhancements (2–3 weeks)

Already have: `Movie`, `BreadcrumbList`, `FAQPage`, `WebApplication`

Add:
- **`WebSite` schema** — with `potentialAction` for Sitelinks Search Box (`/search?q={search_term_string}`)
- **`Organization` schema** — on about/contact pages with logo, social profiles (X/Twitter, GitHub)
- **`ItemList` schema** — on genre/region/OTT listing pages (enables Google carousel results)
- **`Review` schema** — future feature if/when user reviews are added
- **`VideoObject` schema** — on movie pages that embed trailers

---

## Phase 8: Keyword Cannibalization Audit (Month 1)

Potential cannibalization issues:
1. `/movies?genre=Action` vs `/genre/action` — differentiate or pick one canonical
2. `/movies` with filter params vs individual category pages — ensure clear purpose distinction
3. Multiple "Satluj" entries — deduplicate in DB

Resolution: Choose canonical forms, add `noindex` to parameterized duplicates, or redirect thin variants to canonical pages.

---

## Quick Wins Checklist

- [ ] Set up Google Search Console
- [ ] Add per-movie OG images (use TMDB poster URL)
- [ ] Add `rel="nofollow ugc"` to all OTT platform links
- [ ] Add `prev`/`next` to paginated pages
- [ ] Fix viewport meta (remove `maximum-scale=5`)
- [ ] Deduplicate movie entries in database
- [ ] Add `WebSite` schema with search action
- [ ] Change `og:image` on movie pages to movie poster
- [ ] Add `ItemList` schema on genre/region/OTT pages

---

## Realistic Timeline

| Timeline | Milestone |
|---|---|
| **Week 1** | Fix technical issues, set up GSC, per-movie OG images |
| **Weeks 2–4** | Create 5 pillar/curated pages, long-tail content, performance fixes |
| **Month 2** | Start link building, social media presence, keyword cannibalization audit |
| **Month 3** | First rankings for long-tail terms (positions 5–10) |
| **Month 4–6** | Build domain authority, target medium-competition terms |
| **Month 6–12** | Compete for "movie suggestion" head terms |

---

## Key Insight

> **"Top of Google" for high-volume terms takes 6–18 months.** Your site competes with IMDb, Rotten Tomatoes, and Netflix's own site. Instead of chasing head terms immediately, **win on long-tail phrases** ("best bollywood movies on netflix 2026") within 1–3 months, then use that authority to climb to broader terms.

**Single highest-leverage action:** Make each movie page a destination (cast, trailer, similar movies, curated collections) rather than a thin poster + OTT link. Google rewards pages that engage users.
