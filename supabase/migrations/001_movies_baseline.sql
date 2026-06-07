create table if not exists movies (
  id bigserial primary key,
  tmdb_id bigint not null,
  title text not null,
  slug text not null,
  overview text,
  description text,
  thumbnail text,
  poster_path text,
  backdrop_path text,
  release_date date,
  release_year integer,
  runtime integer,
  vote_average numeric,
  vote_count integer,
  popularity numeric,
  original_language text,
  genres jsonb not null default '[]'::jsonb,
  director text,
  top_cast jsonb not null default '[]'::jsonb,
  ott_platforms jsonb not null default '[]'::jsonb,
  region text,
  rating numeric,
  is_top_10 boolean not null default false,
  rank integer,
  tmdb_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure columns exist if table was created with old schema
alter table movies add column if not exists tmdb_id bigint;
alter table movies add column if not exists title text;
alter table movies add column if not exists slug text;
alter table movies add column if not exists overview text;
alter table movies add column if not exists description text;
alter table movies add column if not exists thumbnail text;
alter table movies add column if not exists poster_path text;
alter table movies add column if not exists backdrop_path text;
alter table movies add column if not exists release_date date;
alter table movies add column if not exists release_year integer;
alter table movies add column if not exists runtime integer;
alter table movies add column if not exists vote_average numeric;
alter table movies add column if not exists vote_count integer;
alter table movies add column if not exists popularity numeric;
alter table movies add column if not exists original_language text;
alter table movies add column if not exists genres jsonb;
alter table movies add column if not exists director text;
alter table movies add column if not exists top_cast jsonb;
alter table movies add column if not exists ott_platforms jsonb;
alter table movies add column if not exists region text;
alter table movies add column if not exists rating numeric;
alter table movies add column if not exists is_top_10 boolean;
alter table movies add column if not exists rank integer;
alter table movies add column if not exists tmdb_updated_at timestamptz;
alter table movies add column if not exists created_at timestamptz;
alter table movies add column if not exists updated_at timestamptz;

-- Set defaults for potentially new columns
alter table movies alter column genres set default '[]'::jsonb;
alter table movies alter column top_cast set default '[]'::jsonb;
alter table movies alter column ott_platforms set default '[]'::jsonb;
alter table movies alter column is_top_10 set default false;
alter table movies alter column created_at set default now();
alter table movies alter column updated_at set default now();

create unique index if not exists movies_tmdb_id_idx on movies(tmdb_id);
create unique index if not exists movies_slug_idx on movies(slug);
create index if not exists movies_popularity_idx on movies(popularity desc);
create index if not exists movies_release_date_idx on movies(release_date desc);
create index if not exists movies_vote_average_idx on movies(vote_average desc);
create index if not exists movies_original_language_idx on movies(original_language);
create index if not exists movies_region_idx on movies(region);
create index if not exists movies_rank_idx on movies(rank);
create index if not exists movies_genres_idx on movies using gin (genres);
create index if not exists movies_ott_platforms_idx on movies using gin (ott_platforms);

alter table movies
add column if not exists fts tsvector
generated always as (
  to_tsvector(
    'english',
    coalesce(title, '') || ' ' || coalesce(overview, '') || ' ' || coalesce(director, '')
  )
) stored;

create index if not exists movies_fts_idx on movies using gin (fts);
