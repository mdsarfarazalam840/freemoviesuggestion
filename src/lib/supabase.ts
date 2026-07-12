import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseUrl, getSupabaseServerKey } from './env';

let client: SupabaseClient | null = null;
let clientKey = '';

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServerKey();
  const nextClientKey = `${supabaseUrl}:${supabaseKey}`;

  if (!client || clientKey !== nextClientKey) {
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    clientKey = nextClientKey;
  }

  return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop);
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
