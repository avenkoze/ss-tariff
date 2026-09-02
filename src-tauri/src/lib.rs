mod analysis;
mod commands;
mod db;
mod models;
mod scanner;
mod services;

use tauri::Manager;

#[cfg(desktop)]
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(desktop)]
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "SS TARIFF'i aç", true, None::<&str>)?;
    let scan = MenuItem::with_id(app, "scan", "Şimdi tara", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Çık", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &scan, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("SS TARIFF")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            "scan" => {
                let state = app.state::<commands::AppState>().inner().clone();
                services::spawn_configured_scan(app.clone(), state, "tray");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            let database = db::Database::new(data_dir.join("ss-tariff.db"));
            database.migrate().map_err(|error| error.to_string())?;
            app.manage(commands::AppState {
                database,
                thumbnail_dir: data_dir.join("thumbnails"),
                services: std::sync::Arc::new(services::RuntimeServices::default()),
            });
            #[cfg(desktop)]
            setup_tray(app)?;
            let state = app.state::<commands::AppState>().inner().clone();
            services::start(app.handle().clone(), state)?;
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_snapshot,
            commands::scan_configured_folder,
            commands::scan_selected_folder,
            commands::save_native_settings,
            commands::update_native_status,
            commands::move_native_to_system_trash,
            commands::semantic_search,
            commands::record_resurface_response,
        ])
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
