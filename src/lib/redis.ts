import { Redis } from '@upstash/redis/cloudflare';

import { getServerEnv } from './env';

function getRedis(): Redis {
  const url = getServerEnv(['UPSTASH_REDIS_REST_URL']);
  const token = getServerEnv(['UPSTASH_REDIS_REST_TOKEN']);
  return new Redis({
    url,
    token,
  });
}

export const redis = new Proxy({} as Redis, {
  get(_target, prop, _receiver) {
    const client = getRedis();
    const value = Reflect.get(client, prop);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
