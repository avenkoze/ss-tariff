use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};
use chrono::Local;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};
use tauri_plugin_notification::NotificationExt;

use crate::commands::AppState;
use crate::models::ScanSummary;
use crate::scanner::{discover_default_source, scan_folder};

#[derive(Default)]
pub struct RuntimeServices {
    watcher: Mutex<Option<RecommendedWatcher>>,
    scan_lock: Mutex<()>,
    last_schedule_slot: Mutex<Option<String>>,
}

impl RuntimeServices {
    pub fn scan(&self, state: &AppState, source: &Path, trigger: &str) -> Result<ScanSummary> {
        let _guard = self
            .scan_lock
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        scan_folder(&state.database, &state.thumbnail_dir, source, trigger)
    }

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

pub fn start(app: AppHandle, state: AppState) -> Result<()> {
    configure_watcher(app.clone(), state.clone())?;
    start_scheduler(app.clone(), state.clone());

    let settings = state.database.load_settings()?;
    if settings.scan_on_startup && configured_source(&state).is_some() {
        spawn_configured_scan(app, state, "startup");
    }
    Ok(())
}

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

fn start_scheduler(app: AppHandle, state: AppState) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(20));
        let Ok(settings) = state.database.load_settings() else {
            continue;
        };
        let now = Local::now();
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

fn configured_source(state: &AppState) -> Option<PathBuf> {
    state
        .database
        .load_settings()
        .ok()
        .and_then(|settings| settings.source_folder.map(PathBuf::from))
        .or_else(discover_default_source)
}

fn event_is_relevant(event: &notify::Result<Event>) -> bool {
    event.as_ref().is_ok_and(|event| {
        event
            .paths
            .iter()
            .any(|path| is_supported_image(path.as_path()))
    })
}

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

#[cfg(test)]
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
}
