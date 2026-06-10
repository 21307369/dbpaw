// Query module imports
use crate::error::AppError;
use crate::models::{QueryColumn, QueryResult, SingleResultSet};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use rust_decimal::Decimal;
use sqlx::{Column, Executor, Row, TypeInfo as PgTypeInfo};
use std::collections::{HashMap, HashSet};

fn query_error(message: impl Into<String>) -> AppError {
    AppError::query_failed(message)
}

fn build_postgres_json_projection_query(describe_sql: &str) -> String {
    let sanitized_describe_sql = super::super::strip_trailing_statement_terminator(describe_sql);
    format!(
        "SELECT to_jsonb(__dbpaw_row) AS __row_json FROM ({}) AS __dbpaw_row",
        sanitized_describe_sql
    )
}

fn is_json_projectable_statement(sql: &str) -> bool {
    matches!(
        super::super::first_sql_keyword(sql).as_deref(),
        Some("SELECT" | "WITH" | "VALUES" | "TABLE")
    )
}

fn is_high_precision_query_type(type_name: &str) -> bool {
    matches!(
        type_name.trim().to_ascii_uppercase().as_str(),
        "INT8" | "BIGINT" | "NUMERIC" | "DECIMAL" | "MONEY"
    )
}

fn collect_high_precision_query_columns(columns: &[QueryColumn]) -> HashSet<String> {
    columns
        .iter()
        .filter(|col| is_high_precision_query_type(&col.r#type))
        .map(|col| col.name.clone())
        .collect()
}

pub fn normalize_postgres_row_json(
    row_json: &mut serde_json::Value,
    high_precision_cols: &HashSet<String>,
) -> Result<(), AppError> {
    let obj = row_json
        .as_object_mut()
        .ok_or_else(|| query_error("Expected JSON object row from to_jsonb"))?;

    let mut lookup: HashMap<String, String> = HashMap::new();
    for key in obj.keys() {
        lookup.insert(key.to_ascii_lowercase(), key.clone());
    }

    for col in high_precision_cols {
        let Some(actual_key) = lookup.get(&col.to_ascii_lowercase()) else {
            continue;
        };
        let Some(value) = obj.get_mut(actual_key) else {
            continue;
        };
        if value.is_number() {
            *value = serde_json::Value::String(value.to_string());
        }
    }

    Ok(())
}

pub struct PostgresQuery {
    pub pool: sqlx::PgPool,
}

impl PostgresQuery {
    pub async fn describe_query_columns(&self, sql: &str) -> Result<Vec<QueryColumn>, AppError> {
        let describe = self
            .pool
            .describe(sql)
            .await
            .map_err(|e| query_error(e.to_string()))?;

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
        if is_json_projectable_statement(sql) {
            let columns = self.describe_query_columns(sql).await?;
            let high_precision_cols = collect_high_precision_query_columns(&columns);
            let json_query = build_postgres_json_projection_query(sql);
            let rows = sqlx::query(&json_query)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", json_query, e)))?;
            let mut data = Vec::with_capacity(rows.len());
            for row in rows {
                let mut row_json = row
                    .try_get::<sqlx::types::Json<serde_json::Value>, _>("__row_json")
                    .map(|v| v.0)
                    .map_err(|e| query_error(format!("Failed to decode __row_json: {e}")))?;
                normalize_postgres_row_json(&mut row_json, &high_precision_cols)?;
                data.push(row_json);
            }
            let row_count = data.len() as i64;
            Ok((columns, data, row_count))
        } else {
            let rows = sqlx::query(sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(e.to_string()))?;
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

            let mut data = Vec::new();
            for row in &rows {
                let mut obj = serde_json::Map::new();
                for col in row.columns() {
                    let name = col.name();
                    let type_name = col.type_info().name();
                    let value = match type_name {
                        "BOOL" => row
                            .try_get::<bool, _>(name)
                            .ok()
                            .map(serde_json::Value::Bool)
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "INT2" | "INT4" | "INT8" => row
                            .try_get::<i64, _>(name)
                            .ok()
                            .map(|v| serde_json::Value::String(v.to_string()))
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "FLOAT4" | "FLOAT8" => row
                            .try_get::<f64, _>(name)
                            .ok()
                            .map(serde_json::Value::from)
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "NUMERIC" | "MONEY" => row
                            .try_get::<Decimal, _>(name)
                            .ok()
                            .map(|v| serde_json::Value::String(v.to_string()))
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "TEXT" | "VARCHAR" | "CHAR" | "BPCHAR" | "NAME" | "UUID" => row
                            .try_get::<String, _>(name)
                            .ok()
                            .map(serde_json::Value::String)
                            .unwrap_or(serde_json::Value::Null),
                        "DATE" => row
                            .try_get::<NaiveDate, _>(name)
                            .ok()
                            .map(|v| serde_json::Value::String(v.to_string()))
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "TIME" | "TIMETZ" | "INTERVAL" => row
                            .try_get::<NaiveTime, _>(name)
                            .ok()
                            .map(|v| serde_json::Value::String(super::super::format_naive_time(&v)))
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "TIMESTAMP" => row
                            .try_get::<NaiveDateTime, _>(name)
                            .ok()
                            .map(|v| serde_json::Value::String(super::super::format_naive_datetime(&v)))
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "TIMESTAMPTZ" => row
                            .try_get::<DateTime<Utc>, _>(name)
                            .ok()
                            .map(|v| serde_json::Value::String(super::super::format_datetime_utc(&v)))
                            .or_else(|| {
                                row.try_get::<String, _>(name)
                                    .ok()
                                    .map(serde_json::Value::String)
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "JSON" | "JSONB" => row
                            .try_get::<sqlx::types::Json<serde_json::Value>, _>(name)
                            .ok()
                            .map(|v| v.0)
                            .unwrap_or(serde_json::Value::Null),
                        "_BOOL" => row
                            .try_get::<Vec<Option<bool>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(b) => serde_json::Value::Bool(b),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_INT2" => row
                            .try_get::<Vec<Option<i16>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(n) => serde_json::Value::Number(n.into()),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_INT4" => row
                            .try_get::<Vec<Option<i32>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(n) => serde_json::Value::Number(n.into()),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_INT8" => row
                            .try_get::<Vec<Option<i64>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(n) => serde_json::Value::Number(n.into()),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_FLOAT4" => row
                            .try_get::<Vec<Option<f32>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(f) => serde_json::Number::from_f64(f as f64)
                                                .map(serde_json::Value::Number)
                                                .unwrap_or_else(|| {
                                                    serde_json::Value::String(f.to_string())
                                                }),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_FLOAT8" => row
                            .try_get::<Vec<Option<f64>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(f) => serde_json::Number::from_f64(f)
                                                .map(serde_json::Value::Number)
                                                .unwrap_or_else(|| {
                                                    serde_json::Value::String(f.to_string())
                                                }),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_NUMERIC" => row
                            .try_get::<Vec<Option<Decimal>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(d) => serde_json::Value::String(d.to_string()),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_TEXT" | "_VARCHAR" | "_BPCHAR" | "_NAME" | "_UUID" => row
                            .try_get::<Vec<Option<String>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| match o {
                                            Some(s) => serde_json::Value::String(s),
                                            None => serde_json::Value::Null,
                                        })
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        "_JSON" | "_JSONB" => row
                            .try_get::<Vec<Option<serde_json::Value>>, _>(name)
                            .ok()
                            .map(|v| {
                                serde_json::Value::Array(
                                    v.into_iter()
                                        .map(|o| o.unwrap_or(serde_json::Value::Null))
                                        .collect(),
                                )
                            })
                            .unwrap_or(serde_json::Value::Null),
                        _ => {
                            if let Ok(v) = row.try_get::<String, _>(name) {
                                serde_json::Value::String(v)
                            } else if let Ok(v) = row.try_get::<Vec<u8>, _>(name) {
                                serde_json::Value::String(String::from_utf8_lossy(&v).to_string())
                            } else {
                                serde_json::Value::Null
                            }
                        }
                    };
                    obj.insert(name.to_string(), value);
                }
                data.push(serde_json::Value::Object(obj));
            }
            let row_count = rows.len() as i64;
            Ok((columns, data, row_count))
        }
    }

    pub async fn execute_query(&self, sql: String) -> Result<QueryResult, AppError> {
        let start = std::time::Instant::now();
        let statements = super::super::split_sql_statements(&sql);
        if statements.is_empty() {
            return Err(query_error("Empty SQL statement"));
        }

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

    #[test]
    fn test_build_postgres_json_projection_query_strips_trailing_semicolon() {
        let sql = build_postgres_json_projection_query("SELECT * FROM t LIMIT 1000;");
        assert!(sql.contains("FROM (SELECT * FROM t LIMIT 1000) AS __dbpaw_row"));
        assert!(!sql.contains(";) AS __dbpaw_row"));
    }

    #[test]
    fn test_build_postgres_json_projection_query_strips_multiple_trailing_semicolons() {
        let sql = build_postgres_json_projection_query("SELECT * FROM t;;;");
        assert!(sql.contains("FROM (SELECT * FROM t) AS __dbpaw_row"));
        assert!(!sql.contains(";) AS __dbpaw_row"));
    }

    #[test]
    fn test_is_json_projectable_statement() {
        assert!(is_json_projectable_statement("SELECT 1"));
        assert!(is_json_projectable_statement(
            "  -- a\nWITH t AS (SELECT 1) SELECT * FROM t"
        ));
        assert!(is_json_projectable_statement("VALUES (1), (2)"));
        assert!(is_json_projectable_statement("TABLE my_table"));
        assert!(!is_json_projectable_statement("INSERT INTO t VALUES (1)"));
        assert!(!is_json_projectable_statement("UPDATE t SET a = 1"));
    }

    #[test]
    fn test_collect_high_precision_query_columns() {
        let columns = vec![
            QueryColumn {
                name: "id".to_string(),
                r#type: "INT8".to_string(),
            },
            QueryColumn {
                name: "amount".to_string(),
                r#type: "NUMERIC".to_string(),
            },
            QueryColumn {
                name: "title".to_string(),
                r#type: "TEXT".to_string(),
            },
        ];
        let picked = collect_high_precision_query_columns(&columns);
        assert!(picked.contains("id"));
        assert!(picked.contains("amount"));
        assert!(!picked.contains("title"));
    }

    #[test]
    fn test_normalize_postgres_row_json_stringifies_high_precision_numbers() {
        let mut row = serde_json::json!({
            "col_bigint": 9007199254740993_i64,
            "col_numeric": 1234.56,
            "col_text": "hello",
            "col_null": null
        });
        let high_precision_cols =
            HashSet::from(["col_bigint".to_string(), "COL_NUMERIC".to_string()]);

        normalize_postgres_row_json(&mut row, &high_precision_cols).unwrap();

        assert_eq!(
            row.get("col_bigint").and_then(|v| v.as_str()),
            Some("9007199254740993")
        );
        assert_eq!(
            row.get("col_numeric").and_then(|v| v.as_str()),
            Some("1234.56")
        );
        assert_eq!(row.get("col_text").and_then(|v| v.as_str()), Some("hello"));
        assert!(row.get("col_null").unwrap().is_null());
    }

    #[test]
    fn test_normalize_postgres_row_json_requires_object() {
        let mut row = serde_json::json!(["a", "b"]);
        let high_precision_cols = HashSet::from(["id".to_string()]);
        assert!(normalize_postgres_row_json(&mut row, &high_precision_cols).is_err());
    }

    #[test]
    fn test_split_sql_statements_multi_ddl() {
        let sql = "CREATE TYPE mood_enum AS ENUM ('sad', 'ok'); CREATE TYPE address_type AS (street VARCHAR(100));";
        let statements = super::super::super::split_sql_statements(sql);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0], "CREATE TYPE mood_enum AS ENUM ('sad', 'ok')");
        assert_eq!(
            statements[1],
            "CREATE TYPE address_type AS (street VARCHAR(100))"
        );
    }

    #[test]
    fn test_split_sql_statements_ignores_semicolon_in_literal_and_comment() {
        let sql = "SELECT ';' AS x; -- noop ;\nSELECT 1;";
        let statements = super::super::super::split_sql_statements(sql);
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0], "SELECT ';' AS x");
        assert_eq!(statements[1], "SELECT 1");
    }

    #[test]
    fn test_split_sql_statements_handles_domain_check_and_table_ddl() {
        let sql = "
CREATE DOMAIN email_domain AS VARCHAR(255)
    CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$');

CREATE TABLE pg_data_type_test (
    id BIGSERIAL PRIMARY KEY,
    col_domain email_domain
);";
        let statements = super::super::super::split_sql_statements(sql);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].starts_with("CREATE DOMAIN email_domain"));
        assert!(statements[1].starts_with("CREATE TABLE pg_data_type_test"));
    }

    #[test]
    fn test_split_sql_statements_keeps_postgres_dollar_quoted_function_intact() {
        let sql = r#"
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;
"#;
        let statements = super::super::super::split_sql_statements(sql);
        assert_eq!(statements.len(), 1);
        assert!(statements[0].contains("NEW.updated_at = CURRENT_TIMESTAMP;"));
        assert!(statements[0].ends_with("$$"));
    }

    #[test]
    fn test_split_sql_statements_keeps_tagged_dollar_quoted_function_intact() {
        let sql = r#"
CREATE FUNCTION demo()
RETURNS text LANGUAGE plpgsql AS $body$
BEGIN
    RETURN 'ok';
END;
$body$;
"#;
        let statements = super::super::super::split_sql_statements(sql);
        assert_eq!(statements.len(), 1);
        assert!(statements[0].contains("RETURN 'ok';"));
        assert!(statements[0].ends_with("$body$"));
    }
}
