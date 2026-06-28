import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';

type EnvMap = Record<string, string | undefined>;
type ProcessShim = { env: Record<string, string> };

const CSP = [
  "default-src 'self'",
  'script-src https://fonts.googleapis.com https://fonts.gstatic.com',
  'img-src https://image.tmdb.org data: blob:',
  'font-src https://fonts.gstatic.com',
  'style-src https://fonts.googleapis.com',
  'frame-ancestors https:',
  'base-uri \'self\'',
  'form-action \'self\'',
  'manifest-src \'self\'',
].join('; ');

export const onRequest = defineMiddleware(async (context, next) => {
  (globalThis as any).__ENV = cfEnv;
  if (typeof (globalThis as any).process === 'undefined') {
    (globalThis as any).process = { env: {} };
  } else if (typeof (globalThis as any).process.env === 'undefined') {
    (globalThis as any).process.env = {};
  }
  for (const [key, value] of Object.entries(cfEnv as EnvMap)) {
    if (typeof value === 'string') {
      try {
        ((globalThis as any).process as ProcessShim).env[key] = value;
      } catch (e) {
      }
    }
  }
  try {
    const response = await next();
    response.headers.set('Content-Security-Policy', CSP);
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    return response;
  } catch (error) {
    console.error('[Middleware] Unhandled error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
