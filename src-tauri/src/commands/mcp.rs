use crate::error::AppError;
use crate::mcp::tools::get_tool_definitions;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

fn home_dir() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_default()
}

const DEFAULT_TRANSPORT: &str = "stdio";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub transport: String,
    pub port: Option<u16>,
    pub host: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    pub port: u16,
    pub host: String,
    pub transport: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedClient {
    pub name: String,
    pub path: String,
    pub exists: bool,
    pub configured: bool,
}

fn find_mcp_binary(app_handle: &AppHandle) -> Option<PathBuf> {
    // 1. Resource dir
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let path = resource_dir.join("dbpaw-mcp");
        if path.exists() {
            return Some(path);
        }
    }

    // 2. CARGO_MANIFEST_DIR / target/debug
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let path = PathBuf::from(manifest_dir)
            .join("target")
            .join("debug")
            .join("dbpaw-mcp");
        if path.exists() {
            return Some(path);
        }
    }

    // 3. Current exe parent
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let path = parent.join("dbpaw-mcp");
            if path.exists() {
                return Some(path);
            }
        }
    }

    None
}

fn get_claude_config_path() -> PathBuf {
    home_dir()
        .join("Library")
        .join("Application Support")
        .join("Claude")
        .join("claude_desktop_config.json")
}

fn get_cursor_config_path() -> PathBuf {
    home_dir().join(".cursor").join("mcp.json")
}

fn get_windsurf_config_path() -> PathBuf {
    home_dir()
        .join(".codeium")
        .join("windsurf")
        .join("mcp_config.json")
}

fn check_client_config(path: &PathBuf, configured: bool) -> bool {
    if let Ok(content) = std::fs::read_to_string(path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(servers) = json.get("mcpServers") {
                return servers.get("dbpaw").is_some();
            }
        }
    }
    configured
}

#[tauri::command]
pub async fn mcp_status(state: State<'_, AppState>) -> Result<McpStatus, String> {
    let mut status = McpStatus {
        running: false,
        pid: None,
        transport: DEFAULT_TRANSPORT.to_string(),
        port: None,
        host: None,
    };

    let mut lock = state.mcp_process.lock().await;
    if let Some(ref mut child) = *lock {
        match child.try_wait() {
            Ok(Some(_)) => {
                // Process exited
                *lock = None;
            }
            Ok(None) => {
                status.running = true;
                status.pid = child.id();
            }
            Err(e) => {
                return Err(AppError::internal(format!("Failed to check process status: {}", e)).into());
            }
        }
    }

    Ok(status)
}

#[tauri::command]
pub async fn mcp_start(
    app_handle: AppHandle,
    state: State<'_, AppState>,
    config: McpConfig,
) -> Result<McpStatus, String> {
    // Check if already running
    {
        let mut lock = state.mcp_process.lock().await;
        if let Some(ref mut child) = *lock {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *lock = None;
                }
                Ok(None) => {
                    return Err(AppError::already_exists("MCP server is already running").into());
                }
                Err(e) => {
                    return Err(AppError::internal(format!("Failed to check process status: {}", e)).into());
                }
            }
        }
    }

    let binary_path =
        find_mcp_binary(&app_handle).ok_or_else(|| AppError::not_found("MCP server binary not found"))?;

    let child = tokio::process::Command::new(&binary_path)
        .arg("--port")
        .arg(config.port.to_string())
        .arg("--host")
        .arg(&config.host)
        .arg("--transport")
        .arg(&config.transport)
        .spawn()
        .map_err(|e| AppError::internal(format!("Failed to start MCP server: {}", e)))?;

    let mut lock = state.mcp_process.lock().await;
    let pid = child.id().unwrap_or(0);
    *lock = Some(child);

    Ok(McpStatus {
        running: true,
        pid: Some(pid),
        transport: config.transport,
        port: Some(config.port),
        host: Some(config.host),
    })
}

#[tauri::command]
pub async fn mcp_stop(state: State<'_, AppState>) -> Result<McpStatus, String> {
    let mut lock = state.mcp_process.lock().await;
    if let Some(mut child) = lock.take() {
        child
            .kill()
            .await
            .map_err(|e| AppError::internal(format!("Failed to stop MCP server: {}", e)))?;
        // Wait for the process to be reaped (prevents zombie processes)
        let _ = child.wait().await;
    }

    Ok(McpStatus {
        running: false,
        pid: None,
        transport: DEFAULT_TRANSPORT.to_string(),
        port: None,
        host: None,
    })
}

#[tauri::command]
pub async fn mcp_get_tools() -> Result<Vec<ToolInfo>, String> {
    let definitions = get_tool_definitions();
    let tools = definitions
        .into_iter()
        .map(|d| ToolInfo {
            name: d.name,
            description: d.description,
        })
        .collect();
    Ok(tools)
}

#[tauri::command]
pub async fn mcp_detect_clients() -> Result<Vec<DetectedClient>, String> {
    let claude_path = get_claude_config_path();
    let cursor_path = get_cursor_config_path();
    let windsurf_path = get_windsurf_config_path();

    let clients = vec![
        DetectedClient {
            name: "Claude Desktop".to_string(),
            path: claude_path.to_string_lossy().to_string(),
            exists: claude_path.exists(),
            configured: check_client_config(&claude_path, false),
        },
        DetectedClient {
            name: "Cursor".to_string(),
            path: cursor_path.to_string_lossy().to_string(),
            exists: cursor_path.exists(),
            configured: check_client_config(&cursor_path, false),
        },
        DetectedClient {
            name: "Windsurf".to_string(),
            path: windsurf_path.to_string_lossy().to_string(),
            exists: windsurf_path.exists(),
            configured: check_client_config(&windsurf_path, false),
        },
    ];

    Ok(clients)
}

#[tauri::command]
pub async fn mcp_configure_client(
    app_handle: AppHandle,
    client_name: String,
) -> Result<String, String> {
    let binary_path =
        find_mcp_binary(&app_handle).ok_or_else(|| AppError::not_found("MCP server binary not found"))?;
    let binary_str = binary_path.to_string_lossy().to_string();

    let config_path = match client_name.as_str() {
        "Claude Desktop" => get_claude_config_path(),
        "Cursor" => get_cursor_config_path(),
        "Windsurf" => get_windsurf_config_path(),
        _ => return Err(AppError::validation(format!("Unknown MCP client: {}", client_name)).into()),
    };

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::internal(format!("Failed to create config directory: {}", e)))?;
    }

    // Read existing config or start fresh
    let mut json: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| AppError::internal(format!("Failed to read MCP config: {}", e)))?;
        serde_json::from_str(&content).map_err(|e| AppError::internal(format!("Failed to parse MCP config: {}", e)))?
    } else {
        serde_json::json!({})
    };

    // Ensure mcpServers object exists
    if json.get("mcpServers").is_none() {
        json["mcpServers"] = serde_json::json!({});
    }

    // Add/update dbpaw entry
    json["mcpServers"]["dbpaw"] = serde_json::json!({
        "command": binary_str,
        "args": []
    });

    let content = serde_json::to_string_pretty(&json)
        .map_err(|e| AppError::internal(format!("Failed to serialize MCP config: {}", e)))?;

    std::fs::write(&config_path, content)
        .map_err(|e| AppError::internal(format!("Failed to write MCP config: {}", e)))?;

    Ok(format!("Configured {} for DbPaw MCP", client_name))
}

#[macro_export]
macro_rules! mcp_commands {
    () => {
        $crate::commands::mcp::mcp_status,
        $crate::commands::mcp::mcp_start,
        $crate::commands::mcp::mcp_stop,
        $crate::commands::mcp::mcp_get_tools,
        $crate::commands::mcp::mcp_detect_clients,
        $crate::commands::mcp::mcp_configure_client,
    };
}
