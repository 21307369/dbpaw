# Command/Direct Deduplication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate command/direct function duplication across `commands/connection.rs`, `commands/query.rs`, and `commands/metadata.rs` by extracting core functions.

**Architecture:** Each duplicated pair gets a core function taking `&AppState` returning `Result<T, AppError>`. Both Tauri command and `_direct` wrappers delegate to the core. Error-to-String conversion happens only at the Tauri command boundary.

**Tech Stack:** Rust, Tauri, async/await

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src-tauri/src/commands/connection.rs` | Modify | Extract 8 core functions, thin out 16 wrappers |
| `src-tauri/src/commands/query.rs` | Modify | Extract 4 core functions, thin out 8 wrappers |
| `src-tauri/src/commands/metadata.rs` | Modify | Extract 4 core functions, thin out 8 wrappers |

---

### Task 1: connection.rs — create_database pair

**Files:**
- Modify: `src-tauri/src/commands/connection.rs:292-475`

- [ ] **Step 1: Add `create_database_core` function**

Insert this function before `create_database_by_id` (before line 292). It contains the business logic extracted from `create_database_by_id`, using `execute_with_retry_from_app_state` instead of `execute_with_retry`:

```rust
async fn create_database_core(
    state: &AppState,
    id: i64,
    payload: CreateDatabasePayload,
) -> Result<(), AppError> {
    let db_name = validate_database_name(&payload.name)?;
    let if_not_exists = payload.if_not_exists.unwrap_or(true);
    let driver = {
        let local_db = {
            let lock = state.local_db.lock().await;
            lock.clone()
        };
        let db = local_db.ok_or_else(|| AppError::internal("Local DB not initialized"))?;
        db.get_connection_form_by_id(id)
            .await
            .map_err(AppError::internal)?
            .driver
            .to_lowercase()
    };

    if matches!(driver.as_str(), "sqlite" | "duckdb") {
        return Err(AppError::unsupported(format!(
            "Driver {} does not support creating databases in this flow",
            driver
        )));
    }

    let exec_res: Result<(), String> = match driver.as_str() {
        driver if crate::db::drivers::is_mysql_family_driver(driver) => {
            let sql = build_mysql_create_database_sql(&payload, &db_name)?;
            super::execute_with_retry_from_app_state(state, id, None, |driver| {
                let sql_clone = sql.clone();
                async move { driver.execute_query(sql_clone).await.map(|_| ()) }
            })
            .await
        }
        "postgres" => {
            let create_sql = build_postgres_create_database_sql(&payload, &db_name)?;
            let exists_check_sql = format!(
                "SELECT 1 FROM pg_database WHERE datname = {} LIMIT 1",
                quote_literal(&db_name)
            );
            super::execute_with_retry_from_app_state(state, id, None, |driver| {
                let exists_sql = exists_check_sql.clone();
                let create_sql = create_sql.clone();
                async move {
                    if if_not_exists {
                        let exists_result = driver.execute_query(exists_sql).await?;
                        if exists_result.row_count > 0 || !exists_result.data.is_empty() {
                            return Ok(());
                        }
                    }
                    driver.execute_query(create_sql).await.map(|_| ())
                }
            })
            .await
        }
        "mssql" => {
            let sql = build_mssql_create_database_sql(&payload, &db_name)?;
            super::execute_with_retry_from_app_state(state, id, None, |driver| {
                let sql_clone = sql.clone();
                async move { driver.execute_query(sql_clone).await.map(|_| ()) }
            })
            .await
        }
        "clickhouse" => {
            let sql = build_clickhouse_create_database_sql(&payload, &db_name)?;
            super::execute_with_retry_from_app_state(state, id, None, |driver| {
                let sql_clone = sql.clone();
                async move { driver.execute_query(sql_clone).await.map(|_| ()) }
            })
            .await
        }
        "cassandra" => {
            let sql = build_cassandra_create_database_sql(&payload, &db_name)?;
            super::execute_with_retry_from_app_state(state, id, None, |driver| {
                let sql_clone = sql.clone();
                async move { driver.execute_query(sql_clone).await.map(|_| ()) }
            })
            .await
        }
        _ => Err(AppError::unsupported(format!(
            "Driver {} not supported for create database",
            driver
        )).to_string()),
    };

    exec_res
        .map_err(|e| normalize_create_database_error(&e, &db_name))
        .map_err(AppError::internal)
}
```

- [ ] **Step 2: Replace `create_database_by_id` with thin wrapper**

Replace the existing `create_database_by_id` (lines 292-383) with:

```rust
#[tauri::command]
pub async fn create_database_by_id(
    state: State<'_, AppState>,
    id: i64,
    payload: CreateDatabasePayload,
) -> Result<(), String> {
    create_database_core(state.inner(), id, payload)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 3: Replace `create_database_by_id_direct` with thin wrapper**

Replace the existing `create_database_by_id_direct` (lines 385-475) with:

```rust
pub async fn create_database_by_id_direct(
    state: &AppState,
    id: i64,
    payload: CreateDatabasePayload,
) -> Result<(), String> {
    create_database_core(state, id, payload)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 4: Run cargo check**

Run: `cargo check`
Expected: PASS (no compilation errors)

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/connection.rs
git commit -m "refactor: extract create_database_core from command/direct pair"
```

---

### Task 2: connection.rs — simple CRUD pairs

**Files:**
- Modify: `src-tauri/src/commands/connection.rs:274-735`

- [ ] **Step 1: Add `list_databases_core`**

Insert before `list_databases_by_id` (before line 274):

```rust
async fn list_databases_core(state: &AppState, id: i64) -> Result<Vec<String>, AppError> {
    super::execute_with_retry_from_app_state(state, id, None, |driver| async move {
        driver.list_databases().await
    })
    .await
    .map_err(AppError::internal)
}
```

- [ ] **Step 2: Replace `list_databases_by_id` and `list_databases_by_id_direct`**

Replace lines 274-290 with:

```rust
#[tauri::command]
pub async fn list_databases_by_id(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<String>, String> {
    list_databases_core(state.inner(), id)
        .await
        .map_err(String::from)
}

pub async fn list_databases_by_id_direct(state: &AppState, id: i64) -> Result<Vec<String>, String> {
    list_databases_core(state, id)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 3: Add `get_connections_core`**

Insert before `get_connections` (before line 621):

```rust
async fn get_connections_core(state: &AppState) -> Result<Vec<Connection>, AppError> {
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    if let Some(db) = local_db {
        db.list_connections().await.map_err(AppError::internal)
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}
```

- [ ] **Step 4: Replace `get_connections` and `get_connections_direct`**

Replace lines 621-644 with:

```rust
#[tauri::command]
pub async fn get_connections(state: State<'_, AppState>) -> Result<Vec<Connection>, String> {
    get_connections_core(state.inner())
        .await
        .map_err(String::from)
}

pub async fn get_connections_direct(state: &AppState) -> Result<Vec<Connection>, String> {
    get_connections_core(state)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 5: Add `create_connection_core`**

Insert before `create_connection` (before line 646):

```rust
async fn create_connection_core(
    state: &AppState,
    form: ConnectionForm,
) -> Result<Connection, AppError> {
    let form = crate::connection_input::normalize_connection_form(form)?;
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    if let Some(db) = local_db {
        db.create_connection(form).await.map_err(AppError::internal)
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}
```

- [ ] **Step 6: Replace `create_connection` and `create_connection_direct`**

Replace lines 646-677 with:

```rust
#[tauri::command]
pub async fn create_connection(
    state: State<'_, AppState>,
    form: ConnectionForm,
) -> Result<Connection, String> {
    create_connection_core(state.inner(), form)
        .await
        .map_err(String::from)
}

pub async fn create_connection_direct(
    state: &AppState,
    form: ConnectionForm,
) -> Result<Connection, String> {
    create_connection_core(state, form)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 7: Add `update_connection_core`**

Insert before `update_connection` (before line 679):

```rust
async fn update_connection_core(
    state: &AppState,
    id: i64,
    form: ConnectionForm,
) -> Result<Connection, AppError> {
    let form = crate::connection_input::normalize_connection_form(form)?;
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    if let Some(db) = local_db {
        state.pool_manager.remove_by_prefix(&id.to_string()).await;
        db.update_connection(id, form).await.map_err(AppError::internal)
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}
```

- [ ] **Step 8: Replace `update_connection` and `update_connection_direct`**

Replace lines 679-716 with:

```rust
#[tauri::command]
pub async fn update_connection(
    state: State<'_, AppState>,
    id: i64,
    form: ConnectionForm,
) -> Result<Connection, String> {
    update_connection_core(state.inner(), id, form)
        .await
        .map_err(String::from)
}

pub async fn update_connection_direct(
    state: &AppState,
    id: i64,
    form: ConnectionForm,
) -> Result<Connection, String> {
    update_connection_core(state, id, form)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 9: Add `delete_connection_core`**

Insert before `delete_connection` (before line 718):

```rust
async fn delete_connection_core(state: &AppState, id: i64) -> Result<(), AppError> {
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    if let Some(db) = local_db {
        state.pool_manager.remove_by_prefix(&id.to_string()).await;
        state.redis_cache.lock().await.remove_by_connection_id(id);
        db.delete_connection(id).await.map_err(AppError::internal)
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}
```

- [ ] **Step 10: Replace `delete_connection` and `delete_connection_direct`**

Replace lines 718-735 with:

```rust
#[tauri::command]
pub async fn delete_connection(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    delete_connection_core(state.inner(), id)
        .await
        .map_err(String::from)
}

pub async fn delete_connection_direct(state: &AppState, id: i64) -> Result<(), String> {
    delete_connection_core(state, id)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 11: Run cargo check**

Run: `cargo check`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add src-tauri/src/commands/connection.rs
git commit -m "refactor: extract CRUD core functions from command/direct pairs"
```

---

### Task 3: connection.rs — mysql charset/collation pairs

**Files:**
- Modify: `src-tauri/src/commands/connection.rs:505-619`

- [ ] **Step 1: Add `get_mysql_charsets_core`**

Insert before `get_mysql_charsets_by_id` (before line 505):

```rust
async fn get_mysql_charsets_core(state: &AppState, id: i64) -> Result<Vec<String>, AppError> {
    super::execute_with_retry_from_app_state(state, id, None, |driver| async move {
        let result = driver
            .execute_query("SHOW CHARACTER SET".to_string())
            .await?;
        let mut charsets: Vec<String> = result
            .data
            .iter()
            .filter_map(|row| {
                row.get("Charset")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .collect();
        charsets.sort();
        Ok::<Vec<String>, AppError>(charsets)
    })
    .await
    .map_err(AppError::internal)
}
```

- [ ] **Step 2: Replace `get_mysql_charsets_by_id` and `get_mysql_charsets_by_id_direct`**

Replace lines 505-585 with:

```rust
#[tauri::command]
pub async fn get_mysql_charsets_by_id(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<String>, String> {
    get_mysql_charsets_core(state.inner(), id)
        .await
        .map_err(String::from)
}

pub async fn get_mysql_charsets_by_id_direct(
    state: &AppState,
    id: i64,
) -> Result<Vec<String>, String> {
    get_mysql_charsets_core(state, id)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 3: Add `get_mysql_collations_core`**

Insert before `get_mysql_collations_by_id` (before line 529):

```rust
async fn get_mysql_collations_core(
    state: &AppState,
    id: i64,
    charset: Option<String>,
) -> Result<Vec<String>, AppError> {
    let sql = match &charset {
        Some(cs) if is_safe_option_token(cs) => {
            format!("SHOW COLLATION WHERE Charset = '{}'", cs)
        }
        Some(cs) => {
            return Err(AppError::validation(format!("Invalid charset: {}", cs)));
        }
        None => "SHOW COLLATION".to_string(),
    };
    super::execute_with_retry_from_app_state(state, id, None, |driver| {
        let sql = sql.clone();
        async move {
            let result = driver.execute_query(sql).await?;
            let mut collations: Vec<String> = result
                .data
                .iter()
                .filter_map(|row| {
                    row.get("Collation")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                })
                .collect();
            collations.sort();
            Ok::<Vec<String>, AppError>(collations)
        }
    })
    .await
    .map_err(AppError::internal)
}
```

- [ ] **Step 4: Replace `get_mysql_collations_by_id` and `get_mysql_collations_by_id_direct`**

Replace the collations command and direct functions with:

```rust
#[tauri::command]
pub async fn get_mysql_collations_by_id(
    state: State<'_, AppState>,
    id: i64,
    charset: Option<String>,
) -> Result<Vec<String>, String> {
    get_mysql_collations_core(state.inner(), id, charset)
        .await
        .map_err(String::from)
}

pub async fn get_mysql_collations_by_id_direct(
    state: &AppState,
    id: i64,
    charset: Option<String>,
) -> Result<Vec<String>, String> {
    get_mysql_collations_core(state, id, charset)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 5: Run cargo check**

Run: `cargo check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/connection.rs
git commit -m "refactor: extract mysql charset/collation core functions"
```

---

### Task 4: query.rs — all pairs

**Files:**
- Modify: `src-tauri/src/commands/query.rs`

- [ ] **Step 1: Add `append_sql_execution_log_core`**

Insert before `append_sql_execution_log` (before line 99). This function is used by `execute_query_core`:

```rust
async fn append_sql_execution_log_core(
    state: &AppState,
    sql: String,
    source: Option<String>,
    connection_id: Option<i64>,
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
            .insert_sql_execution_log(sql, source, connection_id, database, success, error)
            .await
        {
            eprintln!("[SQL_LOG_APPEND_ERROR] {}", e);
        }
    }
}
```

- [ ] **Step 2: Replace `append_sql_execution_log` and `append_sql_execution_log_direct`**

Replace lines 99-145 with:

```rust
async fn append_sql_execution_log(
    state: &State<'_, AppState>,
    sql: String,
    source: Option<String>,
    connection_id: Option<i64>,
    database: Option<String>,
    success: bool,
    error: Option<String>,
) {
    append_sql_execution_log_core(state.inner(), sql, source, connection_id, database, success, error).await
}

async fn append_sql_execution_log_direct(
    state: &AppState,
    sql: String,
    source: Option<String>,
    connection_id: Option<i64>,
    database: Option<String>,
    success: bool,
    error: Option<String>,
) {
    append_sql_execution_log_core(state, sql, source, connection_id, database, success, error).await
}
```

- [ ] **Step 3: Add `execute_query_core`**

Insert before `execute_query` (before line 173). Note: `execute_query` has `app_handle` for emitting events — the core function handles the logic, the command wrapper handles event emission:

```rust
async fn execute_query_core(
    state: &AppState,
    id: i64,
    query: String,
    database: Option<String>,
    source: Option<String>,
    query_id: String,
    cancellation_supported: bool,
) -> Result<QueryResult, AppError> {
    let guarded_query = apply_default_limit(&query, resolve_driver_from_app_state(state, id).await.as_deref());
    if cancellation_supported {
        register_running_query(id, &query_id).await;
    }

    let result = super::execute_with_retry_from_app_state(state, id, database.clone(), |driver| {
        let query_clone = guarded_query.clone();
        let query_id_clone = query_id.clone();
        async move {
            driver
                .execute_query_with_id(
                    query_clone,
                    if cancellation_supported {
                        Some(query_id_clone.as_str())
                    } else {
                        None
                    },
                )
                .await
        }
    })
    .await
    .map_err(AppError::internal);

    if cancellation_supported {
        unregister_running_query(id, &query_id).await;
    }

    if let Ok(res) = &result {
        append_sql_execution_log_core(
            state,
            guarded_query.clone(),
            source,
            Some(id),
            database,
            true,
            None,
        )
        .await;
    } else if let Err(err) = &result {
        append_sql_execution_log_core(
            state,
            guarded_query.clone(),
            source,
            Some(id),
            database,
            false,
            Some(err.to_string()),
        )
        .await;
    }

    result
}
```

- [ ] **Step 4: Replace `execute_query` command**

Replace lines 173-262 with:

```rust
#[tauri::command]
pub async fn execute_query(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    query: String,
    database: Option<String>,
    source: Option<String>,
    query_id: Option<String>,
) -> Result<QueryResult, String> {
    let query_id = make_query_id(id, query_id);
    let _ = app_handle.emit(
        "query.progress",
        serde_json::json!({"queryId": query_id.clone(), "phase": "prepare"}),
    );
    let driver = resolve_driver(&state, id).await;
    if driver
        .as_deref()
        .map(|d| d.eq_ignore_ascii_case("redis"))
        .unwrap_or(false)
    {
        return Err(AppError::unsupported("Redis connections do not support SQL queries. Use the Redis key view to browse and edit keys.").to_string());
    }
    let cancellation_supported = driver
        .as_deref()
        .map(supports_query_cancellation)
        .unwrap_or(false);

    let result = execute_query_core(
        state.inner(),
        id,
        query,
        database,
        source,
        query_id.clone(),
        cancellation_supported,
    )
    .await;

    if let Ok(res) = &result {
        if !res.data.is_empty() {
            let _ = app_handle.emit(
                "query.chunk",
                serde_json::json!({
                    "queryId": query_id,
                    "rows": res.data.iter().take(50).collect::<Vec<_>>()
                }),
            );
        }
    }

    result.map_err(String::from)
}
```

- [ ] **Step 5: Replace `execute_query_by_id_direct`**

Replace lines 275-340 with:

```rust
pub async fn execute_query_by_id_direct(
    state: &AppState,
    id: i64,
    query: String,
    database: Option<String>,
    source: Option<String>,
    query_id: Option<String>,
) -> Result<QueryResult, String> {
    let query_id = make_query_id(id, query_id);
    let driver = resolve_driver_from_app_state(state, id).await;
    let cancellation_supported = driver
        .as_deref()
        .map(supports_query_cancellation)
        .unwrap_or(false);

    execute_query_core(
        state,
        id,
        query,
        database,
        source,
        query_id,
        cancellation_supported,
    )
    .await
    .map_err(String::from)
}
```

- [ ] **Step 6: Add `cancel_query_core`**

Insert before `cancel_query` (before line 394):

```rust
async fn cancel_query_core(
    state: &AppState,
    uuid: String,
    query_id: String,
) -> Result<bool, AppError> {
    let connection_id = uuid
        .trim()
        .parse::<i64>()
        .map_err(|_| AppError::validation("Invalid connection id for cancellation"))?;
    let query_id = query_id.trim().to_string();
    if query_id.is_empty() {
        return Err(AppError::validation("query_id cannot be empty"));
    }
    if !is_running_query(connection_id, &query_id).await {
        return Ok(false);
    }

    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    let db = local_db.ok_or_else(|| AppError::internal("Local DB not initialized"))?;
    let form = db.get_connection_form_by_id(connection_id).await.map_err(AppError::internal)?;

    execute_cancel_query(connection_id, &query_id, &form)
        .await
        .map_err(AppError::internal)
}
```

- [ ] **Step 7: Replace `cancel_query` and `cancel_query_direct`**

Replace lines 394-549 with:

```rust
#[tauri::command]
pub async fn cancel_query(
    state: State<'_, AppState>,
    uuid: String,
    query_id: String,
) -> Result<bool, String> {
    cancel_query_core(state.inner(), uuid, query_id)
        .await
        .map_err(String::from)
}

pub async fn cancel_query_direct(
    state: &AppState,
    uuid: String,
    query_id: String,
) -> Result<bool, String> {
    cancel_query_core(state, uuid, query_id)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 8: Add `list_sql_execution_logs_core`**

Insert before `list_sql_execution_logs` (before line 489):

```rust
async fn list_sql_execution_logs_core(
    state: &AppState,
    limit: Option<i64>,
) -> Result<Vec<SqlExecutionLog>, AppError> {
    let safe_limit = clamp_sql_execution_logs_limit(limit);
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };

    if let Some(db) = local_db {
        db.list_sql_execution_logs(safe_limit).await.map_err(AppError::internal)
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}
```

- [ ] **Step 9: Replace `list_sql_execution_logs` and `list_sql_execution_logs_direct`**

Replace lines 489-522 with:

```rust
#[tauri::command]
pub async fn list_sql_execution_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<SqlExecutionLog>, String> {
    list_sql_execution_logs_core(state.inner(), limit)
        .await
        .map_err(String::from)
}

pub async fn list_sql_execution_logs_direct(
    state: &AppState,
    limit: Option<i64>,
) -> Result<Vec<SqlExecutionLog>, String> {
    list_sql_execution_logs_core(state, limit)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 10: Run cargo check**

Run: `cargo check`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/commands/query.rs
git commit -m "refactor: extract query core functions from command/direct pairs"
```

---

### Task 5: metadata.rs — all pairs

**Files:**
- Modify: `src-tauri/src/commands/metadata.rs`

- [ ] **Step 1: Add `get_schema_overview_core`**

Insert before `get_schema_overview` (before line 22):

```rust
async fn get_schema_overview_core(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: Option<String>,
) -> Result<SchemaOverview, AppError> {
    super::execute_with_retry_from_app_state(state, id, database, |driver| {
        let schema_clone = schema.clone();
        async move { driver.get_schema_overview(schema_clone).await }
    })
    .await
    .map_err(AppError::internal)
}
```

- [ ] **Step 2: Replace `get_schema_overview` and `get_schema_overview_direct`**

Replace lines 22-47 with:

```rust
#[tauri::command]
pub async fn get_schema_overview(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    schema: Option<String>,
) -> Result<SchemaOverview, String> {
    get_schema_overview_core(state.inner(), id, database, schema)
        .await
        .map_err(String::from)
}

pub async fn get_schema_overview_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: Option<String>,
) -> Result<SchemaOverview, String> {
    get_schema_overview_core(state, id, database, schema)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 3: Add `get_table_structure_core`**

Insert before `get_table_structure` (before line 178):

```rust
async fn get_table_structure_core(
    state: &AppState,
    id: i64,
    schema: String,
    table: String,
) -> Result<TableStructure, AppError> {
    let table_name = table.clone();
    super::execute_with_retry_from_app_state(state, id, None, |driver| {
        let schema_clone = schema.clone();
        let table_clone = table.clone();
        async move { driver.get_table_structure(schema_clone, table_clone).await }
    })
    .await
    .map_err(AppError::internal)
    .and_then(|structure| ensure_table_structure_found(structure, &table_name).map_err(AppError::internal))
}
```

- [ ] **Step 4: Replace `get_table_structure` and `get_table_structure_direct`**

Replace lines 178-209 with:

```rust
#[tauri::command]
pub async fn get_table_structure(
    state: State<'_, AppState>,
    id: i64,
    schema: String,
    table: String,
) -> Result<TableStructure, String> {
    get_table_structure_core(state.inner(), id, schema, table)
        .await
        .map_err(String::from)
}

pub async fn get_table_structure_direct(
    state: &AppState,
    id: i64,
    schema: String,
    table: String,
) -> Result<TableStructure, String> {
    get_table_structure_core(state, id, schema, table)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 5: Add `get_table_ddl_core`**

Insert before `get_table_ddl` (before line 211):

```rust
async fn get_table_ddl_core(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
) -> Result<String, AppError> {
    super::execute_with_retry_from_app_state(state, id, database, |driver| {
        let schema_clone = schema.clone();
        let table_clone = table.clone();
        async move { driver.get_table_ddl(schema_clone, table_clone).await }
    })
    .await
    .map_err(AppError::internal)
}
```

- [ ] **Step 6: Replace `get_table_ddl` and `get_table_ddl_direct`**

Replace lines 211-240 with:

```rust
#[tauri::command]
pub async fn get_table_ddl(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
) -> Result<String, String> {
    get_table_ddl_core(state.inner(), id, database, schema, table)
        .await
        .map_err(String::from)
}

pub async fn get_table_ddl_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
) -> Result<String, String> {
    get_table_ddl_core(state, id, database, schema, table)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 7: Add `get_table_metadata_core`**

Insert before `get_table_metadata` (before line 242):

```rust
async fn get_table_metadata_core(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
) -> Result<TableMetadata, AppError> {
    super::execute_with_retry_from_app_state(state, id, database, |driver| {
        let schema_clone = schema.clone();
        let table_clone = table.clone();
        async move { driver.get_table_metadata(schema_clone, table_clone).await }
    })
    .await
    .map_err(AppError::internal)
}
```

- [ ] **Step 8: Replace `get_table_metadata` and `get_table_metadata_direct`**

Replace lines 242-271 with:

```rust
#[tauri::command]
pub async fn get_table_metadata(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
) -> Result<TableMetadata, String> {
    get_table_metadata_core(state.inner(), id, database, schema, table)
        .await
        .map_err(String::from)
}

pub async fn get_table_metadata_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
) -> Result<TableMetadata, String> {
    get_table_metadata_core(state, id, database, schema, table)
        .await
        .map_err(String::from)
}
```

- [ ] **Step 9: Run cargo check**

Run: `cargo check`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/commands/metadata.rs
git commit -m "refactor: extract metadata core functions from command/direct pairs"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run cargo check**

Run: `cargo check`
Expected: PASS

- [ ] **Step 2: Run cargo test**

Run: `cargo test`
Expected: All existing tests pass

- [ ] **Step 3: Run cargo clippy**

Run: `cargo clippy`
Expected: No new warnings

- [ ] **Step 4: Commit (if clippy fixes needed)**

```bash
git add -u
git commit -m "fix: address clippy warnings from deduplication refactor"
```
