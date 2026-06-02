type EnvMap = Record<string, string | undefined>;

const serverEnv: EnvMap = typeof process !== 'undefined' ? process.env : {};

export function getServerEnv(names: string[], fallback = ''): string {
  for (const name of names) {
    const value = serverEnv[name];
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
