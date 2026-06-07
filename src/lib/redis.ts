import { Redis } from '@upstash/redis';
import { getServerEnv } from './env';

const url = getServerEnv(['UPSTASH_REDIS_REST_URL']);
const token = getServerEnv(['UPSTASH_REDIS_REST_TOKEN']);

export const redis = new Redis({
  url,
  token,
});
