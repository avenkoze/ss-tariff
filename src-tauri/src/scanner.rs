use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use rusqlite::params;
use walkdir::WalkDir;

use crate::analysis::analyze_image;
use crate::db::Database;
use crate::models::{ScanSummary, SourceCandidate};

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];

pub fn discover_default_source() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(pictures) = dirs::picture_dir() {
        candidates.push(pictures.join("Screenshots"));
        candidates.push(pictures.join("Ekran Görüntüleri"));
    }
    if let Some(home) = dirs::home_dir() {
        candidates.push(home.join("OneDrive").join("Pictures").join("Screenshots"));
        candidates.push(
            home.join("OneDrive")
                .join("Resimler")
                .join("Ekran Görüntüleri"),
        );
    }
    candidates.into_iter().find(|path| path.is_dir())
}

#[cfg(test)]
pub fn scan_folder(
    database: &Database,
    thumbnail_dir: &Path,
    folder: &Path,
    trigger: &str,
) -> Result<ScanSummary> {
    scan_folder_with_cancel(database, thumbnail_dir, folder, trigger, &|| false)
}

pub fn scan_folder_with_cancel(
    database: &Database,
    thumbnail_dir: &Path,
    folder: &Path,
    trigger: &str,
    should_cancel: &dyn Fn() -> bool,
) -> Result<ScanSummary> {
    if !folder.is_dir() {
        bail!("Screenshot klasörü bulunamadı: {}", folder.display());
    }
    let source_path = folder
        .canonicalize()
        .unwrap_or_else(|_| folder.to_path_buf());
    let run_id = uuid::Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let connection = database.connect()?;
    connection.execute(
        "UPDATE scan_runs SET status = 'interrupted', completed_at = ?1
         WHERE status = 'running' AND completed_at IS NULL",
        [&started_at],
    )?;
    connection.execute(
        "INSERT INTO scan_runs (id, trigger, source_path, started_at, status)
         VALUES (?1, ?2, ?3, ?4, 'running')",
        params![run_id, trigger, source_path.to_string_lossy(), started_at],
    )?;
    drop(connection);

    let candidates = enumerate_images(&source_path)?;
    let current_index = database.analysis_index()?;
    let discovered = candidates.len();
    let mut analyzed = 0;
    let mut skipped = 0;
    let mut errors = Vec::new();
    let mut cancelled = false;

    for candidate in candidates {
        if should_cancel() {
            cancelled = true;
            break;
        }
        let current =
            current_index
                .get(&candidate.source_id)
                .is_some_and(|(identity_token, version)| {
                    identity_token == &candidate.identity_token
                        && *version >= crate::analysis::ANALYSIS_VERSION
                });
        if current {
            skipped += 1;
            continue;
        }
        match analyze_image(&candidate.path, thumbnail_dir)
            .and_then(|analysis| database.upsert_analysis(&candidate, &analysis))
        {
            Ok(_) => analyzed += 1,
            Err(error) => errors.push(format!("{}: {error:#}", candidate.file_name)),
        }
    }

    let completed_at = Utc::now().to_rfc3339();
    database.connect()?.execute(
        "UPDATE scan_runs SET completed_at = ?1, discovered = ?2, analyzed = ?3, skipped = ?4,
     failed = ?5, errors_json = ?6, status = ?7 WHERE id = ?8",
        params![
            completed_at,
            discovered as i64,
            analyzed as i64,
            skipped as i64,
            errors.len() as i64,
            serde_json::to_string(&errors)?,
            if cancelled { "cancelled" } else { "completed" },
            run_id,
        ],
    )?;

    let mut settings = database.load_settings()?;
    settings.source_folder = Some(source_path.to_string_lossy().into_owned());
    settings.last_scan_at = Some(completed_at.clone());
    database.save_settings(&settings)?;

    Ok(ScanSummary {
        run_id,
        source_path: source_path.to_string_lossy().into_owned(),
        discovered,
        analyzed,
        skipped,
        failed: errors.len(),
        completed_at,
        errors,
        cancelled,
    })
}

pub fn enumerate_images(folder: &Path) -> Result<Vec<SourceCandidate>> {
    let source_name = folder
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("screenshots")
        .to_string();
    let mut seen = HashSet::new();
    let mut assets = Vec::new();

    for entry in WalkDir::new(folder)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() || !is_supported_image(entry.path()) {
            continue;
        }
        let path = entry
            .path()
            .canonicalize()
            .unwrap_or_else(|_| entry.path().to_path_buf());
        let source_id = normalized_source_id(&path);
        if !seen.insert(source_id.clone()) {
            continue;
        }
        let metadata = fs::metadata(&path)
            .with_context(|| format!("Dosya bilgisi okunamadı: {}", path.display()))?;
        let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        let created = metadata.created().unwrap_or(modified);
        let modified_at = system_time_to_rfc3339(modified);
        let created_at = system_time_to_rfc3339(created);
        let size = metadata.len();
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("png")
            .to_lowercase();
        let mime_type = match extension.as_str() {
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            _ => "image/png",
        }
        .to_string();

        assets.push(SourceCandidate {
            source_id,
            path,
            source_name: source_name.clone(),
            file_name,
            mime_type,
            size,
            created_at,
            modified_at: modified_at.clone(),
            identity_token: format!("{size}:{}", system_time_millis(modified)),
        });
    }

    assets.sort_by(|first, second| second.created_at.cmp(&first.created_at));
    Ok(assets)
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| SUPPORTED_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn normalized_source_id(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").to_lowercase()
}

fn system_time_millis(value: SystemTime) -> u128 {
    value
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn system_time_to_rfc3339(value: SystemTime) -> String {
    DateTime::<Utc>::from(value).to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};
    use std::cell::Cell;

    #[test]
    fn enumerates_supported_images_without_duplicates() {
        let root = std::env::temp_dir().join(format!("ss-tariff-scan-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("nested")).unwrap();
        let image = ImageBuffer::from_pixel(8, 8, Rgb([12_u8, 30, 60]));
        image.save(root.join("one.png")).unwrap();
        image.save(root.join("nested").join("two.jpg")).unwrap();
        fs::write(root.join("ignore.txt"), "not an image").unwrap();

        let assets = enumerate_images(&root).unwrap();
        assert_eq!(assets.len(), 2);
        assert!(assets
            .iter()
            .all(|asset| asset.identity_token.contains(':')));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn full_scan_skips_unchanged_images_and_reanalyzes_changes() {
        let root = std::env::temp_dir().join(format!("ss-tariff-flow-{}", uuid::Uuid::new_v4()));
        let source = root.join("Screenshots");
        let thumbnails = root.join("thumbnails");
        fs::create_dir_all(&source).unwrap();
        let image_path = source.join("shoe.png");
        ImageBuffer::from_pixel(24, 24, Rgb([25_u8, 45, 80]))
            .save(&image_path)
            .unwrap();

        let database = Database::new(root.join("library.db"));
        database.migrate().unwrap();

        let first = scan_folder(&database, &thumbnails, &source, "test").unwrap();
        assert_eq!((first.discovered, first.analyzed, first.skipped), (1, 1, 0));
        let asset = database.list_assets().unwrap().pop().unwrap();
        database.update_category(&asset.id, "shopping").unwrap();
        database.update_status(&asset.id, "kept").unwrap();
        database
            .record_surface(&asset.id, "recent-archive", Some("opened"))
            .unwrap();
        let report = database.period_report(7).unwrap();
        assert_eq!((report.added, report.kept, report.resurfaced), (1, 1, 1));

        let old_date = (Utc::now() - chrono::Duration::days(30)).to_rfc3339();
        database
            .connect()
            .unwrap()
            .execute(
                "UPDATE assets SET created_at = ?1 WHERE id = ?2",
                params![old_date, asset.id],
            )
            .unwrap();
        let resurfaced = database.resurface_candidates(3).unwrap();
        assert_eq!(resurfaced.len(), 1);
        assert_eq!(resurfaced[0].item.category, "shopping");

        let second = scan_folder(&database, &thumbnails, &source, "test").unwrap();
        assert_eq!(
            (second.discovered, second.analyzed, second.skipped),
            (1, 0, 1)
        );

        std::thread::sleep(std::time::Duration::from_millis(20));
        ImageBuffer::from_pixel(25, 24, Rgb([190_u8, 45, 80]))
            .save(&image_path)
            .unwrap();
        let third = scan_folder(&database, &thumbnails, &source, "test").unwrap();
        assert_eq!((third.discovered, third.analyzed, third.skipped), (1, 1, 0));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cancelled_scan_resumes_without_repeating_completed_work() {
        let root = std::env::temp_dir().join(format!("ss-tariff-cancel-{}", uuid::Uuid::new_v4()));
        let source = root.join("Screenshots");
        let thumbnails = root.join("thumbnails");
        fs::create_dir_all(&source).unwrap();
        for index in 0..3 {
            ImageBuffer::from_pixel(20 + index, 20, Rgb([40_u8, 70, 90]))
                .save(source.join(format!("capture-{index}.png")))
                .unwrap();
        }
        let database = Database::new(root.join("library.db"));
        database.migrate().unwrap();
        let checks = Cell::new(0_u8);
        let summary = scan_folder_with_cancel(&database, &thumbnails, &source, "test", &|| {
            let current = checks.get();
            checks.set(current + 1);
            current >= 1
        })
        .unwrap();
        assert!(summary.cancelled);
        assert_eq!(summary.analyzed, 1);

        let resumed = scan_folder(&database, &thumbnails, &source, "test").unwrap();
        assert!(!resumed.cancelled);
        assert_eq!((resumed.analyzed, resumed.skipped), (2, 1));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    #[ignore = "explicit 10k archive performance verification"]
    fn unchanged_10k_archive_uses_the_bulk_index() {
        let root = std::env::temp_dir().join(format!("ss-tariff-10k-{}", uuid::Uuid::new_v4()));
        let source = root.join("Screenshots");
        fs::create_dir_all(&source).unwrap();
        for index in 0..10_000 {
            fs::write(
                source.join(format!("capture-{index:05}.png")),
                [index as u8],
            )
            .unwrap();
        }

        let candidates = enumerate_images(&source).unwrap();
        assert_eq!(candidates.len(), 10_000);
        let database = Database::new(root.join("library.db"));
        database.migrate().unwrap();
        let mut connection = database.connect().unwrap();
        let transaction = connection.transaction().unwrap();
        let now = Utc::now().to_rfc3339();
        for (index, candidate) in candidates.iter().enumerate() {
            let id = format!("asset-{index:05}");
            transaction.execute(
                "INSERT INTO assets (
                   id, source_id, source_uri, source_name, file_name, mime_type, size,
                   created_at, modified_at, identity_token, width, height, status, added_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, 0, 'active', ?11, ?11)",
                params![
                    id,
                    candidate.source_id,
                    candidate.path.to_string_lossy(),
                    candidate.source_name,
                    candidate.file_name,
                    candidate.mime_type,
                    candidate.size as i64,
                    candidate.created_at,
                    candidate.modified_at,
                    candidate.identity_token,
                    now,
                ],
            ).unwrap();
            transaction
                .execute(
                    "INSERT INTO analyses (
                   asset_id, analysis_version, category, confidence, tags_json, ocr_text,
                   ocr_engine, junk_signals_json, sensitivity, analyzed_at
                 ) VALUES (?1, ?2, 'other', 0.5, '[]', '', 'test', '[]', 'normal', ?3)",
                    params![id, crate::analysis::ANALYSIS_VERSION, now],
                )
                .unwrap();
            transaction
                .execute(
                    "INSERT INTO embeddings (asset_id, kind, model_version, dimensions, vector, created_at)
                     VALUES (?1, 'text', 'feature-hash-v1', 128, zeroblob(512), ?2)",
                    params![id, now],
                )
                .unwrap();
            transaction
                .execute(
                    "INSERT INTO asset_search (asset_id, file_name, ocr_text, tags)
                     VALUES (?1, ?2, '', '')",
                    params![id, candidate.file_name],
                )
                .unwrap();
        }
        transaction.commit().unwrap();
        drop(connection);

        let started = std::time::Instant::now();
        let summary =
            scan_folder(&database, &root.join("thumbnails"), &source, "performance").unwrap();
        let elapsed = started.elapsed();
        let index = database.analysis_index().unwrap();
        let index_payload_bytes = index
            .iter()
            .map(|(source, (token, _))| source.len() + token.len())
            .sum::<usize>();
        let checkpoint = database.connect().unwrap();
        checkpoint
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
            .unwrap();
        drop(checkpoint);
        let database_bytes = fs::metadata(root.join("library.db")).unwrap().len();
        println!(
            "10k unchanged scan: {elapsed:?}, db: {database_bytes} bytes, index payload: {index_payload_bytes} bytes"
        );
        assert_eq!(
            (summary.discovered, summary.analyzed, summary.skipped),
            (10_000, 0, 10_000)
        );
        assert!(
            elapsed < std::time::Duration::from_secs(20),
            "10k scan took {elapsed:?}"
        );
        assert!(
            database_bytes < 64 * 1024 * 1024,
            "10k database grew to {database_bytes} bytes"
        );
        assert!(
            index_payload_bytes < 8 * 1024 * 1024,
            "10k index payload grew to {index_payload_bytes} bytes"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
