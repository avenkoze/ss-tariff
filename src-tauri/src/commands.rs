use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::analysis::{cosine_similarity, embed_text};
use crate::db::Database;
use crate::models::{
    AppSnapshot, NativeAsset, NativeSettings, PeriodReport, ResurfaceCandidate, ScanSummary,
};
use crate::scanner::discover_default_source;
use crate::services::{self, RuntimeServices};

#[derive(Clone)]
pub struct AppState {
    pub database: Database,
    pub thumbnail_dir: PathBuf,
    pub services: Arc<RuntimeServices>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticResult {
    pub item: NativeAsset,
    pub score: f32,
}

#[tauri::command]
pub fn get_app_snapshot(state: State<'_, AppState>) -> Result<AppSnapshot, String> {
    let mut settings = state.database.load_settings().map_err(display_error)?;
    if settings.source_folder.is_none() {
        settings.source_folder =
            discover_default_source().map(|path| path.to_string_lossy().into_owned());
        state
            .database
            .save_settings(&settings)
            .map_err(display_error)?;
    }
    Ok(AppSnapshot {
        assets: state.database.list_assets().map_err(display_error)?,
        settings,
        database_path: state.database.path().to_string_lossy().into_owned(),
        platform: std::env::consts::OS.into(),
    })
}

#[tauri::command]
pub async fn scan_configured_folder(
    state: State<'_, AppState>,
    trigger: Option<String>,
) -> Result<ScanSummary, String> {
    let owned_state = state.inner().clone();
    let settings = owned_state
        .database
        .load_settings()
        .map_err(display_error)?;
    let source = settings
        .source_folder
        .map(PathBuf::from)
        .or_else(discover_default_source)
        .ok_or_else(|| "Önce bir screenshot klasörü seç.".to_string())?;
    let trigger = trigger.unwrap_or_else(|| "manual".into());
    let scan_trigger = trigger.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        owned_state
            .services
            .scan(&owned_state, &source, &scan_trigger)
    })
    .await
    .map_err(display_error)?
    .map_err(display_error)?;
    Ok(result)
}

#[tauri::command]
pub async fn scan_selected_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: String,
    trigger: Option<String>,
) -> Result<ScanSummary, String> {
    let owned_state = state.inner().clone();
    let source = PathBuf::from(folder);
    let trigger = trigger.unwrap_or_else(|| "manual".into());
    let result = tauri::async_runtime::spawn_blocking(move || {
        owned_state.services.scan(&owned_state, &source, &trigger)
    })
    .await
    .map_err(display_error)?
    .map_err(display_error)?;
    services::configure_watcher(app.clone(), state.inner().clone()).map_err(display_error)?;
    Ok(result)
}

#[tauri::command]
pub fn save_native_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    settings: NativeSettings,
) -> Result<(), String> {
    for time in &settings.schedule_times {
        validate_time(time)?;
    }
    state
        .database
        .save_settings(&settings)
        .map_err(display_error)?;
    services::configure_watcher(app, state.inner().clone()).map_err(display_error)
}

#[tauri::command]
pub fn update_native_status(
    state: State<'_, AppState>,
    id: String,
    status: String,
) -> Result<(), String> {
    if !["active", "kept", "trash"].contains(&status.as_str()) {
        return Err("Geçersiz durum.".into());
    }
    state
        .database
        .update_status(&id, &status)
        .map_err(display_error)
}

#[tauri::command]
pub fn cancel_native_scan(state: State<'_, AppState>) {
    state.services.cancel_scan();
}

#[tauri::command]
pub fn update_native_category(
    state: State<'_, AppState>,
    id: String,
    category: String,
) -> Result<(), String> {
    if ![
        "shopping",
        "food",
        "places",
        "chats",
        "ideas",
        "documents",
        "social",
        "junk",
        "other",
    ]
    .contains(&category.as_str())
    {
        return Err("Geçersiz kategori.".into());
    }
    state
        .database
        .update_category(&id, &category)
        .map_err(display_error)
}

#[tauri::command]
pub fn move_native_to_system_trash(
    state: State<'_, AppState>,
    id: String,
    confirmed: bool,
) -> Result<(), String> {
    if !confirmed {
        return Err("Sistem çöpüne taşıma için kullanıcı onayı gerekli.".into());
    }
    let source = state
        .database
        .source_path_for_asset(&id)
        .map_err(display_error)?
        .ok_or_else(|| "Dosya kaydı bulunamadı.".to_string())?;
    let path = PathBuf::from(&source);
    if path.exists() {
        trash::delete(&path).map_err(display_error)?;
    }
    state.database.mark_deleted(&id).map_err(display_error)
}

#[tauri::command]
pub fn semantic_search(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SemanticResult>, String> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let query_embedding = embed_text(query);
    let mut scores: Vec<(String, f32)> = state
        .database
        .embedding_rows()
        .map_err(display_error)?
        .into_iter()
        .map(|(id, embedding)| (id, cosine_similarity(&query_embedding, &embedding)))
        .collect();
    scores.sort_by(|first, second| second.1.total_cmp(&first.1));
    let mut assets: HashMap<String, NativeAsset> = state
        .database
        .list_assets()
        .map_err(display_error)?
        .into_iter()
        .map(|asset| (asset.id.clone(), asset))
        .collect();
    Ok(scores
        .into_iter()
        .filter(|(_, score)| *score > 0.05)
        .take(limit.unwrap_or(50).min(200))
        .filter_map(|(id, score)| {
            assets
                .remove(&id)
                .map(|item| SemanticResult { item, score })
        })
        .collect())
}

#[tauri::command]
pub fn record_resurface_response(
    state: State<'_, AppState>,
    id: String,
    response: Option<String>,
) -> Result<(), String> {
    state
        .database
        .record_surface(&id, "recent-archive", response.as_deref())
        .map_err(display_error)
}

#[tauri::command]
pub fn get_period_report(
    state: State<'_, AppState>,
    days: Option<u32>,
) -> Result<PeriodReport, String> {
    state
        .database
        .period_report(days.unwrap_or(7))
        .map_err(display_error)
}

#[tauri::command]
pub fn get_resurface_candidates(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<ResurfaceCandidate>, String> {
    state
        .database
        .resurface_candidates(limit.unwrap_or(3))
        .map_err(display_error)
}

fn validate_time(value: &str) -> Result<(), String> {
    let (hours, minutes) = value
        .split_once(':')
        .ok_or_else(|| format!("Geçersiz tarama saati: {value}"))?;
    let hours: u8 = hours
        .parse()
        .map_err(|_| format!("Geçersiz tarama saati: {value}"))?;
    let minutes: u8 = minutes
        .parse()
        .map_err(|_| format!("Geçersiz tarama saati: {value}"))?;
    if hours > 23 || minutes > 59 {
        return Err(format!("Geçersiz tarama saati: {value}"));
    }
    Ok(())
}

fn display_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}
