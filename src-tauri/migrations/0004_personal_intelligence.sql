CREATE TABLE IF NOT EXISTS learning_weights (
  category TEXT NOT NULL,
  feature TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0,
  observations INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (category, feature)
);

CREATE INDEX IF NOT EXISTS idx_learning_weights_feature ON learning_weights(feature);
CREATE INDEX IF NOT EXISTS idx_entity_evidence_asset ON entity_evidence(asset_id);

PRAGMA user_version = 4;
