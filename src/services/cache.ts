import { redis } from '../lib/redis';

const DEFAULT_TTL = 3600; // 1 hour

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    if (data == null) return null;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data) as T;
      } catch {
        return data as T;
      }
    }
    return data as T | null;
  } catch (error) {
    console.warn(`Cache read failed for ${key}:`, error);
    return null;
  }
}

export async function setCachedData(key: string, data: any, ttl: number = DEFAULT_TTL): Promise<void> {
  if (data == null) return;

  try {
    await redis.set(key, data, { ex: ttl });
  } catch (error) {
    console.warn(`Cache write failed for ${key}:`, error);
  }
}
