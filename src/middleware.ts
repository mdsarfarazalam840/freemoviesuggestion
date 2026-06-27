import { defineMiddleware } from 'astro:middleware';
import { env as cfEnv } from 'cloudflare:workers';

type EnvMap = Record<string, string | undefined>;
type ProcessShim = { env: Record<string, string> };

export const onRequest = defineMiddleware(async (_context, next) => {
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
    return await next();
  } catch (error) {
    console.error('[Middleware] Unhandled error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
});
