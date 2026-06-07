use crate::models::{ConnectionForm, QueryResult, SqlExecutionLog, TableDataResponse};
use crate::sql::query_guard::apply_default_limit;
use crate::state::AppState;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use tauri::{Emitter, State};
use tokio::sync::Mutex;

type RunningQueryRegistry = HashMap<i64, HashSet<String>>;

fn running_queries() -> &'static Mutex<RunningQueryRegistry> {
    static RUNNING_QUERIES: OnceLock<Mutex<RunningQueryRegistry>> = OnceLock::new();
    RUNNING_QUERIES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn make_query_id(connection_id: i64, provided: Option<String>) -> String {
    if let Some(id) = provided {
        let trimmed = id.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("q-{}-{}", connection_id, ts)
}

async fn resolve_driver(state: &State<'_, AppState>, id: i64) -> Option<String> {
    let db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    }?;
    db.get_connection_form_by_id(id)
        .await
        .ok()
        .map(|f| f.driver)
}

fn supports_query_cancellation(driver: &str) -> bool {
    let d = driver.to_ascii_lowercase();
    d == "clickhouse" || crate::db::drivers::is_mysql_family_driver(&d)
}

async fn execute_cancel_query(
    connection_id: i64,
    query_id: &str,
    form: &crate::models::ConnectionForm,
) -> Result<bool, String> {
    if form.driver.eq_ignore_ascii_case("clickhouse") {
        let driver = crate::db::drivers::clickhouse::ClickHouseDriver::connect(form).await?;
        driver.kill_query(query_id).await?;
        unregister_running_query(connection_id, query_id).await;
        Ok(true)
    } else if crate::db::drivers::is_mysql_family_driver(&form.driver) {
        let Some(thread_id) =
            crate::db::drivers::mysql::MysqlDriver::lookup_query_thread(query_id).await
        else {
            return Ok(false);
        };
        let driver = crate::db::drivers::mysql::MysqlDriver::connect(form).await?;
        driver.kill_query(thread_id).await?;
        crate::db::drivers::mysql::MysqlDriver::unregister_query_thread(query_id).await;
        unregister_running_query(connection_id, query_id).await;
        Ok(true)
    } else {
        Ok(false)
    }
}

async fn register_running_query(connection_id: i64, query_id: &str) {
    let mut guard = running_queries().lock().await;
    guard
        .entry(connection_id)
        .or_default()
        .insert(query_id.to_string());
}

async fn unregister_running_query(connection_id: i64, query_id: &str) {
    let mut guard = running_queries().lock().await;
    if let Some(ids) = guard.get_mut(&connection_id) {
        ids.remove(query_id);
        if ids.is_empty() {
            guard.remove(&connection_id);
        }
    }
}

async fn is_running_query(connection_id: i64, query_id: &str) -> bool {
    let guard = running_queries().lock().await;
    guard
        .get(&connection_id)
        .map(|ids| ids.contains(query_id))
        .unwrap_or(false)
}

async fn append_sql_execution_log(
    state: &State<'_, AppState>,
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

async fn append_sql_execution_log_direct(
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

fn validate_page_limit(page: i64, limit: i64) -> Result<(), String> {
    if page <= 0 {
        return Err("[VALIDATION_ERROR] page must be greater than 0".to_string());
    }
    if limit <= 0 {
        return Err("[VALIDATION_ERROR] limit must be greater than 0".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_table_data_by_conn(
    form: ConnectionForm,
    schema: String,
    table: String,
    page: i64,
    limit: i64,
) -> Result<TableDataResponse, String> {
    validate_page_limit(page, limit)?;
    let driver = crate::db::drivers::connect(&form).await.map_err(String::from)?;
    driver
        .get_table_data(schema, table, page, limit, None, None, None, None)
        .await
        .map_err(String::from)
}

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
        return Err("[UNSUPPORTED] Redis connections do not support SQL queries. Use the Redis key view to browse and edit keys.".to_string());
    }
    let cancellation_supported = driver
        .as_deref()
        .map(supports_query_cancellation)
        .unwrap_or(false);
    let guarded_query = apply_default_limit(&query, driver.as_deref());
    if cancellation_supported {
        register_running_query(id, &query_id).await;
    }

    let result = super::execute_with_retry(&state, id, database.clone(), |driver| {
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
    .await;
    if cancellation_supported {
        unregister_running_query(id, &query_id).await;
    }

    if let Ok(res) = &result {
        // Stream first chunk for UX (simulated)
        if !res.data.is_empty() {
            let _ = app_handle.emit(
                "query.chunk",
                serde_json::json!({
                    "queryId": query_id,
                    "rows": res.data.iter().take(50).collect::<Vec<_>>()
                }),
            );
        }

        append_sql_execution_log(
            &state,
            guarded_query.clone(),
            source,
            Some(id),
            database,
            true,
            None,
        )
        .await;
    } else if let Err(err) = &result {
        append_sql_execution_log(
            &state,
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

async fn resolve_driver_from_app_state(state: &AppState, id: i64) -> Option<String> {
    let db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    }?;
    db.get_connection_form_by_id(id)
        .await
        .ok()
        .map(|f| f.driver)
}

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
    let guarded_query = apply_default_limit(&query, driver.as_deref());
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
    .await;
    if cancellation_supported {
        unregister_running_query(id, &query_id).await;
    }

    if result.is_ok() {
        append_sql_execution_log_direct(
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
        append_sql_execution_log_direct(
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

pub async fn execute_by_conn_direct(
    form: ConnectionForm,
    sql: String,
) -> Result<QueryResult, String> {
    let guarded_sql = apply_default_limit(&sql, Some(&form.driver));
    let driver = crate::db::drivers::connect(&form).await.map_err(String::from)?;
    driver
        .execute_query_with_id(guarded_sql, None)
        .await
        .map_err(String::from)
}

#[tauri::command]
pub async fn get_table_data(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
    page: i64,
    limit: i64,
    filter: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    order_by: Option<String>,
) -> Result<TableDataResponse, String> {
    validate_page_limit(page, limit)?;
    super::execute_with_retry(&state, id, database, |driver| {
        let schema_clone = schema.clone();
        let table_clone = table.clone();
        let filter_clone = filter.clone();
        let sort_col_clone = sort_column.clone();
        let sort_dir_clone = sort_direction.clone();
        let order_by_clone = order_by.clone();
        async move {
            driver
                .get_table_data(
                    schema_clone,
                    table_clone,
                    page,
                    limit,
                    sort_col_clone,
                    sort_dir_clone,
                    filter_clone,
                    order_by_clone,
                )
                .await
        }
    })
    .await
}

#[tauri::command]
pub async fn cancel_query(
    state: State<'_, AppState>,
    uuid: String,
    query_id: String,
) -> Result<bool, String> {
    let connection_id = uuid
        .trim()
        .parse::<i64>()
        .map_err(|_| "[VALIDATION_ERROR] Invalid connection id for cancellation".to_string())?;
    let query_id = query_id.trim().to_string();
    if query_id.is_empty() {
        return Err("[VALIDATION_ERROR] query_id cannot be empty".to_string());
    }
    if !is_running_query(connection_id, &query_id).await {
        return Ok(false);
    }

    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    let db = local_db.ok_or("Local DB not initialized".to_string())?;
    let form = db.get_connection_form_by_id(connection_id).await?;

    execute_cancel_query(connection_id, &query_id, &form).await
}

#[tauri::command]
pub async fn execute_by_conn(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    form: ConnectionForm,
    sql: String,
) -> Result<QueryResult, String> {
    let query_id = make_query_id(-1, None);
    let _ = app_handle.emit(
        "query.progress",
        serde_json::json!({"queryId": query_id.clone(), "phase": "prepare"}),
    );
    let guarded_sql = apply_default_limit(&sql, Some(&form.driver));

    let database = form.database.clone();
    let driver = crate::db::drivers::connect(&form).await.map_err(String::from)?;
    let result = driver
        .execute_query_with_id(
            guarded_sql.clone(),
            if supports_query_cancellation(&form.driver) {
                Some(query_id.as_str())
            } else {
                None
            },
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

        append_sql_execution_log(
            &state,
            guarded_sql.clone(),
            Some("execute_by_conn".to_string()),
            None,
            database,
            true,
            None,
        )
        .await;
    } else if let Err(err) = &result {
        append_sql_execution_log(
            &state,
            guarded_sql.clone(),
            Some("execute_by_conn".to_string()),
            None,
            database,
            false,
            Some(err.to_string()),
        )
        .await;
    }
    result.map_err(String::from)
}

fn clamp_sql_execution_logs_limit(limit: Option<i64>) -> i64 {
    limit.unwrap_or(100).clamp(1, 100)
}

#[tauri::command]
pub async fn list_sql_execution_logs(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<SqlExecutionLog>, String> {
    let safe_limit = clamp_sql_execution_logs_limit(limit);
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };

    if let Some(db) = local_db {
        db.list_sql_execution_logs(safe_limit).await
    } else {
        Err("Local DB not initialized".to_string())
    }
}

pub async fn list_sql_execution_logs_direct(
    state: &AppState,
    limit: Option<i64>,
) -> Result<Vec<SqlExecutionLog>, String> {
    let safe_limit = clamp_sql_execution_logs_limit(limit);
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };

    if let Some(db) = local_db {
        db.list_sql_execution_logs(safe_limit).await
    } else {
        Err("Local DB not initialized".to_string())
    }
}

pub async fn cancel_query_direct(
    state: &AppState,
    uuid: String,
    query_id: String,
) -> Result<bool, String> {
    let connection_id = uuid
        .trim()
        .parse::<i64>()
        .map_err(|_| "[VALIDATION_ERROR] Invalid connection id for cancellation".to_string())?;
    let query_id = query_id.trim().to_string();
    if query_id.is_empty() {
        return Err("[VALIDATION_ERROR] query_id cannot be empty".to_string());
    }
    if !is_running_query(connection_id, &query_id).await {
        return Ok(false);
    }

    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    let db = local_db.ok_or("Local DB not initialized".to_string())?;
    let form = db.get_connection_form_by_id(connection_id).await?;

    execute_cancel_query(connection_id, &query_id, &form).await
}

#[cfg(test)]
mod tests {
    use super::{clamp_sql_execution_logs_limit, make_query_id};
    use crate::sql::query_guard::{
        apply_default_limit, classify_statement, collect_top_level_keywords, is_single_statement,
        StatementKind,
    };

    #[test]
    fn adds_limit_to_simple_select() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t", None),
            "SELECT * FROM t LIMIT 1000"
        );
    }

    #[test]
    fn keeps_existing_limit() {
        assert_eq!(
            apply_default_limit("select * from t limit 10", None),
            "select * from t limit 10"
        );
    }

    #[test]
    fn ignores_limit_column_name() {
        assert_eq!(
            apply_default_limit("SELECT limit FROM t", None),
            "SELECT limit FROM t LIMIT 1000"
        );
    }

    #[test]
    fn ignores_limit_alias() {
        assert_eq!(
            apply_default_limit("SELECT a AS limit FROM t", None),
            "SELECT a AS limit FROM t LIMIT 1000"
        );
    }

    #[test]
    fn ignores_limit_identifier_in_where() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t WHERE limit > 10", None),
            "SELECT * FROM t WHERE limit > 10 LIMIT 1000"
        );
    }

    #[test]
    fn keeps_fetch_first_rows_only() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t FETCH FIRST 20 ROWS ONLY", None),
            "SELECT * FROM t FETCH FIRST 20 ROWS ONLY"
        );
    }

    #[test]
    fn supports_leading_comment() {
        assert_eq!(
            apply_default_limit("-- c\nSELECT * FROM t", None),
            "-- c\nSELECT * FROM t LIMIT 1000"
        );
    }

    #[test]
    fn ignores_subquery_limit() {
        assert_eq!(
            apply_default_limit("SELECT * FROM (SELECT * FROM t LIMIT 5) s", None),
            "SELECT * FROM (SELECT * FROM t LIMIT 5) s LIMIT 1000"
        );
    }

    #[test]
    fn preserves_trailing_semicolon() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t;", None),
            "SELECT * FROM t LIMIT 1000;"
        );
    }

    #[test]
    fn skips_multi_statement_sql() {
        assert_eq!(
            apply_default_limit("SELECT 1; SELECT 2;", None),
            "SELECT 1; SELECT 2;"
        );
    }

    #[test]
    fn applies_to_with_select_queries() {
        assert_eq!(
            apply_default_limit("WITH cte AS (SELECT 1) SELECT * FROM cte", None),
            "WITH cte AS (SELECT 1) SELECT * FROM cte LIMIT 1000"
        );
    }

    #[test]
    fn skips_with_non_select_queries() {
        assert_eq!(
            apply_default_limit(
                "WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte",
                None
            ),
            "WITH cte AS (SELECT 1) INSERT INTO t SELECT * FROM cte"
        );
    }

    #[test]
    fn ignores_limit_inside_string_literal() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t WHERE name = 'limit x'", None),
            "SELECT * FROM t WHERE name = 'limit x' LIMIT 1000"
        );
    }

    #[test]
    fn clickhouse_skips_default_limit_when_format_clause_exists() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t FORMAT JSON", Some("clickhouse")),
            "SELECT * FROM t FORMAT JSON"
        );
    }

    #[test]
    fn clickhouse_keeps_default_limit_for_regular_select() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t", Some("clickhouse")),
            "SELECT * FROM t LIMIT 1000"
        );
    }

    #[test]
    fn mssql_adds_top_to_simple_select() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t", Some("mssql")),
            "SELECT TOP (1000) * FROM t"
        );
    }

    #[test]
    fn mssql_adds_top_with_existing_order() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t ORDER BY id DESC", Some("mssql")),
            "SELECT TOP (1000) * FROM t ORDER BY id DESC"
        );
    }

    #[test]
    fn mssql_adds_top_to_cte_select() {
        assert_eq!(
            apply_default_limit("WITH cte AS (SELECT 1) SELECT * FROM cte", Some("mssql")),
            "WITH cte AS (SELECT 1) SELECT TOP (1000) * FROM cte"
        );
    }

    #[test]
    fn mssql_adds_top_to_select_with_semicolon() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t;", Some("mssql")),
            "SELECT TOP (1000) * FROM t;"
        );
    }

    #[test]
    fn mssql_keeps_existing_top() {
        assert_eq!(
            apply_default_limit("SELECT TOP 20 * FROM t", Some("mssql")),
            "SELECT TOP 20 * FROM t"
        );
    }

    #[test]
    fn mssql_adds_fetch_to_existing_offset_clause() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t ORDER BY id OFFSET 10 ROWS", Some("mssql")),
            "SELECT * FROM t ORDER BY id OFFSET 10 ROWS FETCH NEXT 1000 ROWS ONLY"
        );
    }

    #[test]
    fn mssql_adds_fetch_to_existing_offset_clause_with_semicolon() {
        assert_eq!(
            apply_default_limit("SELECT * FROM t ORDER BY id OFFSET 10 ROWS;", Some("mssql")),
            "SELECT * FROM t ORDER BY id OFFSET 10 ROWS FETCH NEXT 1000 ROWS ONLY;"
        );
    }

    #[test]
    fn sql_logs_limit_defaults_to_100() {
        assert_eq!(clamp_sql_execution_logs_limit(None), 100);
    }

    #[test]
    fn sql_logs_limit_clamps_lower_bound() {
        assert_eq!(clamp_sql_execution_logs_limit(Some(0)), 1);
        assert_eq!(clamp_sql_execution_logs_limit(Some(-5)), 1);
    }

    #[test]
    fn sql_logs_limit_clamps_upper_bound() {
        assert_eq!(clamp_sql_execution_logs_limit(Some(101)), 100);
        assert_eq!(clamp_sql_execution_logs_limit(Some(9999)), 100);
    }

    #[test]
    fn is_single_statement_handles_comments_and_quotes() {
        assert!(is_single_statement("SELECT 1 -- comment\n"));
        assert!(is_single_statement("SELECT 'a; b'"));
        assert!(is_single_statement("SELECT \"a; b\""));
        assert!(is_single_statement("SELECT `a; b`"));
        assert!(is_single_statement(
            "CREATE FUNCTION f() RETURNS void AS $$ BEGIN PERFORM 1; END; $$ LANGUAGE plpgsql;"
        ));
        assert!(is_single_statement(
            "CREATE FUNCTION f() RETURNS text AS $tag$ BEGIN RETURN ';'; END; $tag$ LANGUAGE plpgsql;"
        ));
        assert!(!is_single_statement("SELECT 1; SELECT 2"));
    }

    #[test]
    fn is_single_statement_handles_nested_parens_and_unbalanced() {
        assert!(is_single_statement("SELECT (SELECT 1)"));
        assert!(!is_single_statement("SELECT (1;"));
        assert!(!is_single_statement("SELECT 1)"));
    }

    #[test]
    fn collect_top_level_keywords_skips_subqueries_and_strings() {
        let tokens =
            collect_top_level_keywords("WITH cte AS (SELECT 'from' AS v) SELECT * FROM cte");
        assert_eq!(tokens.first().map(String::as_str), Some("with"));
        assert!(tokens.contains(&"select".to_string()));
        assert!(tokens.contains(&"from".to_string()));
    }

    #[test]
    fn collect_top_level_keywords_skips_dollar_quoted_bodies() {
        let tokens = collect_top_level_keywords(
            "CREATE FUNCTION f() RETURNS void AS $$ BEGIN SELECT 1; END; $$ LANGUAGE plpgsql",
        );
        assert_eq!(tokens.first().map(String::as_str), Some("create"));
        assert!(tokens.contains(&"function".to_string()));
        assert!(!tokens
            .iter()
            .any(|token| token == "begin" || token == "end"));
    }

    #[test]
    fn classify_statement_classifies_with_queries() {
        assert_eq!(
            classify_statement("WITH c AS (SELECT 1) SELECT * FROM c"),
            StatementKind::Select
        );
        assert_eq!(
            classify_statement("WITH c AS (SELECT 1) UPDATE t SET a = 1"),
            StatementKind::Write
        );
    }

    #[test]
    fn make_query_id_uses_provided_and_falls_back() {
        assert_eq!(
            make_query_id(42, Some(" custom-id ".to_string())),
            "custom-id"
        );

        let generated = make_query_id(7, Some("   ".to_string()));
        assert!(generated.starts_with("q-7-"));
    }
}

#[macro_export]
macro_rules! query_commands {
    () => {
        $crate::commands::query::execute_query,
        $crate::commands::query::get_table_data,
        $crate::commands::query::cancel_query,
        $crate::commands::query::get_table_data_by_conn,
        $crate::commands::query::execute_by_conn,
        $crate::commands::query::list_sql_execution_logs,
    };
}
