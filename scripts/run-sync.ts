import 'dotenv/config';
import { syncMovies, syncTrendingMovies } from '../src/services/sync';

async function runSync() {
  try {
    const target = process.argv[2] ? parseInt(process.argv[2], 10) : 1000;
    console.log(`Starting sync (target: ${target} movies)...`);
    
    // First do a quick trending sync to ensure homepage is fresh
    await syncTrendingMovies();
    
    // Then do the bulk sync
    await syncMovies(target);
    
    console.log('Sync complete.');
  } catch (error) {
    console.error('Sync failed:', error);
  }
}

runSync();
