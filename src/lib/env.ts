type EnvMap = Record<string, string | undefined>;

export function getServerEnv(names: string[], fallback = ''): string {
  // Always read from process.env at call time (not cached at module load).
  // On Cloudflare Workers, the middleware populates process.env at request time.
  for (const name of names) {
    const value = process.env[name];
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
