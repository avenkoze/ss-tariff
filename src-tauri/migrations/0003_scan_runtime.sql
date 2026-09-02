ALTER TABLE scan_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
CREATE INDEX IF NOT EXISTS idx_scan_runs_status ON scan_runs(status, started_at DESC);

PRAGMA user_version = 3;
