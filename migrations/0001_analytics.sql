CREATE TABLE IF NOT EXISTS analytics_visitors (
  visitor_id TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  first_source TEXT,
  first_medium TEXT,
  first_referrer_domain TEXT
);

CREATE TABLE IF NOT EXISTS analytics_sessions (
  session_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  entry_path TEXT,
  last_path TEXT,
  source TEXT,
  medium TEXT,
  referrer_domain TEXT
);

CREATE TABLE IF NOT EXISTS analytics_page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL,
  source TEXT,
  medium TEXT,
  referrer_domain TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_visitors_last_seen_at
  ON analytics_visitors (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_visitor_id
  ON analytics_visitors (visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_source
  ON analytics_visitors (first_source);
CREATE INDEX IF NOT EXISTS idx_analytics_visitors_referrer_domain
  ON analytics_visitors (first_referrer_domain);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen_at
  ON analytics_sessions (last_seen_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_started_at
  ON analytics_sessions (started_at);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_visitor_id
  ON analytics_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_source
  ON analytics_sessions (source);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_referrer_domain
  ON analytics_sessions (referrer_domain);

CREATE INDEX IF NOT EXISTS idx_analytics_page_views_created_at
  ON analytics_page_views (created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_visitor_id
  ON analytics_page_views (visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_source
  ON analytics_page_views (source);
CREATE INDEX IF NOT EXISTS idx_analytics_page_views_referrer_domain
  ON analytics_page_views (referrer_domain);
