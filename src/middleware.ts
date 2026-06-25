import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

export const onRequest = defineMiddleware(async (_context, next) => {
  if (env) {
    Object.assign(process.env, env);
  }
  return next();
});
