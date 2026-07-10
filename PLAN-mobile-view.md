# Plan: Fix Mobile View Issues

## Problem Summary

The site has usability and layout issues on mobile screens (< 640px). Key problems: oversized text, cramped grid layouts, broken mobile menu animation, small touch targets, and spacing/padding inconsistencies.

---

## Issues Found by Page

### Homepage (`src/pages/index.astro`)

| Issue | Location | Description |
|---|---|---|
| **Hero text too large** | Hero section | `text-5xl` on mobile = 48px; should be smaller for viewport < 640px |
| **Section padding excessive** | All `py-24` sections | 96px top/bottom padding on mobile; should reduce to `py-16` or `py-12` on small screens |
| **"View Full Catalog" link hidden on mobile** | Top 10 section line 45 | `hidden sm:flex` — users on mobile can't navigate to catalog from here |
| **Region grid too tight** | Bollywood/Hollywood/Tollywood grids | `grid-cols-2 gap-8` on mobile with card content (title, genres, description, OTT badges) creates cramped cards |
| **Genre/OTT section cards** | Genres (line 129), OTT (line 149) | `p-8` padding on mobile takes too much space; should reduce to `p-4` or `p-6` on small screens |

### Navbar (`src/components/Navbar.astro`)

| Issue | Location | Description |
|---|---|---|
| **Mobile menu can't be animated** | `#mobile-menu` (line 99) | Uses `hidden` class (`display: none`) — CSS transitions don't work on `display`. Should use opacity/visibility or `max-height` for smooth open/close |
| **No keyboard accessibility** | Menu toggle JS (line 142-165) | No Escape key listener to close the menu; no focus trapping; no `aria-expanded` on toggle button |
| **Menu closes on scroll** | Menu toggle JS | Body `overflow: hidden` is set but scroll position isn't locked; disables scroll but doesn't prevent bounce on iOS |
| **Brand text visibility** | Logo (line 44) | Uses `hidden sm:block md:hidden lg:block` — the brand name disappears on medium screens but shows on mobile and desktop. Intentional but may confuse tablet users |
| **"Find Best Movie" CTA hidden on mobile** | Line 86 | `hidden sm:inline-flex` — the primary CTA button is not visible on mobile (only the hamburger menu shows) |
| **Search in mobile menu** | Line 104-119 | Search form is inside the mobile overlay but the autocomplete `NavbarSearch` component is NOT duplicated for mobile — mobile users get a plain form without autocomplete |

### Movies Catalog Page (`src/pages/movies/index.astro`)

| Issue | Location | Description |
|---|---|---|
| **Sidebar filters don't collapse on mobile** | Line 64-103 | Filter sidebar takes full width on mobile with no way to collapse it; pushes movie grid down |
| **Filter pills hard to tap** | Line 68-101 | `px-3 py-1.5` pills have ~36px touch target height; below the recommended 44px minimum |
| **Movie grid too tight** | Line 125 | `grid-cols-2 gap-6` with card content (3 lines of text + OTT badges) creates very tight cards |
| **Page title vs results count** | Line 109-117 | Title wraps awkwardly on mobile when filter is applied (e.g., "Sci-Fi Movies on Netflix") |

### Movie Detail Page (`src/pages/movie/[slug].astro`)

| Issue | Location | Description |
|---|---|---|
| **Poster too small on mobile** | Line 86 | `w-56` (224px) on mobile; poster could be wider to fill available space |
| **Hero min-height too large** | Line 76 | `min-h-[500px]` on mobile; might push content below the fold excessively |
| **Rating/genre layout** | Line 101-121 | `gap-8` between rating badge and genre pills creates wasted vertical space on mobile |
| **Movie title wraps poorly** | Line 100 | `text-5xl sm:text-7xl` on mobile for potentially long movie titles; no `hyphens` or `overflow-wrap` |

### Region / Genre / OTT Pages (`src/pages/region/[region].astro`, `genre/[genre].astro`, `ott/[ott].astro`)

| Issue | Location | Description |
|---|---|---|
| **Heading too large** | Region line 62, Genre line 66, OTT line 65 | `text-4xl` on mobile without responsive scaling |
| **Grid same as homepage** | All three pages | `grid-cols-2 gap-6` — same cramping issue as homepage |

### Pagination (`src/components/Pagination.astro`)

| Issue | Location | Description |
|---|---|---|
| **Page numbers overflow on mobile** | Line 66-79 | With many pages (e.g., 50+), the page number ellipsis + numbers can overflow the viewport width |
| **Touch targets too small** | Line 47 | `w-9 h-9` (36px) page number buttons are below 44px minimum touch target |

### Footer (`src/components/Footer.astro`)

| Issue | Location | Description |
|---|---|---|
| **2-column grid too cramped** | Line 9 | `grid-cols-2 gap-8` on mobile with 5 sections stacked in pairs — the Resources section wraps alone under the previous row, creating uneven layout |
| **Brand text overlap** | Line 21-25 | Brand description text `max-w-xs` might be too narrow on small screens |

### Search Page (`src/pages/search.astro`)

| Issue | Location | Description |
|---|---|---|
| **Search input icon overlap** | Line 40-57 | The search icon (`left-4`) and the search button (`right-2`) might overlap with input text on very small screens |
| **Grid same issue** | Line 63 | Same `grid-cols-2 gap-6` cramping as other pages |

---

## Fix Plan

### Priority 1: Mobile Menu UX Overhaul

**File: `src/components/Navbar.astro`**

- Replace `hidden` class with CSS-based visibility control (`opacity`, `pointer-events`, `visibility`, or `max-height`) to enable smooth transitions
- Add `aria-expanded`, `aria-controls` attributes to the toggle button
- Add Escape key listener to close the menu
- Add focus trapping inside the mobile menu when open
- Use `position: fixed` on the mobile menu with a backdrop overlay for better UX

### Priority 2: Responsive Typography and Spacing

**Files: All `.astro` pages**

- Add `max()` or `clamp()` utility classes for fluid typography on headings:
  - Hero title: `text-4xl sm:text-5xl lg:text-7xl` (reduce mobile from 48px to 36px)
  - Section headings: `text-2xl sm:text-3xl lg:text-4xl`
  - Movie title on detail page: `text-3xl sm:text-5xl lg:text-7xl`
- Reduce section padding on mobile: `py-16 sm:py-24` instead of `py-24`
  - Affected files: `index.astro` (lines 38, 59, 123, 143, 163, 187)
- Add `overflow-wrap: break-word` or `hyphens: auto` to movie title on detail page

### Priority 3: Movie Card Grid Improvements

**Files: All pages with movie grids**

- On mobile, consider switching to a single-column card layout with horizontal cards for region sections:
  - `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`
  - Or keep `grid-cols-2` but reduce content density (fewer displayed fields on mobile)
- Reduce `gap-8` to `gap-4 sm:gap-6` on mobile for region sections in `index.astro`
- Reduce `gap-6` to `gap-3 sm:gap-6` on catalog pages

### Priority 4: Collapsible Filters on Movies Page

**File: `src/pages/movies/index.astro`**

- Add a toggle button on mobile to show/hide the filter sidebar
- Wrap the sidebar content in a collapsible container with smooth animation
- Or move filters to a horizontal scroll row instead of a vertical list on mobile
- Increase touch target sizes: `px-4 py-2` minimum for filter pills

### Priority 5: Fix Movie Detail Page Mobile Layout

**File: `src/pages/movie/[slug].astro`**

- Reduce `min-h-[500px]` to `min-h-[350px] md:min-h-[650px]` on mobile
- Make poster width responsive: `w-48 sm:w-56 md:w-72`
- Reduce `gap-8` between rating and genres to `gap-4`
- Stack content vertically with less spacing

### Priority 6: Pagination Touch Targets

**File: `src/components/Pagination.astro`**

- Increase page number button size: `w-10 h-10` minimum (40px)
- On mobile with many pages, show "Prev" / "Next" with fewer page numbers
- Consider a "scroll to top" on page change for better UX

### Priority 7: Footer Responsive Layout

**File: `src/components/Footer.astro`**

- Keep `grid-cols-2` on mobile but ensure sections have enough width
- Consider switching to a single-column layout on very small screens
- Reduce `gap-8` to `gap-6`

### Priority 8: Search Page Refinements

**File: `src/pages/search.astro`**

- Fix potential input/icon overlap by adjusting padding on very small screens
- Consider adding `min-width: 0` to prevent flex overflow

### Priority 9: Global CSS Additions

**File: `src/styles/global.css`**

- Add utility classes for responsive font sizes using `clamp()`:
  ```css
  .text-fluid-hero { font-size: clamp(2rem, 5vw, 4.5rem); }
  .text-fluid-section { font-size: clamp(1.5rem, 3vw, 2.25rem); }
  ```
- Add a CSS custom property for responsive section padding:
  ```css
  --section-padding-y: clamp(3rem, 8vw, 6rem);
  ```

---

## Files to Modify

| File | Priority | Changes |
|---|---|---|
| `src/components/Navbar.astro` | **P1** | Replace `hidden` with animatable classes, add keyboard a11y, Escape key, focus trap |
| `index.astro` (homepage) | **P2** | Reduce `py-24` to `py-16 sm:py-24`, adjust hero text size, reduce grid gaps, show catalog link on mobile |
| `src/pages/movie/[slug].astro` | **P2, P5** | Reduce hero height, responsive poster width, fluid title font-size, reduce gaps |
| `src/pages/movies/index.astro` | **P4** | Add collapsible filters, larger touch targets |
| `src/pages/region/[region].astro` | **P2** | Responsive heading, reduce grid gap on mobile |
| `src/pages/genre/[genre].astro` | **P2** | Same as region page |
| `src/pages/ott/[ott].astro` | **P2** | Same as region page |
| `src/pages/search.astro` | **P2, P8** | Fix input/icon overlap, responsive grid |
| `src/components/Pagination.astro` | **P6** | Larger touch targets, mobile-optimized page numbers |
| `src/components/Footer.astro` | **P7** | Responsive grid columns, reduce gaps |
| `src/styles/global.css` | **P2, P9** | Add fluid typography utilities, responsive spacing variables |

---

## Testing Checklist

After fixing, verify on:

- [ ] **Mobile (375px width)** — iPhone SE / small Android
- [ ] **Mobile (414px width)** — iPhone 11 / larger phones
- [ ] **Tablet (768px)** — iPad portrait
- [ ] **Desktop (1280px+)** — ensure no regressions

Check specifically:

- [ ] Mobile menu opens/closes smoothly with animation
- [ ] Escape key closes mobile menu
- [ ] No horizontal scroll on any page
- [ ] Filter sidebar on `/movies` collapses on mobile
- [ ] All touch targets are ≥ 44px
- [ ] Movie cards show readable content on 2-column grid
- [ ] Movie detail page poster is full-width on mobile
- [ ] Pagination doesn't overflow on small screens
- [ ] Hero section fits in viewport without scrolling on load
