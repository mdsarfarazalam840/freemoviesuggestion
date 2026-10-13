import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, test } from 'node:test';

const {
  FIVE_MINUTES_MS,
  DAY_MS,
  HEARTBEAT_WRITE_INTERVAL_MS,
  getAnalyticsCutoff,
  isExcludedAnalyticsPath,
  isWithinAnalyticsWindow,
  normalizeTrafficSource,
  normalizeAnalyticsPath,
  validateTrackPayload,
} = await import('../src/lib/analytics');
const { handleTrackRequest, resetTrackRateLimits, INGEST_WINDOW_MAX_REQUESTS, VISITOR_WINDOW_MAX_EVENTS } = await import('../src/pages/api/analytics/track');
const { GET: summaryGET, handleSummaryRequest } = await import('../src/pages/api/analytics/summary');
const { handleLiveRequest, LIVE_PRESENCE_WINDOW_MS } = await import('../src/pages/api/analytics/live');
const { POST: cleanupPOST, handleCleanupRequest } = await import('../src/pages/api/analytics/cleanup');
const { POST: trackPOST } = await import('../src/pages/api/analytics/track');

beforeEach(() => resetTrackRateLimits());

const valid = {
  visitorId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  path: '/movies',
  event: 'page_view',
  timestamp: Date.now(),
};

test('validates and bounds the public payload without accepting extra data', () => {
  const payload = validateTrackPayload({ ...valid, path: `/${'a'.repeat(400)}`, title: 'secret' });
  assert.ok(payload);
  assert.equal(payload.path.length, 256);
  assert.equal('title' in payload, false);
  assert.equal(validateTrackPayload({ ...valid, visitorId: 'bad-id' }), null);
  assert.equal(validateTrackPayload({ ...valid, sessionId: '' }), null);
  assert.equal(validateTrackPayload({ ...valid, path: 'not-a-path' }), null);
  assert.equal(validateTrackPayload('not an object'), null);
  assert.equal(normalizeAnalyticsPath('/search?q=secret#fragment'), '/search');
  assert.equal(validateTrackPayload({ ...valid, path: '/search?q=secret#fragment' })?.path, '/search');
});

test('normalizes direct, search, social, referral, and UTM traffic', () => {
  assert.deepEqual(normalizeTrafficSource({}), { source: 'direct', medium: 'none', referrerDomain: null });
  assert.deepEqual(normalizeTrafficSource({ referrer: 'https://www.google.com/search?q=movie' }), {
    source: 'google', medium: 'organic', referrerDomain: 'google.com',
  });
  assert.deepEqual(normalizeTrafficSource({ referrer: 'https://m.facebook.com/story/1' }), {
    source: 'facebook', medium: 'social', referrerDomain: 'm.facebook.com',
  });
  assert.deepEqual(normalizeTrafficSource({ referrer: 'https://partner.example/path' }), {
    source: 'partner.example', medium: 'referral', referrerDomain: 'partner.example',
  });
  assert.deepEqual(normalizeTrafficSource({ referrer: 'https://google.com', utmSource: 'Newsletter', utmMedium: 'Email' }), {
    source: 'newsletter', medium: 'email', referrerDomain: 'google.com',
  });
  assert.deepEqual(normalizeTrafficSource({ referrer: 'javascript:alert(1)' }), {
    source: 'direct', medium: 'none', referrerDomain: null,
  });
  assert.equal(normalizeTrafficSource({ referrer: 'https://evilfacebook.com/path' }).source, 'evilfacebook.com');
  assert.equal(normalizeTrafficSource({ referrer: 'https://evilgoogle.example/path' }).source, 'evilgoogle.example');
  assert.equal(normalizeTrafficSource({ referrer: 'https://news.facebook.com/path' }).source, 'facebook');
  for (const domain of ['google.example', 'google.com.evil.test', 'facebook.com.evil.test', 'evil.google.example']) {
    assert.equal(normalizeTrafficSource({ referrer: `https://${domain}/` }).medium, 'referral');
  }
  assert.equal(normalizeTrafficSource({ referrer: 'https://news.google.co.uk/' }).source, 'google');
});

test('excludes health, admin, assets, and crawler paths', () => {
  for (const path of ['/api/health/cache', '/admin/analytics', '/_astro/app.js', '/favicon.ico', '/robots.txt', '/sitemap.xml']) {
    assert.equal(isExcludedAnalyticsPath(path), true, path);
  }
  assert.equal(isExcludedAnalyticsPath('/movies'), false);
  assert.equal(isExcludedAnalyticsPath('/favicon.ico#fragment?secret'), true);
  assert.equal(isExcludedAnalyticsPath('/movies?bot=secret'), false);
});

test('calculates five-minute and rolling-day windows', () => {
  const now = 1_700_000_000_000;
  assert.equal(getAnalyticsCutoff(now, FIVE_MINUTES_MS), now - FIVE_MINUTES_MS);
  assert.equal(isWithinAnalyticsWindow(now - FIVE_MINUTES_MS, now, FIVE_MINUTES_MS), true);
  assert.equal(isWithinAnalyticsWindow(now - FIVE_MINUTES_MS - 1, now, FIVE_MINUTES_MS), false);
  assert.equal(getAnalyticsCutoff(now, DAY_MS), now - DAY_MS);
});

test('rejects opt-out and oversized request bodies and accepts absent D1', async () => {
  const optOut = await handleTrackRequest(new Request('https://example.test/api/analytics/track?analytics_opt_out=1', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid),
  }));
  assert.equal(optOut.status, 204);
  const oversized = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '20000' }, body: JSON.stringify(valid),
  }));
  assert.equal(oversized.status, 413);
  const accepted = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid),
  }));
  assert.equal(accepted.status, 202);
  const oversizedStream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_BODY + 1)); controller.close(); },
  });
  const streamed = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: oversizedStream, duplex: 'half',
  } as RequestInit & { duplex: 'half' }));
  assert.equal(streamed.status, 413);
});

const MAX_BODY = 16 * 1024;

test('strips query and fragment before persistence and enforces endpoint timestamp window', async () => {
  const binds: unknown[][] = [];
  const db = {
    prepare(_sql: string) { return { bind: (...args: unknown[]) => { binds.push(args); return {}; } }; },
    batch: async (_batch: unknown[]) => {},
  };
  const response = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...valid, path: '/search?q=secret#fragment', timestamp: Date.now() }),
  }), { freemoviesuggestion_analytics: db });
  assert.equal(response.status, 202);
  assert.equal(binds.some((args) => args.includes('/search')), true);
  assert.equal(binds.some((args) => args.some((value) => typeof value === 'string' && value.includes('secret'))), false);
  for (const timestamp of [Date.now() - DAY_MS - 10_000, Date.now() + FIVE_MINUTES_MS + 10_000]) {
    const rejected = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, timestamp }),
    }));
    assert.equal(rejected.status, 400);
  }
});

test('uses prepared D1 batch and only writes page views for page_view events', async () => {
  const statements: string[] = [];
  const batches: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      return { bind: (..._args: unknown[]) => ({}) };
    },
    batch: async (batch: unknown[]) => { batches.push(batch); },
  };
  const response = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid),
  }), { freemoviesuggestion_analytics: db });
  assert.equal(response.status, 202);
  assert.equal(statements.length, 3);
  assert.equal(batches[0].length, 3);
  statements.length = 0;
  const heartbeatNow = Date.now() + 1_000;
  await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, event: 'heartbeat', timestamp: heartbeatNow }),
  }), { freemoviesuggestion_analytics: db }, heartbeatNow);
  assert.equal(statements.length, 2);
  assert.equal(batches[1].length, 2);
});

test('throttles heartbeat session updates with a prepared last-seen cutoff', async () => {
  const heartbeatTimestamp = Date.now();
  const statements: string[] = [];
  const binds: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      return { bind: (...args: unknown[]) => { binds.push(args); return {}; } };
    },
    batch: async (_batch: unknown[]) => {},
  };
  const response = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...valid, event: 'heartbeat', timestamp: heartbeatTimestamp }),
  }), { freemoviesuggestion_analytics: db });
  assert.equal(response.status, 202);
  const sessionIndex = statements.findIndex((sql) => sql.includes('INSERT INTO analytics_sessions'));
  assert.notEqual(sessionIndex, -1);
  assert.match(statements[sessionIndex], /WHERE analytics_sessions\.last_seen_at <= \?/);
  assert.equal(binds[sessionIndex].at(-1), heartbeatTimestamp - HEARTBEAT_WRITE_INTERVAL_MS);
});

function fakeD1(rowsByPrefix: Array<{ match: string; rows: unknown[] }>, fail = false) {
  const sqls: string[] = [];
  const db = {
    sqls,
    prepare(sql: string) {
      sqls.push(sql);
      const statement = {
        bind(..._args: unknown[]) { return statement; },
        async all<T>() {
          if (fail) throw new Error('D1 unavailable');
          if (sql.includes('GROUP BY bucket')) return { results: [{ bucket: 0, visitors: 1, pageViews: 2 }, { bucket: 24, visitors: 99, pageViews: 99 }] as T[] };
          if (sql.includes('GROUP BY source')) return { results: [{ source: 'facebook', medium: 'social', referrerDomain: 'facebook.com', count: 3 }, { source: 'direct', medium: 'none', referrerDomain: null, count: 1 }] as T[] };
          if (sql.includes('GROUP BY path')) return { results: [{ path: '/movies', count: 4 }] as T[] };
          return { results: rowsByPrefix.find((entry) => sql.includes(entry.match))?.rows as T[] ?? [] };
        },
      };
      return statement;
    },
    async batch(_statements: unknown[]) { if (fail) throw new Error('D1 unavailable'); },
  };
  return db;
}

test('protects summary, returns bounded aggregate metrics, and classifies social sources', async () => {
  const db = fakeD1([
    { match: 'COUNT(DISTINCT session_id)', rows: [{ count: 2 }] },
     { match: 'SELECT visitor_id FROM analytics_page_views', rows: [{ count: 3 }] },
    { match: 'COUNT(*) AS count FROM analytics_visitors', rows: [{ count: 8 }] },
    { match: 'COUNT(*) AS count FROM analytics_page_views WHERE', rows: [{ count: 12 }] },
    { match: 'COUNT(*) AS count FROM analytics_page_views', rows: [{ count: 20 }] },
    { match: 'GROUP BY bucket', rows: [{ bucket: 0, visitors: 1, pageViews: 2 }, { bucket: 24, visitors: 99, pageViews: 99 }] },
    { match: 'SELECT path', rows: [{ path: '/movies', count: 4 }] },
    { match: 'SELECT source', rows: [{ source: 'facebook', medium: 'social', referrerDomain: 'facebook.com', count: 3 }, { source: 'direct', medium: 'none', referrerDomain: null, count: 1 }] },
  ]);
  const missing = await handleSummaryRequest(new Request('https://example.test/api/analytics/summary'), { ANALYTICS_ADMIN_SECRET: 'secret', freemoviesuggestion_analytics: db });
  assert.equal(missing.status, 401);
  const response = await handleSummaryRequest(new Request('https://example.test/api/analytics/summary', { headers: { 'x-analytics-admin-secret': 'secret' } }), { ANALYTICS_ADMIN_SECRET: 'secret', freemoviesuggestion_analytics: db });
  assert.equal(response.status, 200);
  const body = await response.json() as any;
  assert.deepEqual(body.hourly, [{ hour: 0, visitors: 1, pageViews: 2 }]);
  assert.equal(body.socialSources[0].source, 'facebook');
  assert.equal(body.topPaths[0].path, '/movies');
  assert.equal(JSON.stringify(body).includes('visitor_id'), false);
  const visitorSql = db.sqls.find((sql) => sql.includes('active_visitors')) ?? '';
  assert.match(visitorSql, /analytics_page_views/);
  assert.match(visitorSql, /analytics_sessions/);
  assert.match(visitorSql, /UNION/);
  assert.equal(visitorSql.includes('COUNT(DISTINCT visitor_id)'), false);
});

test('serves the public live count without authentication or raw identifiers', async () => {
  const db = fakeD1([{ match: 'COUNT(DISTINCT visitor_id)', rows: [{ count: 4 }] }]);
  const response = await handleLiveRequest(new Request('https://example.test/api/analytics/live'), { freemoviesuggestion_analytics: db });
  assert.equal(response.status, 200);
  const payload = await response.json() as any;
  assert.equal(payload.available, true);
  assert.equal(payload.liveVisitors, 4);
  assert.equal(typeof payload.generatedAt, 'number');
  assert.deepEqual(Object.keys(payload).sort(), ['available', 'generatedAt', 'liveVisitors', 'source']);
  assert.equal(payload.source, 'd1');
  const body = JSON.stringify(payload);
  assert.equal(body.includes('session_id'), false);
  assert.equal(body.includes('visitor_id'), false);
  assert.match(db.sqls[0], /COUNT\(DISTINCT visitor_id\)/);
  assert.match(db.sqls[0], /last_seen_at >= \?/);
});

test('uses a short first-party presence window for the live count', async () => {
  const binds: unknown[][] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        bind(...args: unknown[]) { binds.push(args); return statement; },
        async all<T>() { return { results: [{ count: 1 }] as T[] }; },
      };
      assert.match(sql, /last_seen_at >= \?/);
      return statement;
    },
  };
  const before = Date.now();
  await handleLiveRequest(new Request('https://example.test/api/analytics/live'), { freemoviesuggestion_analytics: db });
  const after = Date.now();
  assert.equal(LIVE_PRESENCE_WINDOW_MS, 45_000);
  assert.ok(Number(binds[0][0]) >= before - LIVE_PRESENCE_WINDOW_MS);
  assert.ok(Number(binds[0][0]) <= after - LIVE_PRESENCE_WINDOW_MS);
});

test('prefers the D1 presence count even when GA4 is configured', async () => {
  const db = fakeD1([{ match: 'COUNT(DISTINCT visitor_id)', rows: [{ count: 4 }] }]);
  const response = await handleLiveRequest(new Request('https://example.test/api/analytics/live'), {
    freemoviesuggestion_analytics: db,
    ga4: { async getActiveUsers() { return 189; } },
  });
  const payload = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(payload.liveVisitors, 4);
  assert.equal(payload.source, 'd1');
});

test('falls back to GA4 when D1 is unavailable', async () => {
  const response = await handleLiveRequest(new Request('https://example.test/api/analytics/live'), {
    ga4: { async getActiveUsers() { return 189; } },
  });
  const payload = await response.json() as any;
  assert.equal(response.status, 200);
  assert.equal(payload.liveVisitors, 189);
  assert.equal(payload.source, 'google-analytics');
});

test('returns unavailable for missing or failing live-count D1', async () => {
  const missing = await handleLiveRequest(new Request('https://example.test/api/analytics/live'));
  assert.equal(missing.status, 503);
  assert.deepEqual(await missing.json(), { available: false });
  const failed = await handleLiveRequest(new Request('https://example.test/api/analytics/live'), { freemoviesuggestion_analytics: fakeD1([], true) });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { available: false });
});

test('keeps the homepage live widget non-blocking and refreshes only while visible', async () => {
  const source = await readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');
  assert.match(source, /fetch\('\/api\/analytics\/live'/);
  assert.match(source, /setTimeout\(\(\) => \{ void fetchLiveVisitors\(\); \}, LIVE_REFRESH_MS\)/);
  assert.match(source, /clearTimeout\(liveRefresh\)/);
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.match(source, /liveWidget\.hidden = true/);
  assert.match(source, /Number\.isFinite\(data\.liveVisitors\)/);
  assert.match(source, /people live now/);
  assert.match(source, /const LIVE_REFRESH_MS = 15_000/);
  assert.match(source, /finally \{/);
  assert.match(source, /scheduleLiveRefresh\(\);/);
  assert.match(source, /handleLiveVisibilityChange/);
  assert.match(source, /if \(document\.visibilityState === 'visible'\) \{\s+void fetchLiveVisitors\(\);/);
});

test('builds dashboard metrics with textContent instead of response-derived innerHTML', async () => {
  const source = await readFile(new URL('../src/pages/admin/analytics.astro', import.meta.url), 'utf8');
  assert.equal(source.includes('metricsOutput.innerHTML'), false);
  assert.match(source, /createElement\(['"]article['"]\)/);
  assert.match(source, /number\.textContent = String\(value\)/);
});

test('returns unavailable for missing or failing D1 and protects cleanup retention SQL', async () => {
  const noDb = await handleSummaryRequest(new Request('https://example.test/api/analytics/summary', { headers: { 'x-analytics-admin-secret': 'secret' } }), { ANALYTICS_ADMIN_SECRET: 'secret' });
  assert.equal(noDb.status, 503);
  const failed = await handleSummaryRequest(new Request('https://example.test/api/analytics/summary', { headers: { 'x-analytics-admin-secret': 'secret' } }), { ANALYTICS_ADMIN_SECRET: 'secret', freemoviesuggestion_analytics: fakeD1([], true) });
  assert.equal(failed.status, 503);
  const denied = await handleCleanupRequest(new Request('https://example.test/api/analytics/cleanup', { method: 'POST' }), { ANALYTICS_ADMIN_SECRET: 'secret', freemoviesuggestion_analytics: fakeD1([]) });
  assert.equal(denied.status, 401);
  const db = fakeD1([]);
  const cleaned = await handleCleanupRequest(new Request('https://example.test/api/analytics/cleanup', { method: 'POST', headers: { 'x-analytics-admin-secret': 'secret' } }), { ANALYTICS_ADMIN_SECRET: 'secret', freemoviesuggestion_analytics: db }, 1_800_000_000_000);
  assert.equal(cleaned.status, 200);
  assert.match(db.sqls[0], /analytics_page_views/);
  assert.match(db.sqls[0], /LIMIT 1000/);
  assert.match(db.sqls[1], /analytics_sessions/);
  assert.equal(db.sqls.some((sql) => sql.includes('analytics_visitors')), false);
});

test('guards throwing runtime.env getters and falls back safely for every route', async () => {
  const previousEnv = (globalThis as typeof globalThis & { __ENV?: unknown }).__ENV;
  (globalThis as typeof globalThis & { __ENV?: unknown }).__ENV = { ANALYTICS_ADMIN_SECRET: 'secret' };
  const locals = {
    cfContext: {},
    get runtime(): never { throw new Error('runtime env unavailable'); },
  };
  try {
    const trackResponse = await trackPOST({ request: new Request('https://example.test/api/analytics/track', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid),
    }), locals } as any);
    assert.equal(trackResponse.status, 202);
    const summaryResponse = await summaryGET({ request: new Request('https://example.test/api/analytics/summary', {
      headers: { 'x-analytics-admin-secret': 'secret' },
    }), locals } as any);
    assert.equal(summaryResponse.status, 503);
    const cleanupResponse = await cleanupPOST({ request: new Request('https://example.test/api/analytics/cleanup', {
      method: 'POST', headers: { 'x-analytics-admin-secret': 'secret' },
    }), locals } as any);
    assert.equal(cleanupResponse.status, 503);
  } finally {
    if (previousEnv === undefined) delete (globalThis as typeof globalThis & { __ENV?: unknown }).__ENV;
    else (globalThis as typeof globalThis & { __ENV?: unknown }).__ENV = previousEnv;
  }
  assert.equal((await summaryGET({ request: new Request('https://example.test/api/analytics/summary'), locals: {} } as any)).status, 401);
});

test('bounds ingest per visitor and resets on a new window', async () => {
  const start = Date.now();
  for (let index = 0; index < VISITOR_WINDOW_MAX_EVENTS; index += 1) {
    const now = start + index * 1_000;
    const response = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...valid, timestamp: now }),
    }), undefined, now);
    assert.equal(response.status, 202);
  }
  const limited = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, timestamp: start + 30_000 }),
  }), undefined, start + 30_000);
  assert.equal(limited.status, 429);
  const reset = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, timestamp: start + 60_000 }),
  }), undefined, start + 60_000);
  assert.equal(reset.status, 202);
});

test('caps total accepted ingest per isolate window before D1', async () => {
  const now = Date.now();
  for (let index = 0; index < INGEST_WINDOW_MAX_REQUESTS; index += 1) {
    const visitorId = `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
    const response = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...valid, visitorId, timestamp: now }),
    }), undefined, now);
    assert.equal(response.status, 202);
  }
  const blocked = await handleTrackRequest(new Request('https://example.test/api/analytics/track', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...valid, timestamp: now }),
  }), undefined, now);
  assert.equal(blocked.status, 429);
});
