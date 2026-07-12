# Suggested Movies — Region-Filtered Marquee

## Overview

Display **region-filtered** movie suggestions in a **slow-scrolling horizontal marquee** below the movie detail page. The marquee uses `framer-motion` `useAnimationFrame` for smooth, performant scrolling with hover slowdown and optional scroll-velocity awareness.

---

## Key Requirements

1. **Region filter**: Bollywood movie → show Bollywood suggestions. Hollywood → Hollywood. Tollywood → Tollywood.
2. **Marquee scroll**: Horizontal auto-scrolling, slow base velocity, slows on hover, repeats content seamlessly.
3. **Cards**: Compact poster-style cards with hover overlay (title + rating). Click navigates to `/movie/:slug`.

---

## Files Created

| File | Purpose |
|---|---|
| `src/lib/utils.ts` | `cn()` utility combining `clsx` + `tailwind-merge` |
| `src/components/SimpleMarquee.tsx` | Generic marquee component (framer-motion `useAnimationFrame`) |
| `src/components/SuggestedMoviesMarquee.tsx` | Wrapper component — heading + marquee + movie cards |

## Files Modified

| File | Change |
|---|---|
| `src/services/movieService.ts` | Added `getRegionFilteredRecommendations()` — filters by both genre **and** region |
| `src/pages/movie/[slug].astro` | Replaced grid with `<SuggestedMoviesMarquee client:load>` using region-filtered data |

---

## Data Flow

```
[slug].astro (SSR)
  │
  ├── getMovieBySlug(slug)        → movie object
  └── getRegionFilteredRecommendations(movie, 8)
        │
        ├── Queries Supabase:  .eq('region', movie.region) + genre match
        ├── Multi-genre fallback (tries each genre until 8 found)
        ├── Excludes current movie via seenIds Set
        ├── Cache: Upstash Redis (24h TTL)
        └── Fallback: local movies filtered by region + genre
              │
              ▼
        <SuggestedMoviesMarquee client:load>
              │
              ├── Heading: "More Bollywood Suggestions" (dynamic region)
              └── SimpleMarquee
                    ├── baseVelocity={4} (slow scroll)
                    ├── direction="left"
                    ├── slowdownOnHover (10% speed on hover)
                    ├── repeat={3} (seamless loop)
                    └── Movie cards (compact poster + hover overlay)
```

---

## Component: `SimpleMarquee` (`src/components/SimpleMarquee.tsx`)

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `ReactNode` | required | Content to scroll |
| `baseVelocity` | `number` | `5` | Pixels/sec (lower = slower) |
| `direction` | `"left"\|"right"\|"up"\|"down"` | `"right"` | Scroll direction |
| `slowdownOnHover` | `boolean` | `false` | Slow animation on hover |
| `slowDownFactor` | `number` | `0.3` | Speed multiplier when hovering |
| `slowDownSpringConfig` | `SpringOptions` | `{damping:50, stiffness:400}` | Spring for hover transition |
| `useScrollVelocity` | `boolean` | `false` | Speed influenced by page scroll |
| `scrollAwareDirection` | `boolean` | `false` | Reverse direction on scroll |
| `scrollSpringConfig` | `SpringOptions` | `{damping:50, stiffness:400}` | Spring for scroll velocity |
| `scrollContainer` | `RefObject` | — | Scroll container (default: window) |
| `repeat` | `number` | `3` | Duplicate children for seamless loop |
| `draggable` | `boolean` | `false` | Allow pointer drag |
| `grabCursor` | `boolean` | `false` | `cursor: grab` when draggable |
| `easing` | `function` | — | Custom easing function |
| `className` | `string` | — | Additional classes |

### Animation Mechanism

1. `useMotionValue(0)` tracks x/y position
2. `useAnimationFrame` increments position by `baseVelocity * delta / 1000`
3. `useTransform` wraps the value between `0` and `-100%` (seamless loop)
4. `repeat={3}` duplicates children so new items enter before old ones leave
5. Spring physics (`useSpring`) smooths hover slowdown and scroll velocity transitions

---

## Component: `SuggestedMoviesMarquee` (`src/components/SuggestedMoviesMarquee.tsx`)

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `movies` | `Movie[]` | required | Region-filtered suggestions |
| `region` | `string` | — | Region name for heading text |

### Structure

```
<section aria-label="Suggested ...">
  <div class="mx-auto max-w-7xl ...">
    <!-- Heading row -->
    <span class="h-8 w-1.5 bg-accent rounded-full" />
    <h2>More {region} Suggestions</h2>
    <p>Handpicked picks from the same region</p>
  </div>

  <div class="relative w-full overflow-hidden">
    <SimpleMarquee baseVelocity={4} direction="left" slowdownOnHover>
      {movies.map(movie => (
        <a href={`/movie/${movie.slug}`}>
          <!-- Poster card 140-180px wide, 2:3 aspect -->
          <img src={movie.thumbnail} />
          <!-- Hover overlay: gradient + title + rating -->
        </a>
      ))}
    </SimpleMarquee>
  </div>
</section>
```

### Card Design

| Element | Style |
|---|---|
| Width | `140px` (mobile) → `160px` → `180px` (desktop) |
| Poster | `aspect-[2/3]`, `object-cover`, `group-hover:scale-110` |
| Overlay | `bg-gradient-to-t from-black/80`, appears on hover |
| Title | White, truncated, `drop-shadow-md` |
| Rating | Gold star icon + number, white text |

---

## Backend: `getRegionFilteredRecommendations` (`src/services/movieService.ts`)

### Logic

```
for each genre in movie.genres:
  query Supabase movies table
    .eq('region', movie.region)
    .genre matches current genre
    .poster_path is not null
    .order('popularity', descending)
  exclude already-seen movies (tmdb_id/Set)
  collect up to limit (8)

if Supabase fails → fallback to localMovies filter:
  m.region === movie.region
  m.genres overlaps movie.genres
  exclude current movie
```

### Cache Key

`remote_movies:v6:region_recs:${movie.id}` — 24-hour TTL in Upstash Redis.

---

## Integration in `[slug].astro`

### Frontmatter

```ts
import SuggestedMoviesMarquee from '../../components/SuggestedMoviesMarquee.tsx';
import { getMovieBySlug, getRegionFilteredRecommendations } from '../../services/movieService';

let recommendations: any[] = [];
if (movie) {
  recommendations = await getRegionFilteredRecommendations(movie, 8);
}
```

### Template

```astro
{recommendations.length > 0 && (
  <SuggestedMoviesMarquee
    client:load
    movies={recommendations}
    region={movie.region}
  />
)}
```

`client:load` hydrates the component immediately — marquee animation needs JS.

---

## Visual Design

```
┌──────────────────────────────────────────────────────────────┐
│  │ More Bollywood Suggestions                               │
│  └ Handpicked picks from the same region                    │
│                                                             │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐          │
│  │Post │ │Post │ │Post │ │Post │ │Post │ │Post │ ←scrolls→ │
│  │  er │ │  er │ │  er │ │  er │ │  er │ │  er │          │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘          │
│            ──────── slow auto-scroll ───────→               │
└──────────────────────────────────────────────────────────────┘
```

- Section sits on `bg-canvas` (inherited)
- `mt-20` (80px) top margin from content above
- Cards use existing theme tokens: `bg-canvas-soft-2`, `border-hairline`, `rounded-premium`, `shadow-premium`
- Dark/light mode: fully inherited from CSS custom properties
- Text: `text-ink` headings, `text-mute` subtitles, accent gold for star

---

## Dependencies Added

| Package | Version | Purpose |
|---|---|---|
| `tailwind-merge` | latest | `cn()` utility for merging Tailwind classes |

---

## Edge Cases

| Case | Handling |
|---|---|
| No recommendations (0 results) | Component returns `null`, nothing rendered |
| Movie has no region | `getRegionFilteredRecommendations` returns `[]` |
| Movie has no genres | `getRegionFilteredRecommendations` returns `[]` |
| Supabase unavailable | Falls back to local movies filtered by region + genre |
| Only 1-2 similar movies | Marquee works with any count; `repeat={3}` ensures seamless scroll |
| Image load failure | Fallback SVG placeholder (dark rect + "No Image" text) |
| Slow connection | Images have `loading="lazy"` |

---

## Implementation Order

1. **Install tailwind-merge** (`npm install tailwind-merge`)
2. **Create `src/lib/utils.ts`** — `cn()` helper
3. **Create `src/components/SimpleMarquee.tsx`** — generic marquee from framer-motion
4. **Add `getRegionFilteredRecommendations`** in `movieService.ts`
5. **Create `src/components/SuggestedMoviesMarquee.tsx`** — wrapper with heading + cards
6. **Update `src/pages/movie/[slug].astro`** — replace grid with marquee
7. **Verify build** (`npm run build` or `npx astro build`)
