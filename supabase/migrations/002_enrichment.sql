-- Enrichment: IMDB IDs, WatchScore, Mood Tags

alter table movies add column if not exists imdb_id text;

alter table movies add column if not exists watchscore integer;

alter table movies add column if not exists mood_tags jsonb not null default '[]'::jsonb;

alter table movies add column if not exists rt_tomatometer integer;

alter table movies add column if not exists rt_audience_score integer;

alter table movies add column if not exists rt_certification text;

create index if not exists movies_watchscore_idx on movies(watchscore desc);
create index if not exists movies_imdb_id_idx on movies(imdb_id);
create index if not exists movies_mood_tags_idx on movies using gin (mood_tags);
