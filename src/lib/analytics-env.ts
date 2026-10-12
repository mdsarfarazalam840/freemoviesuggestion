export type AnalyticsEnvLike = Record<string, unknown>;

/**
 * Resolve the runtime bindings exposed by Astro's Cloudflare adapter.
 *
 * `locals.runtime.env` is not safe to read on every adapter/version, so the
 * supported Cloudflare accessor is attempted after the defensive fallbacks.
 * The dynamic import keeps Node-based tests and local tooling importable.
 */
export async function envFromLocals<T extends AnalyticsEnvLike>(locals: unknown): Promise<T> {
  const value = locals as { runtime?: { env?: T }; env?: T } | undefined;
  try {
    const runtimeEnv = value?.runtime?.env;
    if (runtimeEnv !== undefined) return runtimeEnv;
  } catch {
    // Some Cloudflare adapters expose runtime.env through a throwing getter.
  }
  try {
    const localEnv = value?.env;
    if (localEnv !== undefined) return localEnv;
  } catch {
    // Continue to the process/global fallback.
  }
  try {
    const globalEnv = (globalThis as typeof globalThis & { __ENV?: T }).__ENV;
    if (globalEnv !== undefined) return globalEnv;
  } catch {
    // Continue to the Cloudflare accessor.
  }

  try {
    const cloudflare = await import('cloudflare:workers');
    return cloudflare.env as T;
  } catch {
    return {} as T;
  }
}
