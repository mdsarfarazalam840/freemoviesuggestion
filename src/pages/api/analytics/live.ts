import type { APIRoute } from 'astro';
import { envFromLocals } from '../../../lib/analytics-env';
import { createGa4RealtimeClient, type Ga4Config } from '../../../lib/ga4';
import type { AnalyticsD1 } from './summary';

export const prerender = false;

type Ga4Client = { getActiveUsers(config: Ga4Config): Promise<number | null> };
type LiveEnv = {
  freemoviesuggestion_analytics?: AnalyticsD1;
  GA4_PROPERTY_ID?: string;
  GA4_CLIENT_EMAIL?: string;
  GA4_PRIVATE_KEY?: string;
  ga4?: Ga4Client;
};
type CountRow = { count: number };

export const LIVE_PRESENCE_WINDOW_MS = 45_000;
const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleLiveRequest(request: Request, env: LiveEnv = {}): Promise<Response> {
  if (request.method !== 'GET') return json(405, { available: false });

  const now = Date.now();
  const ga4Config: Ga4Config = {
    propertyId: env.GA4_PROPERTY_ID ?? '',
    clientEmail: env.GA4_CLIENT_EMAIL ?? '',
    privateKey: env.GA4_PRIVATE_KEY ?? '',
  };
  const db = env.freemoviesuggestion_analytics;
  if (db) {
    try {
      const result = await db.prepare(
        'SELECT COUNT(DISTINCT visitor_id) AS count FROM analytics_sessions WHERE last_seen_at >= ? AND last_seen_at <= ?',
      ).bind(now - LIVE_PRESENCE_WINDOW_MS, now).all<CountRow>();
      const row = result.results?.[0];
      if (row && Number.isFinite(Number(row.count))) {
        return json(200, { available: true, liveVisitors: Number(row.count), source: 'd1', generatedAt: now });
      }
    } catch {
      // Continue to the GA4 fallback when D1 is unavailable.
    }
  }

  const ga4Configured = Boolean(ga4Config.propertyId && ga4Config.clientEmail && ga4Config.privateKey);
  if (env.ga4 || ga4Configured) {
    try {
      const ga4 = env.ga4 ?? createGa4RealtimeClient();
      const activeUsers = await ga4.getActiveUsers(ga4Config);
      if (activeUsers !== null) {
        return json(200, { available: true, liveVisitors: activeUsers, source: 'google-analytics', generatedAt: now });
      }
    } catch {
      // Continue to the unavailable response when both sources fail closed.
    }
    console.warn(JSON.stringify({ message: 'ga4_realtime_unavailable' }));
  }

  return json(503, { available: false });
}

export const GET: APIRoute = async ({ request, locals }) =>
  handleLiveRequest(request, await envFromLocals<LiveEnv>(locals));
