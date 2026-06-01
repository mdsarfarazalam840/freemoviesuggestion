-- Schema for movie metadata
CREATE TABLE IF NOT EXISTS movies (
    id SERIAL PRIMARY KEY,
    tmdb_id INT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    overview TEXT,
    description TEXT,
    thumbnail TEXT,
    poster_path TEXT,
    release_date DATE,
    release_year INT,
    vote_average FLOAT,
    rating FLOAT,
    region TEXT,
    genres JSONB,
    ott_platforms JSONB,
    is_top_10 BOOLEAN DEFAULT FALSE,
    rank INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_slug ON movies(slug);
