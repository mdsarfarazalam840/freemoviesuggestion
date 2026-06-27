import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getSupabaseUrl, getSupabaseServerKey } from './env';

function getSupabaseClient(): SupabaseClient {
  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = getSupabaseServerKey();
  return createClient(supabaseUrl, supabaseKey);
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
