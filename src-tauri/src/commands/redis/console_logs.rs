async fn append_redis_command_log(
    state: &AppState,
    command: String,
    connection_id: i64,
    database: Option<String>,
    success: bool,
    error: Option<String>,
) {
    let db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };

    if let Some(local_db) = db {
        if let Err(e) = local_db
            .insert_redis_command_log(command, Some(connection_id), database, success, error)
            .await
        {
            eprintln!("[REDIS_LOG_APPEND_ERROR] {}", e);
        }
    }
}

#[tauri::command]
pub async fn redis_execute_raw(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    command: String,
) -> Result<RedisRawResult, String> {
    let result = with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::execute_raw(conn, command.clone()))
    })
    .await;

    match &result {
        Ok(_) => {
            append_redis_command_log(&state, command, id, database, true, None).await;
        }
        Err(e) => {
            append_redis_command_log(&state, command, id, database, false, Some(e.clone())).await;
        }
    }

    result
}
#[tauri::command]
pub async fn redis_server_info(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
) -> Result<RedisServerInfo, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::server_info(conn))
    })
    .await
}

#[tauri::command]
pub async fn redis_server_config(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
) -> Result<HashMap<String, String>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::server_config(conn))
    })
    .await
}

#[tauri::command]
pub async fn redis_slowlog_get(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    count: Option<i64>,
) -> Result<Vec<RedisSlowlogEntry>, String> {
    let n = count.unwrap_or(50);
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::slowlog_get(conn, n))
    })
    .await
}

fn clamp_redis_command_logs_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(100).clamp(1, 100)
}

#[tauri::command]
pub async fn list_redis_command_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<RedisCommandLog>, String> {
    let safe_limit = clamp_redis_command_logs_limit(limit);
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };

    if let Some(db) = local_db {
        db.list_redis_command_logs(safe_limit).await
    } else {
        Err("Local DB not initialized".to_string())
    }
}
