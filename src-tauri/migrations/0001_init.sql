PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  source_uri TEXT NOT NULL,
  source_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  modified_at TEXT NOT NULL,
  identity_token TEXT NOT NULL,
  content_hash TEXT,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  thumbnail_path TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'kept', 'trash', 'deleted')),
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_identity ON assets(source_id, identity_token);

CREATE TABLE IF NOT EXISTS analyses (
  asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  analysis_version INTEGER NOT NULL,
  category TEXT NOT NULL,
  confidence REAL NOT NULL,
  alternative_categories_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  ocr_text TEXT NOT NULL DEFAULT '',
  ocr_language TEXT,
  ocr_engine TEXT NOT NULL,
  average_color TEXT,
  mean_luminance REAL,
  luminance_deviation REAL,
  dark_pixel_ratio REAL,
  bright_pixel_ratio REAL,
  perceptual_hash TEXT,
  duplicate_group TEXT,
  junk_signals_json TEXT NOT NULL DEFAULT '[]',
  sensitivity TEXT NOT NULL DEFAULT 'normal',
  expires_at TEXT,
  analyzed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_category ON analyses(category);

CREATE VIRTUAL TABLE IF NOT EXISTS asset_search USING fts5(
  asset_id UNINDEXED,
  file_name,
  ocr_text,
  tags,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS embeddings (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  vector BLOB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, kind, model_version)
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  rule_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'analysis',
  PRIMARY KEY (collection_id, asset_id)
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  attributes_json TEXT NOT NULL DEFAULT '{}',
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(kind, normalized_name)
);

CREATE TABLE IF NOT EXISTS entity_evidence (
  entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  confidence REAL NOT NULL,
  evidence_text TEXT,
  PRIMARY KEY (entity_id, asset_id)
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS surface_history (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  surface TEXT NOT NULL,
  shown_at TEXT NOT NULL,
  response TEXT,
  PRIMARY KEY (asset_id, surface, shown_at)
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  source_path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  discovered INTEGER NOT NULL DEFAULT 0,
  analyzed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  reclaimed_bytes INTEGER NOT NULL DEFAULT 0,
  errors_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_value TEXT,
  next_value TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO collections (id, name, kind, created_at, updated_at)
VALUES
  ('shopping', 'Alışveriş', 'system', datetime('now'), datetime('now')),
  ('food', 'Tarifler', 'system', datetime('now'), datetime('now')),
  ('places', 'Mekanlar', 'system', datetime('now'), datetime('now')),
  ('chats', 'Sohbetler', 'system', datetime('now'), datetime('now')),
  ('ideas', 'Fikirler', 'system', datetime('now'), datetime('now')),
  ('documents', 'Belgeler', 'system', datetime('now'), datetime('now')),
  ('social', 'Sosyal', 'system', datetime('now'), datetime('now')),
  ('junk', 'Muhtemel Çöp', 'system', datetime('now'), datetime('now')),
  ('other', 'Diğer', 'system', datetime('now'), datetime('now'));

PRAGMA user_version = 1;
