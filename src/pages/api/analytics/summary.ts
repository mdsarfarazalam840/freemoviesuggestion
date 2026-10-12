import type { APIRoute } from 'astro';
import { envFromLocals } from '../../../lib/analytics-env';

export const prerender = false;

type D1Result<T> = { results?: T[] };
type D1Statement = { bind(...args: unknown[]): D1Statement; all<T>(): Promise<D1Result<T>> };
export type AnalyticsD1 = { prepare(sql: string): D1Statement };
type SummaryEnv = { freemoviesuggestion_analytics?: AnalyticsD1; ANALYTICS_ADMIN_SECRET?: string };

type CountRow = { count: number };
type HourRow = { bucket: number; visitors: number; pageViews: number };
type PathRow = { path: string; count: number };
type SourceRow = { source: string; medium: string; referrerDomain: string | null; count: number };

const SOCIAL_SOURCES = new Set(['facebook', 'instagram', 'youtube', 'twitter', 'linkedin', 'reddit', 'whatsapp', 'telegram', 'pinterest', 'other-social']);
const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function isAnalyticsAdminAuthorized(request: Request, secret: string | undefined): boolean {
  const supplied = request.headers.get('x-analytics-admin-secret');
  return Boolean(secret && supplied && supplied === secret);
}

async function one<T>(db: AnalyticsD1, sql: string, ...args: unknown[]): Promise<T> {
  const result = await db.prepare(sql).bind(...args).all<T>();
  const row = result.results?.[0];
  if (!row) throw new Error('missing analytics aggregate');
  return row;
}

async function many<T>(db: AnalyticsD1, sql: string, ...args: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...args).all<T>();
  return result.results ?? [];
}

export async function handleSummaryRequest(request: Request, env: SummaryEnv = {}): Promise<Response> {
  if (request.method !== 'GET') return json(405, { error: 'method_not_allowed' });
  if (!isAnalyticsAdminAuthorized(request, env.ANALYTICS_ADMIN_SECRET)) return json(401, { error: 'unauthorized' });
  const db = env.freemoviesuggestion_analytics;
  if (!db) return json(503, { available: false, error: 'analytics_unavailable' });

  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  try {
    const [live, visitors24h, totalVisitors, pageViews24h, retainedPageViews, hourly, topPaths, sources] = await Promise.all([
      one<CountRow>(db, 'SELECT COUNT(DISTINCT session_id) AS count FROM analytics_sessions WHERE last_seen_at >= ? AND last_seen_at <= ?', fiveMinutesAgo, now),
       one<CountRow>(db, `SELECT COUNT(*) AS count FROM (
         SELECT visitor_id FROM analytics_page_views WHERE created_at >= ? AND created_at <= ?
         UNION
         SELECT visitor_id FROM analytics_sessions WHERE last_seen_at >= ? AND last_seen_at <= ?
       ) AS active_visitors`, dayAgo, now, dayAgo, now),
      one<CountRow>(db, 'SELECT COUNT(*) AS count FROM analytics_visitors'),
      one<CountRow>(db, 'SELECT COUNT(*) AS count FROM analytics_page_views WHERE created_at >= ? AND created_at <= ?', dayAgo, now),
      one<CountRow>(db, 'SELECT COUNT(*) AS count FROM analytics_page_views'),
      many<HourRow>(db, `SELECT CAST((created_at - ?) / 3600000 AS INTEGER) AS bucket,
        COUNT(DISTINCT visitor_id) AS visitors, COUNT(*) AS pageViews
        FROM analytics_page_views WHERE created_at >= ? AND created_at <= ?
        GROUP BY bucket ORDER BY bucket`, dayAgo, dayAgo, now),
      many<PathRow>(db, 'SELECT path, COUNT(*) AS count FROM analytics_page_views WHERE created_at >= ? AND created_at <= ? GROUP BY path ORDER BY count DESC, path ASC LIMIT 20', dayAgo, now),
      many<SourceRow>(db, 'SELECT source, medium, referrer_domain AS referrerDomain, COUNT(*) AS count FROM analytics_page_views WHERE created_at >= ? AND created_at <= ? GROUP BY source, medium, referrer_domain ORDER BY count DESC, source ASC LIMIT 50', dayAgo, now),
    ]);
    const sourceBreakdown = sources.map((row) => ({ source: row.source, medium: row.medium, referrerDomain: row.referrerDomain, count: row.count }));
    return json(200, {
      available: true,
      generatedAt: now,
      liveSessions: live.count,
      visitors24h: visitors24h.count,
      totalVisitors: totalVisitors.count,
      pageViews24h: pageViews24h.count,
      retainedPageViews: retainedPageViews.count,
      hourly: hourly.filter((row) => Number(row.bucket) >= 0 && Number(row.bucket) < 24).map((row) => ({ hour: Number(row.bucket), visitors: Number(row.visitors), pageViews: Number(row.pageViews) })),
      topPaths,
      sourceBreakdown,
      socialSources: sourceBreakdown.filter((row) => SOCIAL_SOURCES.has(row.source)),
    });
  } catch {
    return json(503, { available: false, error: 'analytics_unavailable' });
  }
}

export const GET: APIRoute = async ({ request, locals }) => handleSummaryRequest(request, await envFromLocals<SummaryEnv>(locals));
