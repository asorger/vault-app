pub mod commands;
pub mod crypto;
pub mod db;
pub mod error;
pub mod protocol;
pub mod vfs;

use std::path::Path;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Register per-user .vault file association so double-clicking .vault files opens the app
    commands::register_vault_file_association();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Focus and unminimize the existing window when a second instance is invoked
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }

            // If launched with a .vault file path, emit an event so the frontend opens it in a new tab
            for arg in args.iter().skip(1) {
                if arg.starts_with('-') {
                    continue;
                }
                let path = Path::new(arg);
                if let Some(resolved) = commands::resolve_vault_directory(path) {
                    let user_facing = commands::vault_user_facing_path(&resolved)
                        .to_string_lossy()
                        .to_string();
                    let _ = app.emit("vault://open-vault-request", user_facing);
                    break;
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::new())
        .register_uri_scheme_protocol("vault", protocol::handle_vault_request)
        .invoke_handler(tauri::generate_handler![
            commands::is_shift_key_pressed,
            commands::is_outbound_dragging,
            commands::get_startup_vault_path,
            commands::check_is_vault_path,
            commands::create_vault_instance,
            commands::open_vault_instance,
            commands::lock_vault_instance,
            commands::list_directory,
            commands::create_virtual_folder,
            commands::rename_virtual_item,
            commands::move_virtual_items,
            commands::delete_virtual_items,
            commands::ingest_os_paths,
            commands::export_virtual_items,
            commands::start_os_drag_export,
            commands::read_file_text_preview,
            commands::search_vault,
            commands::get_vault_compression,
            commands::set_vault_compression,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } = event {
            let state = app_handle.state::<commands::AppState>();
            if let Ok(mut sessions) = state.sessions.lock() {
                for (_, vault_arc) in sessions.drain() {
                    let _ = commands::close_vault_arc(vault_arc);
                }
            }
            if let Ok(mut guard) = state.session.lock() {
                if let Some(session) = guard.take() {
                    commands::cleanup_staging_dir(&session.vault_path);
                    let vault_path = session.vault_path.clone();
                    let is_single = session.is_single_file();
                    let _ = db::lock_db(session.conn);
                    if is_single {
                        vfs::cleanup_wal_shm_files(&vault_path);
                    }
                }
            };
        }
    });
}
