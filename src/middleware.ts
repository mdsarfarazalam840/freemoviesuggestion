import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';

import { getActiveStoreName, getCommandCounts } from './services/cacheStore';

type EnvMap = Record<string, string | undefined>;
type ProcessShim = { env: Record<string, string> };

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
  "img-src 'self' https://image.tmdb.org data: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'frame-ancestors https:',
  "base-uri 'self'",
  "form-action 'self'",
  "manifest-src 'self'",
].join('; ');

// 12h at the edge bounds how often a colo refills from the metered cache tier, which
// is what keeps Upstash command count tied to geography rather than traffic. The
// short browser max-age keeps client-side staleness low.
const DEFAULT_CACHE_CONTROL = 'public, max-age=300, s-maxage=43200, stale-while-revalidate=86400';

const CACHEABLE_CONTENT = /^(text\/html|application\/json|application\/xml|text\/xml)/i;

// Dropped from the cache key so marketing links and debug probes don't fragment it.
const IGNORED_PARAMS = /^(utm_[a-z_]*|fbclid|gclid|msclkid|mc_eid|igshid|ref|debug)$/i;

const UNCACHEABLE_PATHS = ['/api/health/'];

function getEdgeCache(): Cache | null {
  try {
    if (typeof caches === 'undefined') return null;
    return (caches as any).default ?? null;
  } catch {
    return null;
  }
}

/** Normalized GET request used as the edge cache key. */
function cacheKeyFor(request: Request): Request {
  const url = new URL(request.url);

  for (const key of [...url.searchParams.keys()]) {
    if (IGNORED_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.hash = '';

  return new Request(url.toString(), { method: 'GET' });
}

function isBypassed(pathname: string): boolean {
  return UNCACHEABLE_PATHS.some((prefix) => pathname.startsWith(prefix));
}

export const onRequest = defineMiddleware(async (context, next) => {
  (globalThis as any).__ENV = cfEnv;
  if (typeof (globalThis as any).process === 'undefined') {
    (globalThis as any).process = { env: {} };
  } else if (typeof (globalThis as any).process.env === 'undefined') {
    (globalThis as any).process.env = {};
  }
  for (const [key, value] of Object.entries(cfEnv as EnvMap)) {
    if (typeof value === 'string') {
      try {
        ((globalThis as any).process as ProcessShim).env[key] = value;
      } catch (e) {
      }
    }
  }

  // Lets cache.ts schedule writes without blocking the response. Astro 7 exposes the
  // ExecutionContext as `locals.cfContext`; the old `locals.runtime.ctx` is a getter
  // that now throws, so read defensively.
  let ctx: ExecutionContext | undefined;
  try {
    ctx = (context.locals as any)?.cfContext;
  } catch {
    ctx = undefined;
  }
  if (ctx) (globalThis as any).__CF_CTX = ctx;

  const url = new URL(context.request.url);
  const debug = url.searchParams.get('debug') === '1';
  const edgeCache = getEdgeCache();
  const cacheable =
    context.request.method === 'GET' && Boolean(edgeCache) && !isBypassed(url.pathname);

  const cacheKey = cacheable ? cacheKeyFor(context.request) : null;

  if (edgeCache && cacheKey) {
    try {
      const hit = await edgeCache.match(cacheKey);
      if (hit) {
        // Headers on a cached Response are immutable; re-wrap to annotate.
        const hitResponse = new Response(hit.body, hit);
        hitResponse.headers.set('x-edge-cache', 'HIT');
        if (debug) {
          hitResponse.headers.set('x-store-cmds', '0');
          hitResponse.headers.set('x-store-detail', 'upstash=0,kv=0');
          hitResponse.headers.set('x-cache-store', getActiveStoreName());
        }
        return hitResponse;
      }
    } catch {
      // A cache lookup failure must never fail the request.
    }
  }

  const commandsBefore = getCommandCounts();

  try {
    const response = await next();
    response.headers.set('Content-Security-Policy', CSP);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (
      context.request.method === 'GET' &&
      response.status === 200 &&
      !response.headers.has('Cache-Control')
    ) {
      response.headers.set('Cache-Control', DEFAULT_CACHE_CONTROL);
    }

    // Store before annotating with per-request debug headers, and only once
    // Cache-Control is set so the stored copy carries the right TTL.
    if (
      edgeCache &&
      cacheKey &&
      response.status === 200 &&
      !response.headers.has('Set-Cookie') &&
      CACHEABLE_CONTENT.test(response.headers.get('Content-Type') || '')
    ) {
      const toCache = response.clone();
      try {
        const put = edgeCache.put(cacheKey, toCache);
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(put);
        } else {
          void put.catch(() => {});
        }
      } catch {
        // Cache API failures are never fatal.
      }
    }

    if (cacheable) response.headers.set('x-edge-cache', 'MISS');
    if (debug) {
      const after = getCommandCounts();
      const upstash = after.upstash - commandsBefore.upstash;
      const kv = after.kv - commandsBefore.kv;
      response.headers.set('x-store-cmds', String(upstash + kv));
      response.headers.set('x-store-detail', `upstash=${upstash},kv=${kv}`);
      response.headers.set('x-cache-store', getActiveStoreName());
    }

    return response;
  } catch (error) {
    console.error('[Middleware] Unhandled error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
