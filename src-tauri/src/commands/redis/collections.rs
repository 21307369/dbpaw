#[tauri::command]
pub async fn redis_set_operation(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    keys: Vec<String>,
    op: RedisSetOperation,
) -> Result<Vec<String>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::set_operation(conn, keys.clone(), op.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_sismember(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    member: String,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::sismember(conn, key.clone(), member.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_smove(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    source: String,
    destination: String,
    member: String,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::smove(
            conn,
            source.clone(),
            destination.clone(),
            member.clone(),
        ))
    })
    .await
}

// ── Stream Consumer Group commands ──────────────────────────────────────────

#[tauri::command]
pub async fn redis_batch_key_ops(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    operations: Vec<RedisBatchKeyOp>,
) -> Result<Vec<RedisBatchKeyOpResult>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::batch_key_ops(conn, operations.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_mget(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    keys: Vec<String>,
) -> Result<Vec<RedisMgetEntry>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::mget_keys(conn, keys.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_mset(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    entries: HashMap<String, String>,
) -> Result<RedisMutationResult, String> {
    let pairs: Vec<(String, String)> = entries.into_iter().collect();
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::mset_keys(conn, pairs.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_lindex(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    index: i64,
) -> Result<Option<String>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::lindex(conn, key.clone(), index))
    })
    .await
}

#[tauri::command]
pub async fn redis_lpos(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    element: String,
    rank: Option<i64>,
    count: Option<u64>,
    maxlen: Option<u64>,
) -> Result<Vec<i64>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::lpos(
            conn,
            key.clone(),
            element.clone(),
            rank,
            count,
            maxlen,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_ltrim(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    start: i64,
    stop: i64,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::ltrim(conn, key.clone(), start, stop))
    })
    .await
}

#[tauri::command]
pub async fn redis_linsert(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    position: RedisLInsertPosition,
    pivot: String,
    element: String,
) -> Result<i64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::linsert(
            conn,
            key.clone(),
            position.clone(),
            pivot.clone(),
            element.clone(),
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_lmove(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    source: String,
    destination: String,
    src_direction: RedisLMoveDirection,
    dst_direction: RedisLMoveDirection,
) -> Result<Option<String>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::lmove(
            conn,
            source.clone(),
            destination.clone(),
            src_direction.clone(),
            dst_direction.clone(),
        ))
    })
    .await
}
