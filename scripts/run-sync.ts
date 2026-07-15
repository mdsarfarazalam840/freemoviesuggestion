import 'dotenv/config';
import { syncMovies, syncTrendingMovies } from '../src/services/sync';
import { enrichWatchScoreAndMoodTags } from '../src/services/enrichment';

async function runSync() {
  try {
    const target = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
    console.log(`Starting sync (target: ${target} movies)...`);
    
    // First do a quick trending sync to ensure homepage is fresh
    await syncTrendingMovies();
    
    // Then do the bulk sync
    await syncMovies(target);

    // Compute watchScore + moodTags for any movies still missing them (zero API calls)
    console.log('\nComputing watchScore and moodTags...');
    const enriched = await enrichWatchScoreAndMoodTags(200);
    console.log(`Score enrichment: ${enriched.updated} updated out of ${enriched.processed}`);

    console.log('\nSync complete.');
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

runSync();
