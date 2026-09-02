CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actions_asset_action ON actions(asset_id, action);
CREATE INDEX IF NOT EXISTS idx_surface_history_shown_at ON surface_history(shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_deleted_at ON assets(deleted_at DESC);

PRAGMA user_version = 2;
