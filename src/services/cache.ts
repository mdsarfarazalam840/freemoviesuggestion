import { activeStore } from './cacheStore';

/**
 * Three-tier read-through cache.
 *
 *   tier 0  isolate memory   free, survives within a Worker isolate
 *   tier 1  caches.default   free and unmetered, per Cloudflare colo
 *   tier 2  activeStore      METERED (Upstash bills every command)
 *
 * Only tier 2 costs quota, so it must be reached as rarely as possible. Callers that
 * work on unbounded key spaces (individual movies, deep pagination, search-as-you-type)
 * should pass `skipRemote` and let tiers 0/1 plus Supabase carry them — otherwise key
 * cardinality, and therefore command count, grows with the catalog and with crawlers.
 */

const DEFAULT_TTL = 90_000; // 25h — just past the 02:00 UTC cache-day roll

// Memory is only a short-window dedupe inside one isolate; the edge and remote tiers
// own real freshness. Capping it keeps any staleness blast radius small.
const MEMORY_TTL = 300;
const MEMORY_MAX_ENTRIES = 200;

const EDGE_NAMESPACE = 'https://cache.local/v1/';

type MemoryEntry = { value: unknown; expiresAt: number };

const memory = new Map<string, MemoryEntry>();

export type CacheWriteOptions = {
  /**
   * Skip the metered tier entirely, for reads as well as writes. Use for unbounded
   * key spaces. Must be passed consistently: a key that is never written remotely
   * would otherwise cost one guaranteed-miss command on every read.
   */
  skipRemote?: boolean;
};

function now(): number {
  return Date.now();
}

function memoryGet<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt <= now()) {
    memory.delete(key);
    return undefined;
  }

  // Refresh insertion order so the hot set survives eviction.
  memory.delete(key);
  memory.set(key, entry);
  return entry.value as T;
}

function memorySet(key: string, value: unknown, ttlSeconds: number): void {
  if (memory.size >= MEMORY_MAX_ENTRIES && !memory.has(key)) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  memory.set(key, {
    value,
    expiresAt: now() + Math.min(ttlSeconds, MEMORY_TTL) * 1000,
  });
}

/**
 * Run a cache write without blocking the response. Uses the request context stashed
 * on globalThis by middleware — the same pattern already used for `__ENV`. The
 * context is per-isolate and shared across concurrent requests, so a stale one can
 * throw; a dropped cache write is harmless, so fall back to a floating promise.
 */
function background(promise: Promise<unknown>): void {
  try {
    const ctx = (globalThis as any).__CF_CTX;
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise);
      return;
    }
  } catch {
    // fall through
  }
  void promise.catch(() => {});
}

/** `caches.default` is absent in `astro dev`/node and a no-op on *.workers.dev. */
function getEdgeCache(): Cache | null {
  try {
    if (typeof caches === 'undefined') return null;
    return (caches as any).default ?? null;
  } catch {
    return null;
  }
}

function edgeRequest(key: string): Request {
  return new Request(EDGE_NAMESPACE + encodeURIComponent(key));
}

async function edgeGet<T>(key: string): Promise<T | undefined> {
  const cache = getEdgeCache();
  if (!cache) return undefined;

  try {
    const hit = await cache.match(edgeRequest(key));
    if (!hit) return undefined;
    return (await hit.json()) as T;
  } catch {
    return undefined;
  }
}

async function edgeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const cache = getEdgeCache();
  if (!cache) return;

  try {
    await cache.put(
      edgeRequest(key),
      new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${ttlSeconds}`,
        },
      }),
    );
  } catch {
    // Cache API failures are never fatal.
  }
}

export async function getCachedData<T>(
  key: string,
  options: CacheWriteOptions = {},
): Promise<T | null> {
  const fromMemory = memoryGet<T>(key);
  if (fromMemory !== undefined) return fromMemory;

  const fromEdge = await edgeGet<T>(key);
  if (fromEdge !== undefined) {
    memorySet(key, fromEdge, MEMORY_TTL);
    return fromEdge;
  }

  // Nothing is ever written to the metered tier under this key, so reading it would
  // be a guaranteed miss at the cost of a command.
  if (options.skipRemote) return null;

  try {
    const fromStore = await activeStore.get<T>(key);
    if (fromStore == null) return null;

    memorySet(key, fromStore, MEMORY_TTL);
    background(edgeSet(key, fromStore, DEFAULT_TTL));
    return fromStore;
  } catch (error) {
    console.warn(`Cache read failed for ${key}:`, error);
    return null;
  }
}

export async function setCachedData(
  key: string,
  data: any,
  ttl: number = DEFAULT_TTL,
  options: CacheWriteOptions = {},
): Promise<void> {
  if (data == null) return;

  memorySet(key, data, ttl);
  background(edgeSet(key, data, ttl));

  if (options.skipRemote) return;

  try {
    await activeStore.set(key, data, ttl);
  } catch (error) {
    console.warn(`Cache write failed for ${key}:`, error);
  }
}
