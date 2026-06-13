use crate::error::AppError;
use crate::models::{QueryColumn, QueryResult, SingleResultSet};
use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use sqlx::{Column, Executor, Row, TypeInfo, ValueRef};

fn sqlite_temporal_decl_kind(declared_type: Option<&str>) -> Option<&'static str> {
    let ty = declared_type?.trim().to_ascii_lowercase();
    if ty.contains("datetime") || ty.contains("timestamp") {
        return Some("datetime");
    }
    if ty == "time" || ty.contains(" time") || ty.starts_with("time(") {
        return Some("time");
    }
    if ty.contains("date") {
        return Some("date");
    }
    None
}

fn sqlite_declared_bool(declared_type: Option<&str>) -> bool {
    declared_type
        .map(|ty| {
            let lower = ty.to_ascii_lowercase();
            lower.contains("bool")
        })
        .unwrap_or(false)
}

fn sqlite_format_date_from_days(days_since_epoch: i64) -> Option<String> {
    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1)?;
    epoch
        .checked_add_signed(Duration::days(days_since_epoch))
        .map(|d| d.format("%F").to_string())
}

fn sqlite_format_time_from_seconds_f64(seconds: f64) -> Option<String> {
    let day_secs = 86_400.0_f64;
    let normalized = seconds.rem_euclid(day_secs);
    let sec_int = normalized.trunc() as u32;
    let nanos = ((normalized.fract() * 1_000_000_000.0).round() as u32).min(999_999_999);
    NaiveTime::from_num_seconds_from_midnight_opt(sec_int, nanos)
        .map(|t| t.format("%T%.f").to_string())
}

fn sqlite_format_datetime_from_unix_seconds_f64(seconds: f64) -> Option<String> {
    let sec_int = seconds.trunc() as i64;
    let nanos = ((seconds.fract() * 1_000_000_000.0).round() as u32).min(999_999_999);
    DateTime::<Utc>::from_timestamp(sec_int, nanos)
        .map(|dt| dt.naive_utc().format("%F %T%.f").to_string())
}

fn sqlite_normalize_temporal_text(value: &str, temporal_kind: &str) -> Option<String> {
    let text = value.trim();
    if text.is_empty() {
        return None;
    }

    match temporal_kind {
        "date" => NaiveDate::parse_from_str(text, "%Y-%m-%d")
            .ok()
            .map(|d| d.format("%F").to_string()),
        "time" => {
            for fmt in ["%H:%M:%S%.f", "%H:%M:%S"] {
                if let Ok(t) = NaiveTime::parse_from_str(text, fmt) {
                    return Some(t.format("%T%.f").to_string());
                }
            }
            None
        }
        "datetime" => {
            if let Ok(dt) = DateTime::parse_from_rfc3339(text) {
                return Some(dt.to_rfc3339());
            }
            for fmt in ["%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"] {
                if let Ok(dt) = NaiveDateTime::parse_from_str(text, fmt) {
                    return Some(dt.format("%F %T%.f").to_string());
                }
            }
            None
        }
        _ => None,
    }
}

fn sqlite_number_from_f64(v: f64) -> serde_json::Value {
    serde_json::Number::from_f64(v)
        .map(serde_json::Value::Number)
        .unwrap_or_else(|| serde_json::Value::String(v.to_string()))
}

pub(crate) fn sqlite_cell_to_json(
    row: &sqlx::sqlite::SqliteRow,
    column_name: &str,
    declared_type: Option<&str>,
) -> Result<serde_json::Value, AppError> {
    let temporal_kind = sqlite_temporal_decl_kind(declared_type);
    let declared_bool = sqlite_declared_bool(declared_type);

    let raw = row.try_get_raw(column_name).map_err(|e| {
        AppError::query_failed(format!(
            "Failed to read SQLite column '{}': {}",
            column_name, e
        ))
    })?;
    if raw.is_null() {
        return Ok(serde_json::Value::Null);
    }
    let runtime_type = raw.type_info().name().to_string();

    Ok(match runtime_type.as_str() {
        "INTEGER" => {
            let v = row.try_get::<i64, _>(column_name).map_err(|e| {
                AppError::query_failed(format!(
                    "Failed to decode SQLite INTEGER column '{}': {}",
                    column_name, e
                ))
            })?;
            if declared_bool {
                serde_json::Value::Bool(v != 0)
            } else if let Some(kind) = temporal_kind {
                match kind {
                    "date" => {
                        let maybe_date = if (-200_000..=200_000).contains(&v) {
                            sqlite_format_date_from_days(v)
                        } else {
                            sqlite_format_datetime_from_unix_seconds_f64(v as f64).and_then(|s| {
                                NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.f")
                                    .ok()
                                    .map(|dt| dt.date().format("%F").to_string())
                            })
                        };
                        maybe_date
                            .map(serde_json::Value::String)
                            .unwrap_or_else(|| serde_json::Value::String(v.to_string()))
                    }
                    "time" => sqlite_format_time_from_seconds_f64(v as f64)
                        .map(serde_json::Value::String)
                        .unwrap_or_else(|| serde_json::Value::String(v.to_string())),
                    "datetime" => sqlite_format_datetime_from_unix_seconds_f64(v as f64)
                        .map(serde_json::Value::String)
                        .unwrap_or_else(|| serde_json::Value::String(v.to_string())),
                    _ => serde_json::Value::String(v.to_string()),
                }
            } else {
                serde_json::Value::String(v.to_string())
            }
        }
        "REAL" => {
            let v = row.try_get::<f64, _>(column_name).map_err(|e| {
                AppError::query_failed(format!(
                    "Failed to decode SQLite REAL column '{}': {}",
                    column_name, e
                ))
            })?;
            if let Some(kind) = temporal_kind {
                match kind {
                    "time" => sqlite_format_time_from_seconds_f64(v)
                        .map(serde_json::Value::String)
                        .unwrap_or_else(|| sqlite_number_from_f64(v)),
                    "datetime" => sqlite_format_datetime_from_unix_seconds_f64(v)
                        .map(serde_json::Value::String)
                        .unwrap_or_else(|| sqlite_number_from_f64(v)),
                    "date" => sqlite_format_datetime_from_unix_seconds_f64(v)
                        .and_then(|s| {
                            NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S%.f")
                                .ok()
                                .map(|dt| dt.date().format("%F").to_string())
                        })
                        .map(serde_json::Value::String)
                        .unwrap_or_else(|| sqlite_number_from_f64(v)),
                    _ => sqlite_number_from_f64(v),
                }
            } else {
                sqlite_number_from_f64(v)
            }
        }
        "TEXT" => {
            let s = row.try_get::<String, _>(column_name).map_err(|e| {
                AppError::query_failed(format!(
                    "Failed to decode SQLite TEXT column '{}': {}",
                    column_name, e
                ))
            })?;
            if let Some(kind) = temporal_kind {
                sqlite_normalize_temporal_text(&s, kind)
                    .map(serde_json::Value::String)
                    .unwrap_or(serde_json::Value::String(s))
            } else {
                serde_json::Value::String(s)
            }
        }
        "BLOB" => {
            let x = row.try_get::<Vec<u8>, _>(column_name).map_err(|e| {
                AppError::query_failed(format!(
                    "Failed to decode SQLite BLOB column '{}': {}",
                    column_name, e
                ))
            })?;
            serde_json::Value::String(String::from_utf8_lossy(&x).to_string())
        }
        _ => {
            if let Ok(v) = row.try_get::<String, _>(column_name) {
                serde_json::Value::String(v)
            } else if let Ok(v) = row.try_get::<Vec<u8>, _>(column_name) {
                serde_json::Value::String(String::from_utf8_lossy(&v).to_string())
            } else {
                return Err(AppError::query_failed(format!(
                    "Unsupported SQLite runtime type '{}' for column '{}'",
                    runtime_type, column_name
                )));
            }
        }
    })
}

pub struct SqliteQuery {
    pub pool: sqlx::SqlitePool,
}

impl SqliteQuery {
    async fn describe_query_columns(&self, sql: &str) -> Result<Vec<QueryColumn>, AppError> {
        let describe = self
            .pool
            .describe(sql)
            .await
            .map_err(|e| AppError::query_failed(format!("{e}")))?;

        Ok(describe
            .columns()
            .iter()
            .map(|col| QueryColumn {
                name: col.name().to_string(),
                r#type: col.type_info().name().to_string(),
            })
            .collect())
    }

    async fn execute_single_statement(
        &self,
        sql: &str,
    ) -> Result<(Vec<QueryColumn>, Vec<serde_json::Value>, i64), AppError> {
        let first_keyword = super::super::first_sql_keyword(sql);
        let sql_lower = sql.to_lowercase();
        let should_fetch_rows = matches!(
            first_keyword.as_deref(),
            Some("SELECT") | Some("PRAGMA") | Some("WITH") | Some("EXPLAIN")
        ) || sql_lower.contains(" returning ");

        if should_fetch_rows {
            let rows = sqlx::query(sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| AppError::query_failed(format!("{e}")))?;

            let mut data = Vec::new();
            let columns = if let Some(first_row) = rows.first() {
                first_row
                    .columns()
                    .iter()
                    .map(|col| QueryColumn {
                        name: col.name().to_string(),
                        r#type: col.type_info().to_string(),
                    })
                    .collect()
            } else {
                self.describe_query_columns(sql).await?
            };

            for row in &rows {
                let mut obj = serde_json::Map::new();
                for col in row.columns() {
                    let name = col.name();
                    let value = sqlite_cell_to_json(row, name, Some(col.type_info().name()))?;
                    obj.insert(name.to_string(), value);
                }
                data.push(serde_json::Value::Object(obj));
            }

            Ok((columns, data, rows.len() as i64))
        } else {
            let exec = sqlx::query(sql)
                .execute(&self.pool)
                .await
                .map_err(|e| AppError::query_failed(format!("{e}")))?;
            Ok((Vec::new(), Vec::new(), exec.rows_affected() as i64))
        }
    }

    pub async fn execute_query(&self, sql: String) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let statements = super::super::split_sql_statements(&sql);
        if statements.is_empty() {
            return Err(AppError::query_failed("Empty SQL statement"));
        }

        // Single statement: keep original behavior
        if statements.len() == 1 {
            let last_sql = statements.last().unwrap();
            let (columns, data, row_count) = self.execute_single_statement(last_sql).await?;
            let duration = start.elapsed();
            return Ok(QueryResult {
                data,
                row_count,
                columns,
                time_taken_ms: duration.as_millis() as i64,
                success: true,
                error: None,
                result_sets: None,
            });
        }

        // Multiple statements: execute each and collect results
        let mut result_sets = Vec::new();
        let mut last_error: Option<String> = None;

        for (idx, statement) in statements.iter().enumerate() {
            match self.execute_single_statement(statement).await {
                Ok((columns, data, row_count)) => {
                    result_sets.push(SingleResultSet {
                        data,
                        row_count,
                        columns,
                        index: idx as u32,
                        statement: statement.clone(),
                    });
                }
                Err(e) => {
                    last_error = Some(e.to_string());
                    break;
                }
            }
        }

        let duration = start.elapsed();

        if let Some(err) = last_error {
            // Partial success: return collected results + error
            return Ok(QueryResult {
                data: vec![],
                row_count: 0,
                columns: vec![],
                time_taken_ms: duration.as_millis() as i64,
                success: false,
                error: Some(err),
                result_sets: Some(result_sets),
            });
        }

        // All succeeded
        Ok(QueryResult {
            data: vec![],
            row_count: 0,
            columns: vec![],
            time_taken_ms: duration.as_millis() as i64,
            success: true,
            error: None,
            result_sets: Some(result_sets),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_db_path() -> String {
        let mut p = std::env::temp_dir();
        p.push(format!("dbpaw-sqlite-test-{}.db", Uuid::new_v4()));
        p.to_string_lossy().to_string()
    }

    #[tokio::test]
    async fn test_execute_query_select_and_dml() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);".to_string())
            .await
            .unwrap();

        let insert_result = query
            .execute_query("INSERT INTO items (name) VALUES ('a'), ('b');".to_string())
            .await
            .unwrap();
        assert_eq!(insert_result.row_count, 2);

        let update_result = query
            .execute_query("UPDATE items SET name = 'c' WHERE id = 1;".to_string())
            .await
            .unwrap();
        assert_eq!(update_result.row_count, 1);

        let select_result = query
            .execute_query("SELECT id, name FROM items ORDER BY id;".to_string())
            .await
            .unwrap();
        assert_eq!(select_result.row_count, 2);
        assert_eq!(select_result.columns.len(), 2);
        assert_eq!(
            select_result.data[0]["name"],
            serde_json::Value::String("c".to_string())
        );

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_execute_query_select_with_leading_line_comment() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);".to_string())
            .await
            .unwrap();
        query
            .execute_query("INSERT INTO users (name) VALUES ('alice'), ('bob');".to_string())
            .await
            .unwrap();

        let result = query
            .execute_query(
                "-- leading comment\nSELECT id, name FROM users ORDER BY id DESC;".to_string(),
            )
            .await
            .unwrap();
        assert_eq!(result.row_count, 2);
        assert_eq!(result.columns.len(), 2);
        assert_eq!(
            result.data[0]["name"],
            serde_json::Value::String("bob".to_string())
        );

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_execute_query_empty_result_keeps_columns() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);".to_string())
            .await
            .unwrap();
        query
            .execute_query("INSERT INTO users (name) VALUES ('alice'), ('bob');".to_string())
            .await
            .unwrap();

        let result = query
            .execute_query("SELECT id, name FROM users WHERE id < 0;".to_string())
            .await
            .unwrap();

        assert_eq!(result.row_count, 0);
        assert_eq!(result.data.len(), 0);
        assert_eq!(result.columns.len(), 2);
        assert_eq!(result.columns[0].name, "id");
        assert_eq!(result.columns[1].name, "name");

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_sqlite_number_from_f64_nan_and_inf_stringified() {
        assert_eq!(
            sqlite_number_from_f64(f64::NAN),
            serde_json::Value::String("NaN".to_string())
        );
        assert_eq!(
            sqlite_number_from_f64(f64::INFINITY),
            serde_json::Value::String("inf".to_string())
        );
    }

    #[tokio::test]
    async fn test_execute_query_multiple_select_returns_result_sets() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query(
                "CREATE TABLE t1 (id INTEGER PRIMARY KEY, name TEXT); \
                 CREATE TABLE t2 (id INTEGER PRIMARY KEY, value INTEGER); \
                 INSERT INTO t1 (name) VALUES ('alice'), ('bob'); \
                 INSERT INTO t2 (value) VALUES (10), (20), (30);"
                    .to_string(),
            )
            .await
            .unwrap();

        // Multiple SELECT statements should return result_sets
        let result = query
            .execute_query(
                "SELECT * FROM t1 ORDER BY id; SELECT * FROM t2 ORDER BY id;".to_string(),
            )
            .await
            .unwrap();

        assert!(result.success);
        assert!(result.result_sets.is_some());

        let result_sets = result.result_sets.unwrap();
        assert_eq!(result_sets.len(), 2);

        // First result set: t1
        assert_eq!(result_sets[0].index, 0);
        assert_eq!(result_sets[0].row_count, 2);
        assert_eq!(result_sets[0].columns.len(), 2);
        assert_eq!(result_sets[0].columns[0].name, "id");
        assert_eq!(result_sets[0].columns[1].name, "name");
        assert_eq!(
            result_sets[0].data[0]["name"],
            serde_json::Value::String("alice".to_string())
        );

        // Second result set: t2
        assert_eq!(result_sets[1].index, 1);
        assert_eq!(result_sets[1].row_count, 3);
        assert_eq!(result_sets[1].columns.len(), 2);
        assert_eq!(result_sets[1].columns[0].name, "id");
        assert_eq!(result_sets[1].columns[1].name, "value");

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_execute_query_single_select_no_result_sets() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query("CREATE TABLE t1 (id INTEGER PRIMARY KEY, name TEXT);".to_string())
            .await
            .unwrap();
        query
            .execute_query("INSERT INTO t1 (name) VALUES ('alice');".to_string())
            .await
            .unwrap();

        // Single SELECT should NOT have result_sets
        let result = query
            .execute_query("SELECT * FROM t1;".to_string())
            .await
            .unwrap();

        assert!(result.success);
        assert!(result.result_sets.is_none());
        assert_eq!(result.row_count, 1);
        assert_eq!(result.columns.len(), 2);

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_execute_query_multiple_mixed_statements() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query("CREATE TABLE t1 (id INTEGER PRIMARY KEY, name TEXT);".to_string())
            .await
            .unwrap();

        // Mix of DML and SELECT
        let result = query
            .execute_query(
                "INSERT INTO t1 (name) VALUES ('alice'); \
                 INSERT INTO t1 (name) VALUES ('bob'); \
                 SELECT * FROM t1 ORDER BY id;"
                    .to_string(),
            )
            .await
            .unwrap();

        assert!(result.success);
        assert!(result.result_sets.is_some());

        let result_sets = result.result_sets.unwrap();
        assert_eq!(result_sets.len(), 3);

        // First two are DML (no columns)
        assert_eq!(result_sets[0].row_count, 1); // INSERT affected 1 row
        assert!(result_sets[0].columns.is_empty());

        assert_eq!(result_sets[1].row_count, 1);
        assert!(result_sets[1].columns.is_empty());

        // Third is SELECT
        assert_eq!(result_sets[2].row_count, 2);
        assert_eq!(result_sets[2].columns.len(), 2);

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_execute_query_multiple_partial_failure() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let query = SqliteQuery { pool: conn.pool.clone() };

        query
            .execute_query("CREATE TABLE t1 (id INTEGER PRIMARY KEY, name TEXT);".to_string())
            .await
            .unwrap();

        // Second statement has syntax error
        let result = query
            .execute_query(
                "INSERT INTO t1 (name) VALUES ('alice'); \
                 INVALID SQL SYNTAX; \
                 SELECT * FROM t1;"
                    .to_string(),
            )
            .await
            .unwrap();

        // Should fail but include partial results
        assert!(!result.success);
        assert!(result.error.is_some());
        assert!(result.result_sets.is_some());

        let result_sets = result.result_sets.unwrap();
        assert_eq!(result_sets.len(), 1); // Only first INSERT succeeded
        assert_eq!(result_sets[0].row_count, 1);

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }
}
