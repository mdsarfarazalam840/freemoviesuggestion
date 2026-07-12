import { Redis } from '@upstash/redis/cloudflare';

import { getServerEnv } from './env';

let client: Redis | null = null;
let clientKey = '';

export function getRedis(): Redis | null {
  const url = getServerEnv(['UPSTASH_REDIS_REST_URL']);
  const token = getServerEnv(['UPSTASH_REDIS_REST_TOKEN']);

  if (!url || !token) {
    return null;
  }

  const nextClientKey = `${url}:${token}`;
  if (!client || clientKey !== nextClientKey) {
    client = new Redis({
      url,
      token,
    });
    clientKey = nextClientKey;
  }

  return client;
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop, _receiver) {
    const client = getRedis();
    if (!client) {
      return async () => null;
    }
    const value = Reflect.get(client, prop);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
