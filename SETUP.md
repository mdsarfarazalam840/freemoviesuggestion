# Project Setup Guide: High-Performance Movie Suggestion Engine

This guide covers the setup for the project's high-performance data pipeline, utilizing **Supabase** (PostgreSQL) for persistent storage, **Upstash Redis** for caching, and **TMDB API** for movie metadata.

## Prerequisites
- Node.js (v18+)
- NPM

## Step 1: Obtain Credentials
Before configuring your environment, you need to obtain the following credentials from the respective services:

1.  **Supabase** (`SUPABASE_URL`, `SUPABASE_KEY`):
    - Create a project at [supabase.com](https://supabase.com/).
    - Go to **Project Settings** > **API**.
    - Copy your `Project URL` and `anon public` API Key.
2.  **Upstash Redis** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`):
    - Create a Redis database at [upstash.com](https://upstash.com/).
    - Under the database details, scroll to **REST API** section.
    - Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3.  **TMDB API** (`TMDB_API_KEY`):
    - Sign up at [themoviedb.org](https://www.themoviedb.org/).
    - Go to **Settings** > **API**.
    - Request an API Key and copy your `API Key (v3 auth)`.

## Step 2: Environment Configuration
Create a `.env` file in the project root based on `.env.example` and populate it with the credentials obtained in Step 1:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
TMDB_API_KEY=your_tmdb_api_key
```

## Step 3: Database Schema (Supabase)
Run the SQL script located in `schema.sql` within your Supabase project's SQL Editor to create the necessary tables and indexes:

```sql
-- Schema for movie metadata
CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    tmdb_id INT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    overview TEXT,
    poster_path TEXT,
    release_date DATE,
    vote_average FLOAT,
    genres JSONB,
    ott_platforms JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug);
```

## Step 4: Dependencies
Ensure all necessary packages are installed:

```bash
npm install @supabase/supabase-js @upstash/redis dotenv
```

## Step 5: Running the Sync Service
The synchronization service fetches data from TMDB and upserts it into Supabase. To run it:

```bash
npx ts-node scripts/run-sync.ts
```

*Note: For production, this should be scheduled as a daily cron job.*

## Architecture Overview
- **Storage**: Supabase (PostgreSQL)
- **Cache**: Upstash Redis (Cache-Aside pattern implemented in `src/services/movieService.ts`)
- **Data Source**: TMDB API

For further technical details, see individual service files in `src/services/`.
