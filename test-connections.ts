import { supabase } from './src/lib/supabase';
import { redis } from './src/lib/redis';

async function testConnections() {
  console.log('Testing Supabase connection...');
  try {
    const { data, error } = await supabase.from('movies').select('count', { count: 'exact', head: true });
    if (error) throw error;
    console.log('Supabase connection successful.');
  } catch (e) {
    console.error('Supabase connection failed:', e);
  }

  console.log('Testing Upstash Redis connection...');
  try {
    await redis.set('test_key', 'test_value');
    const val = await redis.get('test_key');
    if (val !== 'test_value') throw new Error('Redis value mismatch');
    console.log('Upstash Redis connection successful.');
  } catch (e) {
    console.error('Upstash Redis connection failed:', e);
  }
}

testConnections();
