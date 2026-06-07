#[tauri::command]
pub async fn redis_zrangebyscore(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    min: String,
    max: String,
    offset: Option<u64>,
    limit: Option<u64>,
) -> Result<RedisZRangeByScoreResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zrangebyscore(
            conn,
            key.clone(),
            min.clone(),
            max.clone(),
            offset,
            limit,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_zrank(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    member: String,
    reverse: Option<bool>,
) -> Result<Option<i64>, String> {
    let rev = reverse.unwrap_or(false);
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zrank(conn, key.clone(), member.clone(), rev))
    })
    .await
}

#[tauri::command]
pub async fn redis_zscore(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    member: String,
) -> Result<Option<f64>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zscore(conn, key.clone(), member.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_zmscore(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    members: Vec<String>,
) -> Result<Vec<Option<f64>>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zmscore(conn, key.clone(), members.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_zrangebylex(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    min: String,
    max: String,
    offset: Option<u64>,
    limit: Option<u64>,
) -> Result<RedisZRangeByLexResult, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zrangebylex(
            conn,
            key.clone(),
            min.clone(),
            max.clone(),
            offset,
            limit,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_zlexcount(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    min: String,
    max: String,
) -> Result<u64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zlexcount(
            conn,
            key.clone(),
            min.clone(),
            max.clone(),
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_zpopmin(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    count: Option<u64>,
) -> Result<Vec<RedisZSetMember>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zpopmin(conn, key.clone(), count))
    })
    .await
}

#[tauri::command]
pub async fn redis_zpopmax(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    count: Option<u64>,
) -> Result<Vec<RedisZSetMember>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::zpopmax(conn, key.clone(), count))
    })
    .await
}
