import 'dotenv/config';
import { enrichMissingImdbIds, enrichWatchScoreAndMoodTags } from '../src/services/enrichment';
import { syncMovies, syncTrendingMovies } from '../src/services/sync';

async function runEnrichment() {
  console.log('=== Starting movie enrichment pipeline ===');
  
  // Step 1: Quick trending sync to get fresh movies
  console.log('\n[Step 1] Syncing trending movies...');
  try {
    await syncTrendingMovies();
    console.log('[Step 1] Trending sync complete.');
  } catch (e) {
    console.warn('[Step 1] Trending sync skipped:', (e as Error).message);
  }

  // Step 2: Bulk sync to ensure we have enough movies
  console.log('\n[Step 2] Bulk movie sync...');
  const target = process.argv[2] ? parseInt(process.argv[2], 10) : 10000;
  try {
    await syncMovies(target);
    console.log(`[Step 2] Bulk sync complete (target: ${target}).`);
  } catch (e) {
    console.warn('[Step 2] Bulk sync error:', (e as Error).message);
  }

  // Step 3: Fetch imdb_id for movies missing it (lightweight TMDB calls)
  console.log('\n[Step 3] Enriching missing imdb_ids from TMDB...');
  try {
    const imdbResult = await enrichMissingImdbIds(50);
    console.log(`[Step 3] IMDB enrichment: ${imdbResult.updated} updated, ${imdbResult.failed} failed out of ${imdbResult.processed}`);
  } catch (e) {
    console.warn('[Step 3] IMDB enrichment error:', (e as Error).message);
  }

  // Step 4: Compute watchScore + moodTags for movies missing them (no API calls)
  console.log('\n[Step 4] Computing watchScore and moodTags...');
  try {
    const scoreResult = await enrichWatchScoreAndMoodTags(200);
    console.log(`[Step 4] Score enrichment: ${scoreResult.updated} updated out of ${scoreResult.processed}`);
  } catch (e) {
    console.warn('[Step 4] Score enrichment error:', (e as Error).message);
  }

  console.log('\n=== Enrichment pipeline complete ===');
}

runEnrichment();
