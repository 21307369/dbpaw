type RedisCommandFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send + 'a>>;

/// Cache key: standalone uses "{id}:{db}" so different databases on the same
/// server each get their own persistent connection (SELECT is connection-level).
/// Cluster uses "{id}:cluster" since it only supports db0.
fn cache_key(id: i64, database: Option<&str>, is_cluster: bool) -> String {
    if is_cluster {
        format!("{id}:cluster")
    } else {
        format!("{id}:{}", database.unwrap_or(""))
    }
}

/// Returns true if the error string looks like a broken/dropped TCP connection.
fn is_io_error(e: &str) -> bool {
    e.contains("[REDIS_ERROR]") && {
        let lower = e.to_lowercase();
        lower.contains("broken pipe")
            || lower.contains("connection reset")
            || lower.contains("connection refused")
            || lower.contains("connection closed")
            || lower.contains("eof")
            || lower.contains("os error")
    }
}

/// Get a cached connection for (id, database), creating one if not present.
async fn acquire(
    state: &State<'_, AppState>,
    id: i64,
    form: &ConnectionForm,
    database: Option<&str>,
) -> Result<RedisConnection, String> {
    let is_cluster = form
        .host
        .as_deref()
        .map(|h| h.split(',').filter(|p| !p.trim().is_empty()).count() > 1)
        .unwrap_or(false);
    let key = cache_key(id, database, is_cluster);

    // Fast path: return a clone of the cached connection
    {
        let cache = state.redis_cache.lock().await;
        if let Some(conn) = cache.get(&key) {
            return Ok(conn);
        }
    }

    // Slow path: create a new connection and cache it
    let conn = connect(form, database).await?;
    {
        let mut cache = state.redis_cache.lock().await;
        // Another task might have raced in; prefer the one already in the cache
        if let Some(existing) = cache.get(&key) {
            return Ok(existing);
        }
        cache.insert(key, conn.clone());
    }
    Ok(conn)
}

/// Remove a stale connection from the cache (called after an IO error).
async fn evict(
    state: &State<'_, AppState>,
    id: i64,
    form: &ConnectionForm,
    database: Option<&str>,
) {
    let is_cluster = form
        .host
        .as_deref()
        .map(|h| h.split(',').filter(|p| !p.trim().is_empty()).count() > 1)
        .unwrap_or(false);
    let key = cache_key(id, database, is_cluster);
    let mut cache = state.redis_cache.lock().await;
    cache.remove(&key);
}

async fn retry_once_on_redis_io_error<T, Operation, OperationFuture, OnRetry, OnRetryFuture>(
    mut operation: Operation,
    mut on_retry: OnRetry,
) -> Result<T, String>
where
    Operation: FnMut() -> OperationFuture,
    OperationFuture: Future<Output = Result<T, String>>,
    OnRetry: FnMut() -> OnRetryFuture,
    OnRetryFuture: Future<Output = ()>,
{
    match operation().await {
        Err(ref e) if is_io_error(e) => {
            on_retry().await;
            operation().await
        }
        result => result,
    }
}

#[allow(dead_code)]
async fn with_redis_conn<T, F>(
    state: &State<'_, AppState>,
    id: i64,
    database: Option<&str>,
    operation: F,
) -> Result<T, String>
where
    F: for<'a> FnOnce(&'a ConnectionForm, &'a mut RedisConnection) -> RedisCommandFuture<'a, T>,
{
    let form = super::get_connection_form_by_id_with_driver_check(state, id, "redis")
        .await
        .map_err(|e| String::from(crate::error::AppError::from(e)))?;
    let mut conn = acquire(state, id, &form, database)
        .await
        .map_err(|e| String::from(crate::error::AppError::from(e)))?;
    operation(&form, &mut conn)
        .await
        .map_err(|e| String::from(crate::error::AppError::from(e)))
}

async fn with_redis_retry<T, F>(
    state: &State<'_, AppState>,
    id: i64,
    database: Option<&str>,
    operation: F,
) -> Result<T, String>
where
    F: for<'a> Fn(&'a ConnectionForm, &'a mut RedisConnection) -> RedisCommandFuture<'a, T>,
{
    let form = super::get_connection_form_by_id_with_driver_check(state, id, "redis")
        .await
        .map_err(|e| String::from(crate::error::AppError::from(e)))?;
    let operation = &operation;

    retry_once_on_redis_io_error(
        || {
            let form = &form;
            async move {
                let mut conn = acquire(state, id, form, database).await?;
                operation(form, &mut conn).await
            }
        },
        || {
            let form = &form;
            async move {
                evict(state, id, form, database).await;
            }
        },
    )
    .await
    .map_err(|e| String::from(crate::error::AppError::from(e)))
}
