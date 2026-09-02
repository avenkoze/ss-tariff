mod analysis;
mod commands;
mod db;
mod models;
mod scanner;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            let database = db::Database::new(data_dir.join("ss-tariff.db"));
            database.migrate().map_err(|error| error.to_string())?;
            app.manage(commands::AppState {
                database,
                thumbnail_dir: data_dir.join("thumbnails"),
            });
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
