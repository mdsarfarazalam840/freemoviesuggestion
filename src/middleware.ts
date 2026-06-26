import { defineMiddleware } from 'astro:middleware';


export const onRequest = defineMiddleware(async (_context, next) => {
  // @ts-ignore - CF runtime env
  const cfEnv = _context.locals?.runtime?.env;
  if (cfEnv) {
    if (typeof globalThis.process === 'undefined') {
      // @ts-ignore
      globalThis.process = { env: {} };
    }
    for (const [key, value] of Object.entries(cfEnv)) {
      if (typeof value === 'string') {
        globalThis.process.env[key] = value;
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
