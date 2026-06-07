#[tauri::command]
pub async fn redis_list_databases(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<RedisDatabaseInfo>, String> {
    with_redis_retry(&state, id, None, |form, conn| {
        Box::pin(async move {
            redis::ping(conn).await?;

            let db_count = if conn.is_cluster() {
                1
            } else {
                let mut cmd = ::redis::cmd("CONFIG");
                cmd.arg("GET").arg("databases");
                match conn.query::<Vec<String>>(cmd).await {
                    Ok(values) if values.len() >= 2 => {
                        values[1].parse::<i64>().unwrap_or(16).clamp(1, 256)
                    }
                    _ => 16,
                }
            };

            let mut dbs = redis::list_databases(form, db_count)?;

            if conn.is_cluster() {
                if let Some(db) = dbs.first_mut() {
                    let count: u64 = conn.query(::redis::cmd("DBSIZE")).await.unwrap_or(0);
                    db.key_count = Some(count);
                }
            } else {
                for db in &mut dbs {
                    let mut select_cmd = ::redis::cmd("SELECT");
                    select_cmd.arg(db.index);
                    let _ = conn.query::<()>(select_cmd).await;
                    let count: u64 = conn.query(::redis::cmd("DBSIZE")).await.unwrap_or(0);
                    db.key_count = Some(count);
                }
                // Restore to the originally selected database
                if let Some(selected) = dbs.iter().find(|d| d.selected) {
                    let mut select_cmd = ::redis::cmd("SELECT");
                    select_cmd.arg(selected.index);
                    let _ = conn.query::<()>(select_cmd).await;
                }
            }

            Ok(dbs)
        })
    })
    .await
}

#[tauri::command]
pub async fn redis_scan_keys(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    cursor: Option<String>,
    pattern: Option<String>,
    limit: Option<u32>,
) -> Result<RedisScanResponse, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::scan_keys(
            conn,
            cursor.clone(),
            pattern.clone(),
            limit,
        ))
    })
    .await
}

