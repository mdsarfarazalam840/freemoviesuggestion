import type { APIRoute } from 'astro';
import { probeBackends } from '../../../services/cacheStore';

export const prerender = false;

/**
 * Round-trips a probe key through Upstash and KV independently and reports each.
 * Answers "are both backends working" directly instead of inferring it from traffic.
 *
 * Costs one write plus one read per configured backend, so it is deliberately kept
 * off the cached path — `/api/health/` is in the middleware's bypass list.
 */
export const GET: APIRoute = async () => {
  try {
    const result = await probeBackends();

    const backends = (result as any).backends ?? {};
    const configured = Object.values(backends).filter((b: any) => b?.configured);
    const healthy = configured.length > 0 && configured.every((b: any) => b.ok);

    return new Response(JSON.stringify({ healthy, ...result }, null, 2), {
      status: healthy ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[/api/health/cache] Error:', error);
    return new Response(
      JSON.stringify({ healthy: false, error: String((error as any)?.message ?? error) }, null, 2),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  }
};
