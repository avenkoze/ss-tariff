use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

#[cfg(desktop)]
use std::path::PathBuf;
#[cfg(desktop)]
use std::sync::mpsc;
#[cfg(desktop)]
use std::thread;
#[cfg(desktop)]
use std::time::Duration;

use anyhow::Result;
use tauri::AppHandle;

#[cfg(desktop)]
use anyhow::Context;
#[cfg(desktop)]
use chrono::{Datelike, Local, Timelike, Weekday};
#[cfg(desktop)]
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
#[cfg(desktop)]
use tauri::Emitter;
#[cfg(desktop)]
use tauri_plugin_notification::NotificationExt;

use crate::commands::AppState;
use crate::models::ScanSummary;
use crate::scanner::scan_folder_with_cancel;

#[cfg(desktop)]
use crate::scanner::discover_default_source;

#[derive(Default)]
pub struct RuntimeServices {
    #[cfg(desktop)]
    watcher: Mutex<Option<RecommendedWatcher>>,
    scan_lock: Mutex<()>,
    #[cfg(desktop)]
    last_schedule_slot: Mutex<Option<String>>,
    cancel_requested: AtomicBool,
}

impl RuntimeServices {
    pub fn scan(&self, state: &AppState, source: &Path, trigger: &str) -> Result<ScanSummary> {
        let _guard = self
            .scan_lock
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        self.cancel_requested.store(false, Ordering::Release);
        scan_folder_with_cancel(
            &state.database,
            &state.thumbnail_dir,
            source,
            trigger,
            &|| self.cancel_requested.load(Ordering::Acquire),
        )
    }

    pub fn cancel_scan(&self) {
        self.cancel_requested.store(true, Ordering::Release);
    }

    #[cfg(desktop)]
    fn claim_schedule_slot(&self, slot: String) -> bool {
        let mut current = self
            .last_schedule_slot
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if current.as_ref() == Some(&slot) {
            return false;
        }
        *current = Some(slot);
        true
    }
}

#[cfg(desktop)]
pub fn start(app: AppHandle, state: AppState) -> Result<()> {
    configure_watcher(app.clone(), state.clone())?;
    start_scheduler(app.clone(), state.clone());

    let settings = state.database.load_settings()?;
    if settings.scan_on_startup && configured_source(&state).is_some() {
        spawn_configured_scan(app, state, "startup");
    }
    Ok(())
}

#[cfg(mobile)]
pub fn start(_app: AppHandle, _state: AppState) -> Result<()> {
    Ok(())
}

#[cfg(desktop)]
pub fn configure_watcher(app: AppHandle, state: AppState) -> Result<()> {
    let settings = state.database.load_settings()?;
    let mut watcher_slot = state
        .services
        .watcher
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    *watcher_slot = None;

    if !settings.watch_folder {
        return Ok(());
    }
    let Some(source) = configured_source(&state) else {
        return Ok(());
    };

    let (sender, receiver) = mpsc::channel();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = sender.send(event);
    })?;
    watcher
        .watch(&source, RecursiveMode::Recursive)
        .with_context(|| format!("{} klasörü izlenemedi", source.display()))?;
    *watcher_slot = Some(watcher);
    drop(watcher_slot);

    thread::spawn(move || watch_events(receiver, app, state, source));
    Ok(())
}

#[cfg(mobile)]
pub fn configure_watcher(_app: AppHandle, _state: AppState) -> Result<()> {
    Ok(())
}

#[cfg(desktop)]
pub fn spawn_configured_scan(app: AppHandle, state: AppState, trigger: &'static str) {
    thread::spawn(move || {
        let Some(source) = configured_source(&state) else {
            return;
        };
        match state.services.scan(&state, &source, trigger) {
            Ok(summary) => publish_scan(&app, &state, &summary, trigger != "manual"),
            Err(error) => {
                let _ = app.emit("native-scan-error", error.to_string());
            }
        }
    });
}

#[cfg(desktop)]
pub fn publish_scan(app: &AppHandle, state: &AppState, summary: &ScanSummary, notify_user: bool) {
    let _ = app.emit("native-library-changed", summary);
    if !notify_user || summary.analyzed == 0 {
        return;
    }
    let notifications_enabled = state
        .database
        .load_settings()
        .map(|settings| settings.notifications_enabled)
        .unwrap_or(false);
    if notifications_enabled {
        let _ = app
            .notification()
            .builder()
            .title("SS TARIFF")
            .body(format!(
                "{} yeni veya değişen screenshot düzenlendi.",
                summary.analyzed
            ))
            .show();
    }
}

#[cfg(desktop)]
fn watch_events(
    receiver: mpsc::Receiver<notify::Result<Event>>,
    app: AppHandle,
    state: AppState,
    source: PathBuf,
) {
    while let Ok(event) = receiver.recv() {
        if !event_is_relevant(&event) {
            continue;
        }

        while receiver.recv_timeout(Duration::from_millis(900)).is_ok() {}

        match state.services.scan(&state, &source, "watch-event") {
            Ok(summary) => publish_scan(&app, &state, &summary, true),
            Err(error) => {
                let _ = app.emit("native-scan-error", error.to_string());
            }
        }
    }
}

#[cfg(desktop)]
fn start_scheduler(app: AppHandle, state: AppState) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(20));
        let Ok(settings) = state.database.load_settings() else {
            continue;
        };
        let now = Local::now();
        maybe_publish_period_report(&app, &state, now);
        let local_time = now.format("%H:%M").to_string();
        if !settings
            .schedule_times
            .iter()
            .any(|time| time == &local_time)
        {
            continue;
        }
        let slot = format!("{}-{local_time}", now.format("%Y-%m-%d"));
        if !state.services.claim_schedule_slot(slot) {
            continue;
        }
        let Some(source) = configured_source(&state) else {
            continue;
        };
        match state.services.scan(&state, &source, "scheduled") {
            Ok(summary) => publish_scan(&app, &state, &summary, true),
            Err(error) => {
                let _ = app.emit("native-scan-error", error.to_string());
            }
        }
    });
}

#[cfg(desktop)]
fn maybe_publish_period_report(app: &AppHandle, state: &AppState, now: chrono::DateTime<Local>) {
    if now.hour() < 9 {
        return;
    }
    let report = if now.day() == 1 {
        Some(("monthly_report_slot", 30_u32, "Aylık özet"))
    } else if now.weekday() == Weekday::Mon {
        Some(("weekly_report_slot", 7_u32, "Haftalık özet"))
    } else {
        None
    };
    let Some((setting_key, days, title)) = report else {
        return;
    };
    let slot = now.format("%Y-%m-%d").to_string();
    if state
        .database
        .get_setting(setting_key)
        .ok()
        .flatten()
        .as_deref()
        == Some(slot.as_str())
    {
        return;
    }
    let settings = match state.database.load_settings() {
        Ok(settings) if settings.notifications_enabled => settings,
        _ => return,
    };
    let Ok(report) = state.database.period_report(days) else {
        return;
    };
    let _ = app.emit("native-period-report", &report);
    let _ = app
        .notification()
        .builder()
        .title(format!("SS TARIFF · {title}"))
        .body(format!(
            "{} yeni kayıt, {} temizleme kararı, {} kazanım.",
            report.added,
            report.queued_for_cleanup,
            format_bytes(report.reclaimed_bytes)
        ))
        .show();
    let _ = state.database.set_setting(setting_key, &slot);
    drop(settings);
}

#[cfg(desktop)]
fn format_bytes(bytes: u64) -> String {
    if bytes >= 1_073_741_824 {
        format!("{:.1} GB", bytes as f64 / 1_073_741_824.0)
    } else if bytes >= 1_048_576 {
        format!("{:.1} MB", bytes as f64 / 1_048_576.0)
    } else if bytes >= 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{bytes} B")
    }
}

#[cfg(desktop)]
fn configured_source(state: &AppState) -> Option<PathBuf> {
    state
        .database
        .load_settings()
        .ok()
        .and_then(|settings| settings.source_folder.map(PathBuf::from))
        .or_else(discover_default_source)
}

#[cfg(desktop)]
fn event_is_relevant(event: &notify::Result<Event>) -> bool {
    event.as_ref().is_ok_and(|event| {
        event
            .paths
            .iter()
            .any(|path| is_supported_image(path.as_path()))
    })
}

#[cfg(desktop)]
fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp"
            )
        })
}

#[cfg(all(test, desktop))]
mod tests {
    use super::*;

    #[test]
    fn ignores_unrelated_watcher_events() {
        let image = Event {
            paths: vec![PathBuf::from("capture.PNG")],
            ..Event::default()
        };
        let text = Event {
            paths: vec![PathBuf::from("notes.txt")],
            ..Event::default()
        };
        assert!(event_is_relevant(&Ok(image)));
        assert!(!event_is_relevant(&Ok(text)));
    }

    #[test]
    fn schedule_slot_can_only_be_claimed_once() {
        let services = RuntimeServices::default();
        assert!(services.claim_schedule_slot("2026-09-02-12:00".into()));
        assert!(!services.claim_schedule_slot("2026-09-02-12:00".into()));
        assert!(services.claim_schedule_slot("2026-09-02-20:00".into()));
    }

    #[test]
    fn formats_report_storage_without_rounding_to_zero() {
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert_eq!(format_bytes(2_097_152), "2.0 MB");
    }
}
