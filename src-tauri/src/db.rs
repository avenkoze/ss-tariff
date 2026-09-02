use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::analysis::ANALYSIS_VERSION;
use crate::models::{
    CategoryCount, NativeAnalysis, NativeAsset, NativeSettings, PeriodReport, ResurfaceCandidate,
    SourceCandidate, VisualFingerprint,
};

const MIGRATION_0001: &str = include_str!("../migrations/0001_init.sql");
const MIGRATION_0002: &str = include_str!("../migrations/0002_memory_reports.sql");
const MIGRATION_0003: &str = include_str!("../migrations/0003_scan_runtime.sql");

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn connect(&self) -> Result<Connection> {
        let connection = Connection::open(&self.path)
            .with_context(|| format!("SQLite açılamadı: {}", self.path.display()))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(connection)
    }

    pub fn migrate(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let connection = self.connect()?;
        let version: i64 = connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        if version < 1 {
            connection.execute_batch(MIGRATION_0001)?;
        }
        if version < 2 {
            connection.execute_batch(MIGRATION_0002)?;
        }
        if version < 3 {
            connection.execute_batch(MIGRATION_0003)?;
        }
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let connection = self.connect()?;
        connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn set_setting(&self, key: &str, value_json: &str) -> Result<()> {
        let connection = self.connect()?;
        connection.execute(
      "INSERT INTO settings (key, value_json, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      params![key, value_json, Utc::now().to_rfc3339()],
    )?;
        Ok(())
    }

    pub fn load_settings(&self) -> Result<NativeSettings> {
        self.get_setting("app_settings")?
            .map(|value| serde_json::from_str(&value).context("Ayarlar çözülemedi"))
            .transpose()
            .map(|settings| settings.unwrap_or_default())
    }

    pub fn save_settings(&self, settings: &NativeSettings) -> Result<()> {
        self.set_setting("app_settings", &serde_json::to_string(settings)?)
    }

    pub fn analysis_index(&self) -> Result<HashMap<String, (String, u32)>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT a.source_id, a.identity_token, COALESCE(n.analysis_version, 0)
             FROM assets a LEFT JOIN analyses n ON n.asset_id = a.id
             WHERE a.status != 'deleted'",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                (row.get::<_, String>(1)?, row.get::<_, u32>(2)?),
            ))
        })?;
        rows.collect::<rusqlite::Result<HashMap<_, _>>>()
            .map_err(Into::into)
    }

    pub fn upsert_analysis(
        &self,
        source: &SourceCandidate,
        analysis: &NativeAnalysis,
    ) -> Result<String> {
        let mut connection = self.connect()?;
        let duplicate_group = find_duplicate_group(
            &connection,
            &analysis.perceptual_hash,
            analysis.visual_fingerprint.mean_luminance,
        )?;
        let transaction = connection.transaction()?;
        let now = Utc::now().to_rfc3339();
        let existing_id: Option<String> = transaction
            .query_row(
                "SELECT id FROM assets WHERE source_id = ?1",
                [&source.source_id],
                |row| row.get(0),
            )
            .optional()?;
        let id = existing_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        transaction.execute(
            "INSERT INTO assets (
         id, source_id, source_uri, source_name, file_name, mime_type, size, created_at,
         modified_at, identity_token, content_hash, width, height, thumbnail_path, status,
         added_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'active', ?15, ?15)
       ON CONFLICT(source_id) DO UPDATE SET
         source_uri = excluded.source_uri,
         source_name = excluded.source_name,
         file_name = excluded.file_name,
         mime_type = excluded.mime_type,
         size = excluded.size,
         created_at = excluded.created_at,
         modified_at = excluded.modified_at,
         identity_token = excluded.identity_token,
         content_hash = excluded.content_hash,
         width = excluded.width,
         height = excluded.height,
         thumbnail_path = excluded.thumbnail_path,
         updated_at = excluded.updated_at",
            params![
                id,
                source.source_id,
                source.path.to_string_lossy(),
                source.source_name,
                source.file_name,
                source.mime_type,
                source.size as i64,
                source.created_at,
                source.modified_at,
                source.identity_token,
                analysis.content_hash,
                analysis.width,
                analysis.height,
                analysis.thumbnail_path,
                now,
            ],
        )?;

        transaction.execute(
            "INSERT INTO analyses (
         asset_id, analysis_version, category, confidence, tags_json, ocr_text, ocr_language,
         ocr_engine, average_color, mean_luminance, luminance_deviation, dark_pixel_ratio,
         bright_pixel_ratio, perceptual_hash, duplicate_group, junk_signals_json, sensitivity,
         analyzed_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
       ON CONFLICT(asset_id) DO UPDATE SET
         analysis_version = excluded.analysis_version,
         category = excluded.category,
         confidence = excluded.confidence,
         tags_json = excluded.tags_json,
         ocr_text = excluded.ocr_text,
         ocr_engine = excluded.ocr_engine,
         average_color = excluded.average_color,
         mean_luminance = excluded.mean_luminance,
         luminance_deviation = excluded.luminance_deviation,
         dark_pixel_ratio = excluded.dark_pixel_ratio,
         bright_pixel_ratio = excluded.bright_pixel_ratio,
         perceptual_hash = excluded.perceptual_hash,
         duplicate_group = excluded.duplicate_group,
         junk_signals_json = excluded.junk_signals_json,
         sensitivity = excluded.sensitivity,
         analyzed_at = excluded.analyzed_at",
            params![
                id,
                ANALYSIS_VERSION,
                analysis.category,
                analysis.confidence,
                serde_json::to_string(&analysis.tags)?,
                analysis.extracted_text,
                analysis.ocr_engine,
                analysis.average_color,
                analysis.visual_fingerprint.mean_luminance,
                analysis.visual_fingerprint.luminance_deviation,
                analysis.visual_fingerprint.dark_pixel_ratio,
                analysis.visual_fingerprint.bright_pixel_ratio,
                analysis.perceptual_hash,
                duplicate_group,
                serde_json::to_string(&analysis.junk_signals)?,
                analysis.sensitivity,
                now,
            ],
        )?;

        transaction.execute(
      "INSERT INTO embeddings (asset_id, kind, model_version, dimensions, vector, created_at)
       VALUES (?1, 'text', 'feature-hash-v1', ?2, ?3, ?4)
       ON CONFLICT(asset_id, kind, model_version) DO UPDATE SET
         dimensions = excluded.dimensions, vector = excluded.vector, created_at = excluded.created_at",
      params![id, analysis.embedding.len() as i64, embedding_to_bytes(&analysis.embedding), now],
    )?;
        transaction.execute(
            "DELETE FROM collection_items WHERE asset_id = ?1 AND source = 'analysis'",
            [&id],
        )?;
        transaction.execute(
      "INSERT INTO collection_items (collection_id, asset_id, confidence, source) VALUES (?1, ?2, ?3, 'analysis')",
      params![analysis.category, id, analysis.confidence],
    )?;
        transaction.execute("DELETE FROM asset_search WHERE asset_id = ?1", [&id])?;
        transaction.execute(
      "INSERT INTO asset_search (asset_id, file_name, ocr_text, tags) VALUES (?1, ?2, ?3, ?4)",
      params![id, source.file_name, analysis.extracted_text, analysis.tags.join(" ")],
    )?;
        transaction.commit()?;
        Ok(id)
    }

    pub fn list_assets(&self) -> Result<Vec<NativeAsset>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT
         a.id, a.source_id, a.source_uri, a.file_name, n.category, n.confidence, n.tags_json,
         n.ocr_text, a.created_at, a.added_at, a.width, a.height, a.size, n.perceptual_hash,
         n.average_color, n.mean_luminance, n.luminance_deviation, n.dark_pixel_ratio,
         n.bright_pixel_ratio, n.junk_signals_json, n.duplicate_group, a.status,
         n.ocr_engine, a.thumbnail_path, n.analysis_version, n.analyzed_at
       FROM assets a JOIN analyses n ON n.asset_id = a.id
       WHERE a.status != 'deleted'
       ORDER BY a.created_at DESC",
        )?;
        let rows = statement.query_map([], map_native_asset)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn source_path_for_asset(&self, id: &str) -> Result<Option<String>> {
        let connection = self.connect()?;
        connection
            .query_row("SELECT source_uri FROM assets WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()
            .map_err(Into::into)
    }

    pub fn update_status(&self, id: &str, status: &str) -> Result<()> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let previous: Option<String> = transaction
            .query_row("SELECT status FROM assets WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()?;
        transaction.execute(
            "UPDATE assets SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, Utc::now().to_rfc3339(), id],
        )?;
        record_action(
            &transaction,
            Some(id),
            "status",
            previous.as_deref(),
            Some(status),
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn mark_deleted(&self, id: &str) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "UPDATE assets SET status = 'deleted', deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        record_action(
            &transaction,
            Some(id),
            "system-trash",
            Some("trash"),
            Some("deleted"),
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn embedding_rows(&self) -> Result<Vec<(String, Vec<f32>)>> {
        let connection = self.connect()?;
        let mut statement = connection.prepare(
            "SELECT e.asset_id, e.vector FROM embeddings e JOIN assets a ON a.id = e.asset_id
       WHERE e.kind = 'text' AND e.model_version = 'feature-hash-v1' AND a.status != 'deleted'",
        )?;
        let rows = statement.query_map([], |row| {
            let id: String = row.get(0)?;
            let bytes: Vec<u8> = row.get(1)?;
            Ok((id, bytes_to_embedding(&bytes)))
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .map_err(Into::into)
    }

    pub fn record_surface(&self, id: &str, surface: &str, response: Option<&str>) -> Result<()> {
        self.connect()?.execute(
      "INSERT INTO surface_history (asset_id, surface, shown_at, response) VALUES (?1, ?2, ?3, ?4)",
      params![id, surface, Utc::now().to_rfc3339(), response],
    )?;
        Ok(())
    }

    pub fn update_category(&self, id: &str, category: &str) -> Result<()> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction()?;
        let previous: Option<String> = transaction
            .query_row(
                "SELECT category FROM analyses WHERE asset_id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        transaction.execute(
            "UPDATE analyses SET category = ?1, confidence = 1 WHERE asset_id = ?2",
            params![category, id],
        )?;
        transaction.execute("DELETE FROM collection_items WHERE asset_id = ?1", [id])?;
        transaction.execute(
            "INSERT INTO collection_items (collection_id, asset_id, confidence, source)
             VALUES (?1, ?2, 1, 'user')",
            params![category, id],
        )?;
        record_action(
            &transaction,
            Some(id),
            "category",
            previous.as_deref(),
            Some(category),
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn period_report(&self, period_days: u32) -> Result<PeriodReport> {
        let days = period_days.clamp(1, 366);
        let to = Utc::now();
        let from = to - Duration::days(days as i64);
        let from_text = from.to_rfc3339();
        let connection = self.connect()?;

        let added = count_query(
            &connection,
            "SELECT COUNT(*) FROM assets WHERE added_at >= ?1",
            &from_text,
        )?;
        let kept = count_query(
            &connection,
            "SELECT COUNT(*) FROM actions WHERE action = 'status' AND next_value = 'kept' AND created_at >= ?1",
            &from_text,
        )?;
        let queued_for_cleanup = count_query(
            &connection,
            "SELECT COUNT(*) FROM actions WHERE action = 'status' AND next_value = 'trash' AND created_at >= ?1",
            &from_text,
        )?;
        let deleted = count_query(
            &connection,
            "SELECT COUNT(*) FROM assets WHERE deleted_at >= ?1",
            &from_text,
        )?;
        let reclaimed_bytes: i64 = connection.query_row(
            "SELECT COALESCE(SUM(size), 0) FROM assets WHERE deleted_at >= ?1",
            [&from_text],
            |row| row.get(0),
        )?;
        let reclaimed_bytes = reclaimed_bytes.max(0) as u64;
        let junk_candidates = count_query(
            &connection,
            "SELECT COUNT(*) FROM analyses n JOIN assets a ON a.id = n.asset_id
             WHERE n.category = 'junk' AND a.added_at >= ?1 AND a.status != 'deleted'",
            &from_text,
        )?;
        let duplicate_candidates = count_query(
            &connection,
            "SELECT COUNT(*) FROM analyses n JOIN assets a ON a.id = n.asset_id
             WHERE n.duplicate_group IS NOT NULL AND a.added_at >= ?1 AND a.status != 'deleted'",
            &from_text,
        )?;
        let resurfaced = count_query(
            &connection,
            "SELECT COUNT(*) FROM surface_history WHERE shown_at >= ?1",
            &from_text,
        )?;
        let mut statement = connection.prepare(
            "SELECT n.category, COUNT(*)
             FROM analyses n JOIN assets a ON a.id = n.asset_id
             WHERE a.added_at >= ?1 AND a.status != 'deleted'
             GROUP BY n.category ORDER BY COUNT(*) DESC",
        )?;
        let categories = statement
            .query_map([&from_text], |row| {
                Ok(CategoryCount {
                    category: row.get(0)?,
                    count: row.get::<_, i64>(1)?.max(0) as u64,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(PeriodReport {
            period_days: days,
            from: from_text,
            to: to.to_rfc3339(),
            added,
            kept,
            queued_for_cleanup,
            deleted,
            reclaimed_bytes,
            junk_candidates,
            duplicate_candidates,
            resurfaced,
            categories,
        })
    }

    pub fn resurface_candidates(&self, limit: usize) -> Result<Vec<ResurfaceCandidate>> {
        use std::collections::HashMap;

        let connection = self.connect()?;
        let mut category_actions = HashMap::<String, (u64, u64)>::new();
        let mut action_statement = connection.prepare(
            "SELECT n.category,
                    SUM(CASE WHEN x.next_value = 'kept' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN x.next_value IN ('trash', 'deleted') THEN 1 ELSE 0 END)
             FROM actions x JOIN analyses n ON n.asset_id = x.asset_id
             WHERE x.action IN ('status', 'system-trash') GROUP BY n.category",
        )?;
        for row in action_statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?.max(0) as u64,
                row.get::<_, i64>(2)?.max(0) as u64,
            ))
        })? {
            let (category, kept, removed) = row?;
            category_actions.insert(category, (kept, removed));
        }

        let mut surfaces = HashMap::<String, String>::new();
        let mut surface_statement = connection
            .prepare("SELECT asset_id, MAX(shown_at) FROM surface_history GROUP BY asset_id")?;
        for row in surface_statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })? {
            let (id, shown_at) = row?;
            surfaces.insert(id, shown_at);
        }
        drop(surface_statement);
        drop(action_statement);
        drop(connection);

        let now = Utc::now();
        let day_seed = now.format("%Y-%m-%d").to_string();
        let mut candidates = self
            .list_assets()?
            .into_iter()
            .filter(|item| matches!(item.status.as_str(), "active" | "kept"))
            .filter_map(|item| {
                let created = chrono::DateTime::parse_from_rfc3339(&item.created_at).ok()?;
                let age_days = now
                    .signed_duration_since(created.with_timezone(&Utc))
                    .num_days();
                if age_days < 7 {
                    return None;
                }
                let (kept, removed) = category_actions
                    .get(&item.category)
                    .copied()
                    .unwrap_or_default();
                let preference = (kept as f64 + 1.0) / (kept + removed + 2) as f64;
                let shown_penalty = surfaces
                    .get(&item.id)
                    .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
                    .map(|shown| {
                        let elapsed = now
                            .signed_duration_since(shown.with_timezone(&Utc))
                            .num_days();
                        if elapsed < 14 {
                            80.0
                        } else {
                            0.0
                        }
                    })
                    .unwrap_or(0.0);
                let jitter = stable_daily_jitter(&day_seed, &item.id);
                let score =
                    age_days.min(365) as f64 * 0.18 + preference * 20.0 + jitter - shown_penalty;
                let reason = if item.status == "kept" {
                    "Daha önce saklamayı seçmiştin".to_string()
                } else if preference > 0.6 {
                    "Sık sakladığın bir kategoriden".to_string()
                } else {
                    format!("{} gün önce kaydetmiştin", age_days)
                };
                Some(ResurfaceCandidate {
                    item,
                    reason,
                    score,
                })
            })
            .collect::<Vec<_>>();
        candidates.sort_by(|first, second| second.score.total_cmp(&first.score));
        candidates.truncate(limit.clamp(1, 20));
        Ok(candidates)
    }
}

fn count_query(connection: &Connection, sql: &str, from: &str) -> Result<u64> {
    connection
        .query_row(sql, [from], |row| row.get::<_, i64>(0))
        .map(|value| value.max(0) as u64)
        .map_err(Into::into)
}

fn stable_daily_jitter(day: &str, id: &str) -> f64 {
    let mut value = 1469598103934665603_u64;
    for byte in day.bytes().chain(id.bytes()) {
        value ^= byte as u64;
        value = value.wrapping_mul(1099511628211);
    }
    (value % 1000) as f64 / 100.0
}

fn find_duplicate_group(
    connection: &Connection,
    hash: &str,
    mean_luminance: f64,
) -> Result<Option<String>> {
    let mut statement = connection.prepare(
        "SELECT a.id, n.perceptual_hash, n.duplicate_group
     FROM analyses n JOIN assets a ON a.id = n.asset_id
     WHERE n.perceptual_hash IS NOT NULL AND a.status != 'deleted'
       AND n.mean_luminance BETWEEN ?1 AND ?2
     ORDER BY n.analyzed_at DESC LIMIT 512",
    )?;
    let candidates = statement.query_map(
        params![mean_luminance - 0.12, mean_luminance + 0.12],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        },
    )?;
    for candidate in candidates {
        let (id, candidate_hash, group) = candidate?;
        if hamming_distance(hash, &candidate_hash) <= 20 {
            return Ok(Some(group.unwrap_or_else(|| format!("similar-{id}"))));
        }
    }
    Ok(None)
}

fn hamming_distance(first: &str, second: &str) -> usize {
    if first.len() != second.len() {
        return usize::MAX;
    }
    first
        .chars()
        .zip(second.chars())
        .filter(|(a, b)| a != b)
        .count()
}

fn embedding_to_bytes(values: &[f32]) -> Vec<u8> {
    values
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

fn bytes_to_embedding(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

fn map_native_asset(row: &rusqlite::Row<'_>) -> rusqlite::Result<NativeAsset> {
    let tags_json: String = row.get(6)?;
    let junk_json: String = row.get(19)?;
    let mean: Option<f64> = row.get(15)?;
    let luminance_deviation: Option<f64> = row.get(16)?;
    let dark_pixel_ratio: Option<f64> = row.get(17)?;
    let bright_pixel_ratio: Option<f64> = row.get(18)?;
    Ok(NativeAsset {
        id: row.get(0)?,
        source_id: row.get(1)?,
        source_uri: row.get(2)?,
        name: row.get(3)?,
        category: row.get(4)?,
        confidence: row.get(5)?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        extracted_text: row.get(7)?,
        created_at: row.get(8)?,
        added_at: row.get(9)?,
        width: row.get(10)?,
        height: row.get(11)?,
        size: row.get::<_, i64>(12)? as u64,
        hash: row.get(13)?,
        average_color: row.get(14)?,
        visual_fingerprint: mean.map(|mean_luminance| VisualFingerprint {
            mean_luminance,
            luminance_deviation: luminance_deviation.unwrap_or_default(),
            dark_pixel_ratio: dark_pixel_ratio.unwrap_or_default(),
            bright_pixel_ratio: bright_pixel_ratio.unwrap_or_default(),
        }),
        junk_signals: serde_json::from_str(&junk_json).unwrap_or_default(),
        duplicate_group: row.get(20)?,
        status: row.get(21)?,
        analyzer: row.get(22)?,
        thumbnail_path: row.get(23)?,
        analysis_version: row.get(24)?,
        last_analyzed_at: row.get(25)?,
    })
}

fn record_action(
    transaction: &Transaction<'_>,
    asset_id: Option<&str>,
    action: &str,
    previous: Option<&str>,
    next: Option<&str>,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO actions (id, asset_id, action, previous_value, next_value, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            uuid::Uuid::new_v4().to_string(),
            asset_id,
            action,
            previous,
            next,
            Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_is_idempotent_and_creates_the_full_schema() {
        let path = std::env::temp_dir().join(format!("ss-tariff-{}.db", uuid::Uuid::new_v4()));
        let database = Database::new(path.clone());
        database.migrate().unwrap();
        database.migrate().unwrap();

        let connection = database.connect().unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 3);
        for table in [
            "assets",
            "analyses",
            "embeddings",
            "collections",
            "entities",
            "memories",
            "surface_history",
            "scan_runs",
            "actions",
            "settings",
        ] {
            let count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table {table}");
        }

        drop(connection);
        let _ = std::fs::remove_file(path);
    }
}
