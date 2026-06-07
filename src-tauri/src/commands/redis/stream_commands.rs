#[tauri::command]
pub async fn redis_xgroup_create(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
    start_id: String,
    mkstream: Option<bool>,
) -> Result<bool, String> {
    let ms = mkstream.unwrap_or(false);
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xgroup_create(
            conn,
            key.clone(),
            group.clone(),
            start_id.clone(),
            ms,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_xgroup_del(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xgroup_del(conn, key.clone(), group.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_xgroup_setid(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
    start_id: String,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xgroup_setid(
            conn,
            key.clone(),
            group.clone(),
            start_id.clone(),
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_xack(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
    ids: Vec<String>,
) -> Result<i64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xack(conn, key.clone(), group.clone(), ids.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_xpending(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
    start: Option<String>,
    end: Option<String>,
    count: Option<i64>,
    consumer: Option<String>,
) -> Result<RedisXPendingResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xpending(
            conn,
            key.clone(),
            group.clone(),
            start.clone(),
            end.clone(),
            count,
            consumer.clone(),
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_xclaim(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
    consumer: String,
    min_idle_ms: i64,
    ids: Vec<String>,
) -> Result<Vec<RedisXClaimEntry>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xclaim(
            conn,
            key.clone(),
            group.clone(),
            consumer.clone(),
            min_idle_ms,
            ids.clone(),
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_xtrim(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    strategy: String,
    threshold: String,
    approximate: Option<bool>,
) -> Result<i64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xtrim(
            conn,
            key.clone(),
            strategy.clone(),
            threshold.clone(),
            approximate,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_xreadgroup(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    group: String,
    consumer: String,
    start_id: String,
    count: Option<i64>,
) -> Result<Vec<RedisStreamEntry>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::xreadgroup(
            conn,
            key.clone(),
            group.clone(),
            consumer.clone(),
            start_id.clone(),
            count,
        ))
    })
    .await
}

// ── Batch operations ────────────────────────────────────────────────────────
