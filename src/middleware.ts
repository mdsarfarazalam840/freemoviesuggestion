import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (_context, next) => {
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string') {
        process.env[key] = value;
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
