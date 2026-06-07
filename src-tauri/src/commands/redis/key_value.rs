#[tauri::command]
pub async fn redis_get_key(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
) -> Result<RedisKeyValue, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::get_key(conn, key.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_set_key(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    payload: RedisSetKeyPayload,
) -> Result<RedisMutationResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::set_key(conn, payload.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_update_key(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    payload: RedisSetKeyPayload,
) -> Result<RedisMutationResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::set_key(conn, payload.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_delete_key(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
) -> Result<RedisMutationResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::delete_key(conn, key.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_patch_key(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    payload: RedisKeyPatchPayload,
) -> Result<RedisMutationResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::patch_key(conn, payload.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_rename_key(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    old_key: String,
    new_key: String,
    force: Option<bool>,
) -> Result<RedisMutationResult, String> {
    let force = force.unwrap_or(false);
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::rename_key(
            conn,
            old_key.clone(),
            new_key.clone(),
            force,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_get_key_page(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    offset: u64,
    limit: u32,
) -> Result<RedisKeyValue, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::get_key_page(conn, key.clone(), offset, limit))
    })
    .await
}

#[tauri::command]
pub async fn redis_set_ttl(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    ttl_seconds: Option<i64>,
) -> Result<RedisMutationResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::set_ttl(conn, key.clone(), ttl_seconds))
    })
    .await
}
