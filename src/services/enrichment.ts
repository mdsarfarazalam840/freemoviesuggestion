import { supabase } from '../lib/supabase';
import { fetchMovieExternalIds } from './tmdb';
import type { MoodTag } from '../data/movies';

export function computeWatchScore(voteAverage: number, popularity: number, releaseYear: number | null): number {
  const ratingScore = Math.min(voteAverage * 10, 100);
  const normalizedPopularity = Math.min((popularity / 100) * 100, 100);

  const currentYear = new Date().getFullYear();
  let recencyBonus = 10;
  if (releaseYear) {
    const age = currentYear - releaseYear;
    if (age <= 0) recencyBonus = 100;
    else if (age <= 1) recencyBonus = 80;
    else if (age <= 2) recencyBonus = 65;
    else if (age <= 5) recencyBonus = 45;
    else if (age <= 10) recencyBonus = 25;
    else recencyBonus = 10;
  }

  return Math.round(ratingScore * 0.5 + normalizedPopularity * 0.3 + recencyBonus * 0.2);
}

export function assignMoodTags(genres: string[], voteAverage: number, voteCount: number): MoodTag[] {
  const tags: MoodTag[] = [];
  const g = new Set(genres.map((x) => x.toLowerCase()));
  const va = voteAverage;

  const checks: [MoodTag, string[], number?, string[]?, number?][] = [
    ['Intense', ['action', 'thriller'], 6],
    ['Feel-Good', ['comedy', 'family'], 6, ['animation']],
    ['Mind-Bender', ['sci-fi', 'mystery', 'thriller'], undefined, ['drama', 'sci-fi']],
    ['Emotional', ['drama', 'romance'], undefined, ['drama']],
    ['Easy Watch', ['comedy', 'adventure'], undefined, ['animation', 'comedy']],
    ['Edge of Seat', ['thriller', 'horror', 'action'], 5.5],
    ['Epic', ['action', 'adventure'], undefined, undefined, 500],
    ['Award-Worthy', ['drama'], 7.5],
    ['Dark & Gritty', ['crime', 'thriller', 'war', 'horror'], 6.5],
    ['Lighthearted', ['comedy', 'family', 'animation', 'music', 'romance']],
  ];

  for (const [tag, requiredGenres, minVote, anyGenres, minVotes] of checks) {
    const hasRequired = requiredGenres.some((rg) => g.has(rg));
    const hasAny = anyGenres ? anyGenres.some((ag) => g.has(ag)) : true;
    const passesVote = minVote != null ? va >= minVote : true;
    const passesVotes = minVotes != null ? voteCount >= minVotes : true;

    if (hasRequired && hasAny && passesVote && passesVotes) {
      tags.push(tag);
    }
  }

  return [...new Set(tags)].slice(0, 3);
}

export async function enrichMissingImdbIds(batchSize = 50): Promise<{ processed: number; updated: number; failed: number }> {
  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, tmdb_id, title')
    .is('imdb_id', null)
    .not('tmdb_id', 'is', null)
    .limit(500);

  if (error || !movies?.length) {
    console.log(`[enrich] No movies missing imdb_id (or error: ${error?.message})`);
    return { processed: 0, updated: 0, failed: 0 };
  }

  console.log(`[enrich] Found ${movies.length} movies missing imdb_id. Processing...`);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < movies.length; i += batchSize) {
    const batch = movies.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((m) => fetchMovieExternalIds(m.tmdb_id))
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const movie = batch[j];

      if (result.status === 'fulfilled' && result.value?.imdb_id) {
        const { error: updateError } = await supabase
          .from('movies')
          .update({ imdb_id: result.value.imdb_id })
          .eq('id', movie.id);

        if (!updateError) {
          updated++;
        } else {
          failed++;
        }
      } else {
        failed++;
      }
    }

    console.log(`[enrich] Batch ${Math.ceil((i + batchSize) / batchSize)}/${Math.ceil(movies.length / batchSize)}: ${updated} updated, ${failed} failed`);
  }

  return { processed: movies.length, updated, failed };
}

export async function enrichWatchScoreAndMoodTags(batchSize = 200): Promise<{ processed: number; updated: number }> {
  const { data: movies, error } = await supabase
    .from('movies')
    .select('id, title, vote_average, popularity, release_year, genres, vote_count')
    .or('watchscore.is.null,mood_tags.eq.{}')
    .limit(2000);

  if (error || !movies?.length) {
    console.log(`[enrich] No movies missing watchScore/mood_tags (or error: ${error?.message})`);
    return { processed: 0, updated: 0 };
  }

  console.log(`[enrich] Computing watchScore + moodTags for ${movies.length} movies...`);
  let updated = 0;

  for (let i = 0; i < movies.length; i += batchSize) {
    const batch = movies.slice(i, i + batchSize);
    const updates = batch.map((m) => ({
      id: m.id,
      watchscore: computeWatchScore(m.vote_average || 0, m.popularity || 0, m.release_year),
      mood_tags: assignMoodTags(
        Array.isArray(m.genres) ? m.genres.map((g: any) => typeof g === 'string' ? g : g.name || '') : [],
        m.vote_average || 0,
        m.vote_count || 0,
      ),
    }));

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('movies')
        .update({ watchscore: update.watchscore, mood_tags: update.mood_tags })
        .eq('id', update.id);

      if (!updateError) updated++;
    }

    console.log(`[enrich] Score batch ${Math.ceil((i + batchSize) / batchSize)}: ${updated}/${movies.length} updated`);
  }

  return { processed: movies.length, updated };
}
