import { redis } from '../lib/redis';

/**
 * The metered cache tier — the only tier in `cache.ts` that costs quota. Memory and
 * `caches.default` are free; this is not.
 *
 * Both backends run together rather than one replacing the other:
 *
 *   reads   primary only (Upstash while healthy), falling to KV if the primary errors
 *   writes  BOTH backends, so KV is always warm and failover costs nothing
 *
 * Dual-writing does not increase Upstash usage — it is still one write per key. What
 * it buys is a standby that is already populated, so when Upstash runs out of monthly
 * quota the switch to KV is seamless instead of a cold-cache stampede against Supabase.
 *
 *   kv       Workers KV   — ~3M reads/month, 1,000 writes/day on the free tier
 *   upstash  Upstash Redis — 500K commands/month shared across reads and writes
 *
 * Backend availability is resolved per call, not at module load, because Cloudflare
 * bindings only land on `globalThis.__ENV` once middleware has run (the same pattern
 * `src/lib/env.ts` uses).
 */
export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
}

export type StoreName = 'kv' | 'upstash' | 'none';

/** `auto` reads primary with failover and writes both. The others pin one backend. */
export type CacheMode = 'auto' | 'upstash' | 'kv';

// --- Operation counters -------------------------------------------------------

/**
 * Metered operations, counted per backend. Surfaced as the `x-store-cmds` and
 * `x-store-detail` debug headers so the cost of a route is measurable rather than
 * assumed, and so Upstash usage stays visible separately from KV usage.
 *
 * Isolates handle requests concurrently, so these are per-isolate running totals.
 * Middleware reports the delta across a request.
 */
const counters = { upstash: 0, kv: 0 };

export function getCommandCount(): number {
  return counters.upstash + counters.kv;
}

export function getCommandCounts(): { upstash: number; kv: number } {
  return { ...counters };
}

// --- Environment --------------------------------------------------------------

function envValue(name: string): string | undefined {
  try {
    const value = (globalThis as any).__ENV?.[name];
    if (typeof value === 'string') return value;
  } catch {
    // fall through
  }
  try {
    if (typeof process !== 'undefined' && process.env) return process.env[name];
  } catch {
    // fall through
  }
  return undefined;
}

export function getCacheMode(): CacheMode {
  const mode = envValue('CACHE_BACKEND');
  if (mode === 'upstash' || mode === 'kv') return mode;
  return 'auto';
}

// --- Workers KV ---------------------------------------------------------------

type KVLike = {
  get(key: string, options?: { type: 'json' }): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/** KV rejects an expirationTtl below this. */
const KV_MIN_TTL = 60;

function getKvBinding(): KVLike | null {
  try {
    const binding = (globalThis as any).__ENV?.CACHE;
    if (binding && typeof binding.get === 'function' && typeof binding.put === 'function') {
      return binding as KVLike;
    }
  } catch {
    // fall through
  }
  return null;
}

export function isKvConfigured(): boolean {
  return getKvBinding() !== null;
}

export const kvStore: CacheStore = {
  async get<T>(key: string): Promise<T | null> {
    const kv = getKvBinding();
    if (!kv) return null;

    counters.kv++;
    return ((await kv.get(key, { type: 'json' })) as T | null) ?? null;
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const kv = getKvBinding();
    if (!kv) return;

    counters.kv++;
    await kv.put(key, JSON.stringify(value), {
      expirationTtl: Math.max(KV_MIN_TTL, Math.floor(ttlSeconds)),
    });
  },
};

// --- Upstash Redis ------------------------------------------------------------

export function isUpstashConfigured(): boolean {
  return Boolean(envValue('UPSTASH_REDIS_REST_URL') && envValue('UPSTASH_REDIS_REST_TOKEN'));
}

export const upstashStore: CacheStore = {
  async get<T>(key: string): Promise<T | null> {
    counters.upstash++;
    const data = await redis.get(key);
    if (data == null) return null;

    // @upstash/redis deserializes JSON automatically, but a value written as a raw
    // string comes back as a string — mirror the old cache.ts handling.
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch {
        return data as T;
      }
    }
    return data as T;
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    counters.upstash++;
    await redis.set(key, value, { ex: ttlSeconds });
  },
};

// --- Failover ------------------------------------------------------------------

const QUOTA_COOLDOWN_MS = 6 * 60 * 60 * 1000; // quota is monthly; re-check every 6h
const ERROR_COOLDOWN_MS = 15 * 60 * 1000; // transient fault; re-check sooner

let failoverUntil = 0;
let failoverReason: string | null = null;

/**
 * Upstash signals an exhausted plan with a rate-limit style message rather than a
 * typed error, so match on the text. Anything unrecognised still trips the breaker,
 * just with the shorter cooldown — degrading to KV is safe either way, and a
 * persistently failing primary is a reason to switch regardless of cause.
 */
function looksLikeQuotaError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error).toLowerCase();
  return (
    message.includes('max requests limit') ||
    message.includes('max daily request') ||
    message.includes('max monthly request') ||
    message.includes('quota') ||
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('exceeded')
  );
}

function tripFailover(error: unknown): void {
  const quota = looksLikeQuotaError(error);
  failoverUntil = Date.now() + (quota ? QUOTA_COOLDOWN_MS : ERROR_COOLDOWN_MS);
  failoverReason = quota ? 'quota' : 'error';
  console.warn(
    `[cache] Upstash unavailable (${failoverReason}), serving from KV until ` +
      `${new Date(failoverUntil).toISOString()}:`,
    error,
  );
}

function isFailedOver(): boolean {
  if (failoverUntil === 0) return false;
  if (Date.now() >= failoverUntil) {
    // Cooldown elapsed — let the next call probe Upstash again.
    failoverUntil = 0;
    failoverReason = null;
    return false;
  }
  return true;
}

/** Test seam, and a manual reset if you clear a quota problem early. */
export function resetFailover(): void {
  failoverUntil = 0;
  failoverReason = null;
}

// --- Orchestration --------------------------------------------------------------

/** Which backend reads are currently being served from. */
export function getActiveStoreName(): StoreName {
  const mode = getCacheMode();

  if (mode === 'kv') return isKvConfigured() ? 'kv' : 'none';
  if (mode === 'upstash') return isUpstashConfigured() ? 'upstash' : 'none';

  // auto
  if (isUpstashConfigured() && !isFailedOver()) return 'upstash';
  if (isKvConfigured()) return 'kv';
  if (isUpstashConfigured()) return 'upstash'; // KV absent; retry Upstash anyway
  return 'none';
}

export type StoreDiagnostics = {
  mode: CacheMode;
  activeForReads: StoreName;
  upstashConfigured: boolean;
  kvConfigured: boolean;
  failover: { active: boolean; reason: string | null; until: string | null };
};

export function getStoreDiagnostics(): StoreDiagnostics {
  const active = isFailedOver();
  return {
    mode: getCacheMode(),
    activeForReads: getActiveStoreName(),
    upstashConfigured: isUpstashConfigured(),
    kvConfigured: isKvConfigured(),
    failover: {
      active,
      reason: failoverReason,
      until: active ? new Date(failoverUntil).toISOString() : null,
    },
  };
}

export const activeStore: CacheStore = {
  async get<T>(key: string): Promise<T | null> {
    const mode = getCacheMode();

    if (mode === 'kv') {
      try {
        return await kvStore.get<T>(key);
      } catch (error) {
        console.warn(`KV read failed for ${key}:`, error);
        return null;
      }
    }

    if (mode === 'upstash') {
      try {
        return await upstashStore.get<T>(key);
      } catch (error) {
        console.warn(`Upstash read failed for ${key}:`, error);
        return null;
      }
    }

    // auto: primary first, KV only if the primary actually fails.
    // A primary *miss* does not chain to KV — dual-writes keep them in step, so a
    // second lookup would cost an operation to learn the same thing.
    if (isUpstashConfigured() && !isFailedOver()) {
      try {
        return await upstashStore.get<T>(key);
      } catch (error) {
        tripFailover(error);
      }
    }

    if (isKvConfigured()) {
      try {
        return await kvStore.get<T>(key);
      } catch (error) {
        console.warn(`KV read failed for ${key}:`, error);
      }
    }

    return null;
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const mode = getCacheMode();

    if (mode === 'kv') {
      try {
        await kvStore.set(key, value, ttlSeconds);
      } catch (error) {
        console.warn(`KV write failed for ${key}:`, error);
      }
      return;
    }

    if (mode === 'upstash') {
      try {
        await upstashStore.set(key, value, ttlSeconds);
      } catch (error) {
        console.warn(`Upstash write failed for ${key}:`, error);
      }
      return;
    }

    // auto: write both, so the standby is never cold. Settled independently — one
    // backend being down must not stop the other from being written.
    const writes: Promise<unknown>[] = [];

    if (isUpstashConfigured() && !isFailedOver()) {
      writes.push(
        upstashStore.set(key, value, ttlSeconds).catch((error) => {
          tripFailover(error);
        }),
      );
    }

    if (isKvConfigured()) {
      writes.push(
        kvStore.set(key, value, ttlSeconds).catch((error) => {
          console.warn(`KV write failed for ${key}:`, error);
        }),
      );
    }

    await Promise.all(writes);
  },
};

/**
 * Round-trips a probe key through each configured backend independently. Used by
 * `/api/health/cache` to answer "are both ends actually working" without inferring it
 * from traffic. Costs one write plus one read per configured backend, so do not put
 * this on a cached or crawled path.
 *
 * The probe is not read-only: a failing Upstash trips the breaker, and a passing one
 * clears it. Otherwise the endpoint could report Upstash dead while traffic kept
 * being routed to it, which is both confusing and worse for users.
 */
export async function probeBackends(): Promise<Record<string, unknown>> {
  const probeKey = `cache:healthcheck:${getCacheMode()}`;
  const payload = { probe: true, at: new Date().toISOString() };

  async function probe(store: CacheStore, configured: boolean) {
    if (!configured) return { configured: false, ok: false, error: 'not configured' };

    const started = Date.now();
    try {
      await store.set(probeKey, payload, 60);
      const readBack = await store.get<typeof payload>(probeKey);
      return {
        configured: true,
        ok: readBack?.at === payload.at,
        roundTripMs: Date.now() - started,
        readBack: readBack ?? null,
      };
    } catch (error) {
      return {
        configured: true,
        ok: false,
        roundTripMs: Date.now() - started,
        error: String((error as any)?.message ?? error),
        rawError: error,
      };
    }
  }

  const upstashConfigured = isUpstashConfigured();
  const [upstash, kv] = await Promise.all([
    probe(upstashStore, upstashConfigured),
    probe(kvStore, isKvConfigured()),
  ]);

  // Act on what the probe just learned, so the diagnosis and the routing agree.
  if (upstashConfigured) {
    if (!upstash.ok) {
      tripFailover((upstash as any).rawError ?? (upstash as any).error);
    } else if (isFailedOver()) {
      console.info('[cache] Upstash probe passed; clearing failover early.');
      resetFailover();
    }
  }

  delete (upstash as any).rawError;

  return { ...getStoreDiagnostics(), backends: { upstash, kv } };
}
