import 'dotenv/config';
import { syncTrendingMovies } from '../src/services/sync';

async function runSync() {
  try {
    console.log('Starting sync...');
    await syncTrendingMovies();
    console.log('Sync complete.');
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

runSync();
