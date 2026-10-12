import type { APIRoute } from 'astro';
import { envFromLocals } from '../../../lib/analytics-env';
import {
  DAY_MS, FIVE_MINUTES_MS, HEARTBEAT_WRITE_INTERVAL_MS, isExcludedAnalyticsPath, MAX_TRACK_BODY_BYTES,
  normalizeTrafficSource, validateTrackPayload,
} from '../../../lib/analytics';

export const prerender = false;

type D1Like = { prepare(sql: string): { bind(...args: unknown[]): unknown }; batch(statements: unknown[]): Promise<unknown> };

export const INGEST_WINDOW_MS = 60_000;
export const INGEST_WINDOW_MAX_REQUESTS = 120;
export const VISITOR_MIN_EVENT_INTERVAL_MS = 1_000;
export const VISITOR_WINDOW_MAX_EVENTS = 30;
type RateState = { windowStart: number; windowCount: number; visitors: Map<string, { windowStart: number; count: number; lastAt: number }> };
const RATE_STATE_KEY = Symbol.for('freemoviesuggestion.analytics.rate-state');

function rateState(): RateState {
  const holder = globalThis as typeof globalThis & { [RATE_STATE_KEY]?: RateState };
  if (!holder[RATE_STATE_KEY]) holder[RATE_STATE_KEY] = { windowStart: 0, windowCount: 0, visitors: new Map() };
  return holder[RATE_STATE_KEY]!;
}

export function resetTrackRateLimits(): void {
  const state = rateState();
  state.windowStart = 0;
  state.windowCount = 0;
  state.visitors.clear();
}

function admit(visitorId: string, now: number): boolean {
  const state = rateState();
  if (now - state.windowStart >= INGEST_WINDOW_MS || now < state.windowStart) {
    state.windowStart = now;
    state.windowCount = 0;
    state.visitors.clear();
  }
  if (state.windowCount >= INGEST_WINDOW_MAX_REQUESTS) return false;
  const visitor = state.visitors.get(visitorId) ?? { windowStart: now, count: 0, lastAt: -Infinity };
  if (now - visitor.lastAt < VISITOR_MIN_EVENT_INTERVAL_MS) return false;
  if (now - visitor.windowStart >= INGEST_WINDOW_MS || now < visitor.windowStart) {
    visitor.windowStart = now;
    visitor.count = 0;
  }
  if (visitor.count >= VISITOR_WINDOW_MAX_EVENTS) return false;
  visitor.lastAt = now;
  visitor.count += 1;
  state.visitors.set(visitorId, visitor);
  state.windowCount += 1;
  return true;
}

function response(status: number, body?: Record<string, unknown>): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status, headers: body ? { 'content-type': 'application/json', 'cache-control': 'no-store' } : undefined,
  });
}

async function persist(payload: NonNullable<ReturnType<typeof validateTrackPayload>>, db: D1Like): Promise<void> {
  const source = normalizeTrafficSource(payload);
  const visitor = db.prepare(`INSERT INTO analytics_visitors (visitor_id, first_seen_at, last_seen_at, first_source, first_medium, first_referrer_domain)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(visitor_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`)
    .bind(payload.visitorId, payload.timestamp, payload.timestamp, source.source, source.medium, source.referrerDomain);
  const heartbeatCondition = payload.event === 'heartbeat' ? ' WHERE analytics_sessions.last_seen_at <= ?' : '';
  const session = db.prepare(`INSERT INTO analytics_sessions (session_id, visitor_id, started_at, last_seen_at, entry_path, last_path, source, medium, referrer_domain)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, last_path = excluded.last_path${heartbeatCondition}`)
    .bind(
      payload.sessionId, payload.visitorId, payload.timestamp, payload.timestamp, payload.path, payload.path,
      source.source, source.medium, source.referrerDomain,
      ...(payload.event === 'heartbeat' ? [payload.timestamp - HEARTBEAT_WRITE_INTERVAL_MS] : []),
    );
  const statements = [visitor, session];
  if (payload.event === 'page_view') {
    statements.push(db.prepare(`INSERT INTO analytics_page_views (visitor_id, session_id, path, source, medium, referrer_domain, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(payload.visitorId, payload.sessionId, payload.path, source.source, source.medium, source.referrerDomain, payload.timestamp));
  }
  await db.batch(statements);
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        size += value.byteLength;
        if (size > MAX_TRACK_BODY_BYTES) {
          void reader.cancel().catch(() => {});
          return null;
        }
        if (value.byteLength) chunks.push(value.slice());
      }
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleTrackRequest(request: Request, env?: { freemoviesuggestion_analytics?: D1Like }, now = Date.now()): Promise<Response> {
  if (request.method !== 'POST') return response(405, { error: 'method_not_allowed' });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return response(415, { error: 'json_required' });
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_TRACK_BODY_BYTES) return response(413, { error: 'payload_too_large' });
  const url = new URL(request.url);
  if (url.searchParams.get('analytics_opt_out') === '1') return response(204);
  let input: unknown;
  try {
    const body = await readBoundedBody(request);
    if (!body) return response(413, { error: 'payload_too_large' });
    input = JSON.parse(new TextDecoder().decode(body));
  } catch { return response(400, { error: 'invalid_json' }); }
  if (input && typeof input === 'object' && (input as Record<string, unknown>).analytics_opt_out === '1') return response(204);
  const payload = validateTrackPayload(input);
  if (!payload || isExcludedAnalyticsPath(payload.path)) return response(400, { error: 'invalid_payload' });
  if (payload.timestamp < now - DAY_MS || payload.timestamp > now + FIVE_MINUTES_MS) return response(400, { error: 'invalid_payload' });
  if (!admit(payload.visitorId, now)) return response(429, { error: 'rate_limited' });
  const db = env?.freemoviesuggestion_analytics;
  if (db) {
    try { await persist(payload, db); }
    catch { console.error('[analytics] storage unavailable'); }
  }
  return response(202, { accepted: true });
}

export const POST: APIRoute = async ({ request, locals }) => {
  return handleTrackRequest(request, await envFromLocals<{ freemoviesuggestion_analytics?: D1Like }>(locals));
};
