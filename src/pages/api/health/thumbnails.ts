import type { APIRoute } from 'astro';
import { supabase } from '../../../lib/supabase';

export const prerender = false;

// Read-only health check: reports how many movie rows are missing a poster
// (empty/null poster_path OR thumbnail), broken down by region. Hit on demand
// after a sync to confirm the poster black-screen bug isn't reappearing.
export const GET: APIRoute = async () => {
  try {
    const emptyFilter = 'poster_path.is.null,poster_path.eq.,thumbnail.is.null,thumbnail.eq.';

    const [totalRes, emptyRes] = await Promise.all([
      supabase.from('movies').select('id', { count: 'exact', head: true }),
      supabase.from('movies').select('region').or(emptyFilter).limit(20000),
    ]);

    if (emptyRes.error) {
      console.error('[/api/health/thumbnails] query error:', emptyRes.error.message);
      return new Response(JSON.stringify({ error: emptyRes.error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const byRegion: Record<string, number> = {};
    for (const row of emptyRes.data ?? []) {
      const region = (row as { region?: string }).region || 'Unknown';
      byRegion[region] = (byRegion[region] ?? 0) + 1;
    }

    const emptyThumbnails = emptyRes.data?.length ?? 0;
    const total = totalRes.count ?? 0;

    return new Response(
      JSON.stringify({
        total,
        emptyThumbnails,
        healthyPercent: total > 0 ? Math.round(((total - emptyThumbnails) / total) * 1000) / 10 : 100,
        byRegion,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('[/api/health/thumbnails] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
