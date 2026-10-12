import type { APIRoute } from 'astro';
import { envFromLocals } from '../../../lib/analytics-env';
import type { AnalyticsD1 } from './summary';

export const prerender = false;

type LiveEnv = { freemoviesuggestion_analytics?: AnalyticsD1 };
type CountRow = { count: number };

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleLiveRequest(request: Request, env: LiveEnv = {}): Promise<Response> {
  if (request.method !== 'GET') return json(405, { available: false });

  const db = env.freemoviesuggestion_analytics;
  if (!db) return json(503, { available: false });

  const now = Date.now();
  try {
    const result = await db.prepare(
      'SELECT COUNT(DISTINCT session_id) AS count FROM analytics_sessions WHERE last_seen_at >= ? AND last_seen_at <= ?',
    ).bind(now - 5 * 60 * 1000, now).all<CountRow>();
    const row = result.results?.[0];
    if (!row || !Number.isFinite(Number(row.count))) return json(503, { available: false });
    return json(200, { available: true, liveVisitors: Number(row.count), generatedAt: now });
  } catch {
    return json(503, { available: false });
  }
}

export const GET: APIRoute = async ({ request, locals }) =>
  handleLiveRequest(request, await envFromLocals<LiveEnv>(locals));
