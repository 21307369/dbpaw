use super::connection::DuckdbConnection;
use super::helpers::{
    duckdb_cell_to_json, duckdb_table_ref, duckdb_value_ref_type_name, quote_ident,
    sql_contains_keyword,
};
use crate::db::drivers::DriverResult;
use crate::error::AppError;
use crate::models::{QueryColumn, QueryResult, SingleResultSet, TableDataResponse};

#[derive(Debug)]
pub struct DuckdbQuery {
    pub connection: DuckdbConnection,
}

impl DuckdbQuery {
    pub async fn get_table_data(
        &self,
        schema: String,
        table: String,
        page: i64,
        limit: i64,
        sort_column: Option<String>,
        sort_direction: Option<String>,
        filter: Option<String>,
        order_by: Option<String>,
    ) -> DriverResult<TableDataResponse> {
        self.connection
            .run_blocking(move |conn| {
                let start = std::time::Instant::now();
                let safe_page = if page < 1 { 1 } else { page };
                let safe_limit = if limit < 1 { 100 } else { limit };
                let offset = (safe_page - 1) * safe_limit;
                let table_ref = duckdb_table_ref(&schema, &table);

                let filter = filter.map(|f| super::super::normalize_quotes(&f));
                let order_by = order_by.map(|f| super::super::normalize_quotes(&f));

                let where_clause = match &filter {
                    Some(f) if !f.trim().is_empty() => format!(" WHERE {}", f.trim()),
                    _ => String::new(),
                };

                let count_query = format!("SELECT COUNT(*) FROM {}{}", table_ref, where_clause);
                let total: i64 = conn
                    .query_row(&count_query, [], |row| row.get(0))
                    .map_err(|e| AppError::query_failed(format!("SQL: {} | {}", count_query, e)))?;

                let order_clause = if let Some(ref ob) = order_by {
                    if !ob.trim().is_empty() {
                        format!(" ORDER BY {}", ob.trim())
                    } else {
                        String::new()
                    }
                } else if let Some(ref col) = sort_column {
                    if !col.chars().all(|c| c.is_alphanumeric() || c == '_') {
                        return Err(AppError::validation("Invalid sort column name"));
                    }
                    let dir = match sort_direction.as_deref() {
                        Some("desc") => "DESC",
                        _ => "ASC",
                    };
                    format!(" ORDER BY {} {}", quote_ident(col), dir)
                } else {
                    String::new()
                };

                let query = format!(
                    "SELECT * FROM {}{}{} LIMIT {} OFFSET {}",
                    table_ref, where_clause, order_clause, safe_limit, offset
                );
                let mut stmt = conn
                    .prepare(&query)
                    .map_err(|e| AppError::query_failed(format!("SQL: {} | {}", query, e)))?;
                let mut rows = stmt
                    .query([])
                    .map_err(|e| AppError::query_failed(format!("SQL: {} | {}", query, e)))?;
                let col_names: Vec<String> =
                    rows.as_ref().map(|s| s.column_names()).unwrap_or_default();

                let mut data = Vec::new();
                while let Some(row) = rows
                    .next()
                    .map_err(|e| AppError::query_failed(format!("{e}")))?
                {
                    let mut obj = serde_json::Map::new();
                    for (idx, name) in col_names.iter().enumerate() {
                        let cell = duckdb_cell_to_json(row, idx, name)?;
                        obj.insert(name.to_string(), cell);
                    }
                    data.push(serde_json::Value::Object(obj));
                }

                let duration = start.elapsed();
                Ok(TableDataResponse {
                    data,
                    total,
                    page: safe_page,
                    limit: safe_limit,
                    execution_time_ms: duration.as_millis() as i64,
                })
            })
            .await
    }

    pub async fn execute_query(&self, sql: String) -> DriverResult<QueryResult> {
        self.connection
            .run_blocking(move |conn| {
                let start = std::time::Instant::now();
                let statements = super::super::split_sql_statements(&sql);
                if statements.is_empty() {
                    return Err(AppError::query_failed("Empty SQL statement"));
                }

                // Single statement: keep original behavior
                if statements.len() == 1 {
                    let last_sql = statements.last().unwrap();
                    let first_keyword = super::super::first_sql_keyword(last_sql);
                    let should_fetch_rows = matches!(
                        first_keyword.as_deref(),
                        Some("SELECT")
                            | Some("PRAGMA")
                            | Some("WITH")
                            | Some("EXPLAIN")
                            | Some("SHOW")
                            | Some("DESCRIBE")
                            | Some("DESC")
                            | Some("VALUES")
                    ) || sql_contains_keyword(last_sql, "returning");

                    if should_fetch_rows {
                        let mut stmt = conn
                            .prepare(last_sql)
                            .map_err(|e| AppError::query_failed(format!("{e}")))?;
                        let mut rows = stmt
                            .query([])
                            .map_err(|e| AppError::query_failed(format!("{e}")))?;
                        let columns: Vec<QueryColumn> = rows
                            .as_ref()
                            .map(|s| {
                                s.column_names()
                                    .into_iter()
                                    .map(|name| QueryColumn {
                                        name,
                                        r#type: "UNKNOWN".to_string(),
                                    })
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default();
                        let mut columns = columns;
                        let mut data = Vec::new();
                        let mut inferred_types = false;
                        while let Some(row) = rows
                            .next()
                            .map_err(|e| AppError::query_failed(format!("{e}")))?
                        {
                            if !inferred_types {
                                for (idx, col) in columns.iter_mut().enumerate() {
                                    if let Ok(v) = row.get_ref(idx) {
                                        col.r#type = duckdb_value_ref_type_name(&v).to_string();
                                    }
                                }
                                inferred_types = true;
                            }
                            let mut obj = serde_json::Map::new();
                            for (idx, col) in columns.iter().enumerate() {
                                let cell = duckdb_cell_to_json(row, idx, &col.name)?;
                                obj.insert(col.name.clone(), cell);
                            }
                            data.push(serde_json::Value::Object(obj));
                        }

                        return Ok(QueryResult {
                            row_count: data.len() as i64,
                            data,
                            columns,
                            time_taken_ms: start.elapsed().as_millis() as i64,
                            success: true,
                            error: None,
                            result_sets: None,
                        });
                    }

                    let row_count = match conn.execute(last_sql, []) {
                        Ok(v) => v as i64,
                        Err(_) => {
                            conn.execute_batch(last_sql)
                                .map_err(|e| AppError::query_failed(format!("{e}")))?;
                            0
                        }
                    };

                    return Ok(QueryResult {
                        data: vec![],
                        row_count,
                        columns: vec![],
                        time_taken_ms: start.elapsed().as_millis() as i64,
                        success: true,
                        error: None,
                        result_sets: None,
                    });
                }

                // Multiple statements: execute each and collect results
                let mut result_sets = Vec::new();
                let mut last_error: Option<String> = None;

                for (idx, statement) in statements.iter().enumerate() {
                    let first_keyword = super::super::first_sql_keyword(statement);
                    let should_fetch_rows = matches!(
                        first_keyword.as_deref(),
                        Some("SELECT")
                            | Some("PRAGMA")
                            | Some("WITH")
                            | Some("EXPLAIN")
                            | Some("SHOW")
                            | Some("DESCRIBE")
                            | Some("DESC")
                            | Some("VALUES")
                    ) || sql_contains_keyword(statement, "returning");

                    let result: Result<(Vec<QueryColumn>, Vec<serde_json::Value>, i64), AppError> =
                        if should_fetch_rows {
                            let mut stmt = match conn.prepare(statement) {
                                Ok(s) => s,
                                Err(e) => {
                                    last_error =
                                        Some(AppError::query_failed(format!("{e}")).to_string());
                                    break;
                                }
                            };
                            let mut rows = match stmt.query([]) {
                                Ok(r) => r,
                                Err(e) => {
                                    last_error =
                                        Some(AppError::query_failed(format!("{e}")).to_string());
                                    break;
                                }
                            };
                            let columns: Vec<QueryColumn> = rows
                                .as_ref()
                                .map(|s| {
                                    s.column_names()
                                        .into_iter()
                                        .map(|name| QueryColumn {
                                            name,
                                            r#type: "UNKNOWN".to_string(),
                                        })
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default();
                            let mut columns = columns;
                            let mut data = Vec::new();
                            let mut inferred_types = false;
                            while let Some(row) = rows
                                .next()
                                .map_err(|e| AppError::query_failed(format!("{e}")))?
                            {
                                if !inferred_types {
                                    for (i, col) in columns.iter_mut().enumerate() {
                                        if let Ok(v) = row.get_ref(i) {
                                            col.r#type =
                                                duckdb_value_ref_type_name(&v).to_string();
                                        }
                                    }
                                    inferred_types = true;
                                }
                                let mut obj = serde_json::Map::new();
                                for (i, col) in columns.iter().enumerate() {
                                    let cell = duckdb_cell_to_json(row, i, &col.name)?;
                                    obj.insert(col.name.clone(), cell);
                                }
                                data.push(serde_json::Value::Object(obj));
                            }
                            let row_count = data.len() as i64;
                            Ok((columns, data, row_count))
                        } else {
                            let row_count = match conn.execute(statement, []) {
                                Ok(v) => v as i64,
                                Err(_) => {
                                    conn.execute_batch(statement)
                                        .map_err(|e| AppError::query_failed(format!("{e}")))?;
                                    0
                                }
                            };
                            Ok((Vec::new(), Vec::new(), row_count))
                        };

                    match result {
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
            })
            .await
    }
}
