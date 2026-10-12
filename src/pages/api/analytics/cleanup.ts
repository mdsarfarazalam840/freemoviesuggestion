import type { APIRoute } from 'astro';
import { envFromLocals } from '../../../lib/analytics-env';

export const prerender = false;
const RAW_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const SESSION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
type D1Statement = { bind(...args: unknown[]): D1Statement };
type CleanupDb = { prepare(sql: string): D1Statement; batch(statements: D1Statement[]): Promise<unknown> };
type CleanupEnv = { freemoviesuggestion_analytics?: CleanupDb; ANALYTICS_ADMIN_SECRET?: string };
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers });

export async function handleCleanupRequest(request: Request, env: CleanupEnv = {}, now = Date.now()): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!env.ANALYTICS_ADMIN_SECRET || request.headers.get('x-analytics-admin-secret') !== env.ANALYTICS_ADMIN_SECRET) return json(401, { error: 'unauthorized' });
  if (!env.freemoviesuggestion_analytics) return json(503, { available: false, error: 'analytics_unavailable' });
  try {
    const cutoff = now - RAW_RETENTION_MS;
    const staleSessions = now - SESSION_RETENTION_MS;
    await env.freemoviesuggestion_analytics.batch([
      env.freemoviesuggestion_analytics.prepare('DELETE FROM analytics_page_views WHERE created_at < ? LIMIT 1000').bind(cutoff),
      env.freemoviesuggestion_analytics.prepare('DELETE FROM analytics_sessions WHERE last_seen_at < ? LIMIT 1000').bind(staleSessions),
    ]);
    return json(200, { available: true, cleaned: true });
  } catch {
    return json(503, { available: false, error: 'analytics_unavailable' });
  }
}

export const POST: APIRoute = async ({ request, locals }) => handleCleanupRequest(request, await envFromLocals<CleanupEnv>(locals));
