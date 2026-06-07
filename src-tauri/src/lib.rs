#![recursion_limit = "256"]

use crate::db::local::LocalDb;
use crate::state::AppState;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_menu_event(|app, event| {
            if event.id() == "settings" {
                let _ = app.emit("open-settings", ());
            } else if event.id() == "debug_reload" {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.reload();
                }
            } else if event.id() == "debug_toggle_devtools" {
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_devtools_open() {
                        window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
            }
        })
        .manage(AppState::new())
        .setup(|app| {
            let handle = app.handle().clone();

            // Initialize Oracle Instant Client library path
            // This must be done before any Oracle connections are made
            init_oracle_lib_path(&handle);

            // Explicitly restore window state on Windows as a workaround for upstream timing issues
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.restore_state(StateFlags::all());
            }

            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
                // Use a closure to handle potential errors gracefully
                if let Err(e) = (|| -> tauri::Result<()> {
                    let app_menu = Submenu::new(&handle, "App", true)?;
                    let edit_menu = Submenu::new(&handle, "Edit", true)?;
                    let developer_menu = Submenu::new(&handle, "Developer", true)?;

                    let about = PredefinedMenuItem::about(&handle, None, None)?;
                    let settings = MenuItem::with_id(
                        &handle,
                        "settings",
                        "Settings...",
                        true,
                        Some("CmdOrCtrl+,"),
                    )?;
                    let separator = PredefinedMenuItem::separator(&handle)?;
                    let services = PredefinedMenuItem::services(&handle, None)?;
                    let hide = PredefinedMenuItem::hide(&handle, None)?;
                    let hide_others = PredefinedMenuItem::hide_others(&handle, None)?;
                    let show_all = PredefinedMenuItem::show_all(&handle, None)?;
                    let quit = PredefinedMenuItem::quit(&handle, None)?;

                    app_menu.append(&about)?;
                    app_menu.append(&separator)?;
                    app_menu.append(&settings)?;
                    app_menu.append(&separator)?;
                    app_menu.append(&services)?;
                    app_menu.append(&separator)?;
                    app_menu.append(&hide)?;
                    app_menu.append(&hide_others)?;
                    app_menu.append(&show_all)?;
                    app_menu.append(&separator)?;
                    app_menu.append(&quit)?;

                    let undo = PredefinedMenuItem::undo(&handle, None)?;
                    let redo = PredefinedMenuItem::redo(&handle, None)?;
                    let cut = PredefinedMenuItem::cut(&handle, None)?;
                    let copy = PredefinedMenuItem::copy(&handle, None)?;
                    let paste = PredefinedMenuItem::paste(&handle, None)?;
                    let select_all = PredefinedMenuItem::select_all(&handle, None)?;
                    let reload = MenuItem::with_id(
                        &handle,
                        "debug_reload",
                        "Reload",
                        true,
                        Some("CmdOrCtrl+R"),
                    )?;
                    let toggle_devtools = MenuItem::with_id(
                        &handle,
                        "debug_toggle_devtools",
                        "Toggle DevTools",
                        true,
                        Some("Alt+CmdOrCtrl+I"),
                    )?;

                    edit_menu.append(&undo)?;
                    edit_menu.append(&redo)?;
                    edit_menu.append(&separator)?;
                    edit_menu.append(&cut)?;
                    edit_menu.append(&copy)?;
                    edit_menu.append(&paste)?;
                    edit_menu.append(&select_all)?;

                    developer_menu.append(&reload)?;
                    developer_menu.append(&toggle_devtools)?;

                    let menu =
                        Menu::with_items(&handle, &[&app_menu, &edit_menu, &developer_menu])?;
                    app.set_menu(menu)?;
                    Ok(())
                })() {
                    eprintln!("Error setting up menu: {}", e);
                }
            }

            // Initialize local database (blocking to avoid race conditions)
            let handle_for_cleanup = handle.clone();
            tauri::async_runtime::block_on(async move {
                let state = handle.state::<AppState>();
                match LocalDb::init(&handle).await {
                    Ok(db) => {
                        let mut lock = state.local_db.lock().await;
                        *lock = Some(Arc::new(db));
                        println!("Local DB initialized successfully");
                    }
                    Err(e) => {
                        eprintln!("Failed to initialize local DB: {}", e);
                        // Make the error visible in the frontend if possible, or at least easier to debug
                    }
                }
            });

            // Start connection pool cleanup task
            tauri::async_runtime::spawn(async move {
                let state = handle_for_cleanup.state::<AppState>();
                state.pool_manager.start_cleanup_task().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            connection_commands!(),
            metadata_commands!(),
            query_commands!(),
            storage_commands!(),
            ai_commands!(),
            transfer_commands!(),
            redis_commands!(),
            elasticsearch_commands!(),
            mongodb_commands!(),
            system_commands!(),
            mcp_commands!(),
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        tauri::RunEvent::Exit => {
            let _ = app_handle.save_window_state(StateFlags::all());
            let state = app_handle.state::<AppState>();
            tauri::async_runtime::block_on(async {
                // Kill MCP server process if running
                let mut lock = state.mcp_process.lock().await;
                if let Some(mut child) = lock.take() {
                    let _ = child.kill().await;
                }
                state.pool_manager.close_all().await;
            });
        }
        _ => {}
    });
}

pub mod ai;
pub mod commands;
pub mod connection_input;
pub mod datasources;
pub mod db;
pub mod error;
pub mod events;
pub mod import;
pub mod mcp;
pub mod models;
pub mod sql;
pub mod ssh;
pub mod state;
pub mod utils;

/// Initialize Oracle Instant Client library path from bundled resources.
///
/// On macOS: sets DYLD_LIBRARY_PATH (works in dev mode, bypassed in hardened runtime)
/// On Linux: sets LD_LIBRARY_PATH
/// On Windows: adds to PATH
///
/// For hardened macOS builds, the library is loaded directly from the resource path.
fn init_oracle_lib_path(app_handle: &tauri::AppHandle) {
    // Try to get resource directory
    let resource_dir = match app_handle.path().resource_dir() {
        Ok(dir) => dir,
        Err(_) => return,
    };

    let oracle_dir = resource_dir.join("oracle");
    if !oracle_dir.exists() {
        // Oracle libraries not bundled, skip initialization
        return;
    }

    let oracle_path = oracle_dir.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        // For macOS, we need to set DYLD_LIBRARY_PATH
        // Note: This only works in dev mode. In production with hardened runtime,
        // the library must be loaded via absolute path or @rpath
        let current = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();
        let new_path = if current.is_empty() {
            oracle_path.clone()
        } else {
            format!("{}:{}", oracle_path, current)
        };
        unsafe {
            std::env::set_var("DYLD_LIBRARY_PATH", &new_path);
        }
        println!("Oracle: Set DYLD_LIBRARY_PATH to include {}", oracle_path);
    }

    #[cfg(target_os = "linux")]
    {
        let current = std::env::var("LD_LIBRARY_PATH").unwrap_or_default();
        let new_path = if current.is_empty() {
            oracle_path.clone()
        } else {
            format!("{}:{}", oracle_path, current)
        };
        unsafe {
            std::env::set_var("LD_LIBRARY_PATH", &new_path);
        }
        println!("Oracle: Set LD_LIBRARY_PATH to include {}", oracle_path);
    }

    #[cfg(target_os = "windows")]
    {
        let current = std::env::var("PATH").unwrap_or_default();
        let new_path = if current.is_empty() {
            oracle_path.clone()
        } else {
            format!("{};{}", oracle_path, current)
        };
        unsafe {
            std::env::set_var("PATH", &new_path);
        }
        println!("Oracle: Added to PATH: {}", oracle_path);
    }

    // Also set ORACLE_HOME if not already set
    if std::env::var("ORACLE_HOME").is_err() {
        unsafe {
            std::env::set_var("ORACLE_HOME", &oracle_path);
        }
        println!("Oracle: Set ORACLE_HOME to {}", oracle_path);
    }
}
