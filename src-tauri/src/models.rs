use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct SourceCandidate {
    pub source_id: String,
    pub path: PathBuf,
    pub source_name: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: u64,
    pub created_at: String,
    pub modified_at: String,
    pub identity_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAsset {
    pub id: String,
    pub source_id: String,
    pub source_uri: String,
    pub name: String,
    pub category: String,
    pub confidence: f64,
    pub tags: Vec<String>,
    pub extracted_text: String,
    pub created_at: String,
    pub added_at: String,
    pub width: u32,
    pub height: u32,
    pub size: u64,
    pub hash: Option<String>,
    pub average_color: Option<String>,
    pub visual_fingerprint: Option<VisualFingerprint>,
    pub junk_signals: Vec<String>,
    pub duplicate_group: Option<String>,
    pub status: String,
    pub analyzer: String,
    pub thumbnail_path: Option<String>,
    pub analysis_version: u32,
    pub last_analyzed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualFingerprint {
    pub mean_luminance: f64,
    pub luminance_deviation: f64,
    pub dark_pixel_ratio: f64,
    pub bright_pixel_ratio: f64,
}

#[derive(Debug, Clone)]
pub struct NativeAnalysis {
    pub category: String,
    pub confidence: f64,
    pub tags: Vec<String>,
    pub extracted_text: String,
    pub width: u32,
    pub height: u32,
    pub content_hash: String,
    pub perceptual_hash: String,
    pub average_color: String,
    pub visual_fingerprint: VisualFingerprint,
    pub junk_signals: Vec<String>,
    pub sensitivity: String,
    pub thumbnail_path: String,
    pub embedding: Vec<f32>,
    pub ocr_engine: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub run_id: String,
    pub source_path: String,
    pub discovered: usize,
    pub analyzed: usize,
    pub skipped: usize,
    pub failed: usize,
    pub completed_at: String,
    pub errors: Vec<String>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct NativeSettings {
    pub source_folder: Option<String>,
    pub scan_on_startup: bool,
    pub watch_folder: bool,
    pub notifications_enabled: bool,
    pub schedule_times: Vec<String>,
    pub last_scan_at: Option<String>,
    pub launch_at_login: bool,
}

impl Default for NativeSettings {
    fn default() -> Self {
        Self {
            source_folder: None,
            scan_on_startup: true,
            watch_folder: true,
            notifications_enabled: true,
            schedule_times: vec!["12:00".into(), "20:00".into()],
            last_scan_at: None,
            launch_at_login: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub assets: Vec<NativeAsset>,
    pub settings: NativeSettings,
    pub database_path: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryCount {
    pub category: String,
    pub count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodReport {
    pub period_days: u32,
    pub from: String,
    pub to: String,
    pub added: u64,
    pub kept: u64,
    pub queued_for_cleanup: u64,
    pub deleted: u64,
    pub reclaimed_bytes: u64,
    pub junk_candidates: u64,
    pub duplicate_candidates: u64,
    pub resurfaced: u64,
    pub categories: Vec<CategoryCount>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResurfaceCandidate {
    pub item: NativeAsset,
    pub reason: String,
    pub score: f64,
}
