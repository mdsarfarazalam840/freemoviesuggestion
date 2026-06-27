type EnvMap = Record<string, string | undefined>;

function getEnvValue(name: string): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (name === 'PUBLIC_SUPABASE_URL') return import.meta.env.PUBLIC_SUPABASE_URL;
    if (name === 'SUPABASE_URL') return import.meta.env.SUPABASE_URL;
    if (name === 'SUPABASE_SERVICE_ROLE_KEY') return import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
    if (name === 'PUBLIC_SUPABASE_ANON_KEY') return import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    if (name === 'SUPABASE_KEY') return import.meta.env.SUPABASE_KEY;
    if (name === 'TMDB_ACCESS_TOKEN') return import.meta.env.TMDB_ACCESS_TOKEN;
    if (name === 'TMDB_API_KEY') return import.meta.env.TMDB_API_KEY;
    if (name === 'UPSTASH_REDIS_REST_URL') return import.meta.env.UPSTASH_REDIS_REST_URL;
    if (name === 'UPSTASH_REDIS_REST_TOKEN') return import.meta.env.UPSTASH_REDIS_REST_TOKEN;
  }
  // @ts-ignore
  if (typeof globalThis.__ENV !== 'undefined' && globalThis.__ENV[name]) {
    // @ts-ignore
    return globalThis.__ENV[name];
  }
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name];
  }
  return undefined;
}

export function getServerEnv(names: string[], fallback = ''): string {
  for (const name of names) {
    const value = getEnvValue(name);
    if (value) return value;
  }
  return fallback;
}

export function getSupabaseUrl(): string {
  return getServerEnv(['PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
}

export function getSupabaseServerKey(): string {
  return getServerEnv(['SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_KEY']);
}

export function getTmdbAccessToken(): string {
  return getServerEnv(['TMDB_ACCESS_TOKEN', 'TMDB_API_KEY']);
}
