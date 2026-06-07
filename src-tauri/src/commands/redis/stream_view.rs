#[tauri::command]
pub async fn redis_get_stream_range(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    start_id: String,
    count: u32,
) -> Result<Vec<RedisStreamEntry>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::get_stream_range(
            conn,
            key.clone(),
            start_id.clone(),
            count,
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_get_stream_view(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    start_id: String,
    end_id: String,
    count: u32,
) -> Result<RedisStreamView, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::get_stream_view(
            conn,
            key.clone(),
            start_id.clone(),
            end_id.clone(),
            count,
        ))
    })
    .await
}
