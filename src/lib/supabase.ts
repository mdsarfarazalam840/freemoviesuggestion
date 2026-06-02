import * as dotenv from 'dotenv';
dotenv.config({ override: true });
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerKey, getSupabaseUrl } from './env';

const supabaseUrl = getSupabaseUrl();
const supabaseKey = getSupabaseServerKey();

export const supabase = createClient(supabaseUrl, supabaseKey);
