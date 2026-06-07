#[tauri::command]
pub async fn redis_cluster_info(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
) -> Result<RedisClusterInfo, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::cluster_info(conn))
    })
    .await
}
