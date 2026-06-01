import { redis } from '../lib/redis';

const DEFAULT_TTL = 3600; // 1 hour

export async function getCachedData<T>(key: string): Promise<T | null> {
  const data = await redis.get(key);
  return data as T | null;
}

export async function setCachedData(key: string, data: any, ttl: number = DEFAULT_TTL): Promise<void> {
  await redis.set(key, JSON.stringify(data), { ex: ttl });
}
