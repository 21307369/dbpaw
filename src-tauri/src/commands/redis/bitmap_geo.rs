#[tauri::command]
pub async fn redis_bitmap_get_bit(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    offset: u64,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::bitmap_get_bit(conn, key.clone(), offset))
    })
    .await
}

#[tauri::command]
pub async fn redis_bitmap_count(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    start: Option<i64>,
    end: Option<i64>,
) -> Result<u64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::bitmap_count(conn, key.clone(), start, end))
    })
    .await
}

#[tauri::command]
pub async fn redis_bitmap_pos(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    bit: bool,
    start: Option<u64>,
    end: Option<u64>,
    count: Option<u64>,
) -> Result<Vec<u64>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::bitmap_pos(conn, key.clone(), bit, start, end, count))
    })
    .await
}

#[tauri::command]
pub async fn redis_hll_pfadd(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    elements: Vec<String>,
) -> Result<bool, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::hll_pfadd(conn, key.clone(), elements.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_geo_add(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    members: Vec<RedisGeoMember>,
) -> Result<i64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::geo_add(conn, key.clone(), members.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_geo_pos(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    members: Vec<String>,
) -> Result<Vec<Option<RedisGeoPosition>>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::geo_pos(conn, key.clone(), members.clone()))
    })
    .await
}

#[tauri::command]
pub async fn redis_geo_dist(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    member1: String,
    member2: String,
    unit: Option<String>,
) -> Result<f64, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::geo_dist(
            conn,
            key.clone(),
            member1.clone(),
            member2.clone(),
            unit.clone(),
        ))
    })
    .await
}

#[tauri::command]
pub async fn redis_geo_search(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    key: String,
    member: Option<String>,
    longitude: Option<f64>,
    latitude: Option<f64>,
    radius: f64,
    unit: String,
    with_coord: bool,
    with_dist: bool,
    with_hash: bool,
    count: Option<u64>,
) -> Result<Vec<RedisGeoSearchResult>, String> {
    with_redis_retry(&state, id, database.as_deref(), |_, conn| {
        Box::pin(redis::geo_search(
            conn,
            key.clone(),
            member.clone(),
            longitude,
            latitude,
            radius,
            unit.clone(),
            with_coord,
            with_dist,
            with_hash,
            count,
        ))
    })
    .await
}

