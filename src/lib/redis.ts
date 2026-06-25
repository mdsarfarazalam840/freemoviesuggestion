import { Redis } from '@upstash/redis/cloudflare';

function getRedis(): Redis {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
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
