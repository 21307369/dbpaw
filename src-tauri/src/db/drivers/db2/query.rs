use super::connection::Db2Config;
use super::super::{conn_failed_error, DriverResult};
use crate::error::AppError;
use crate::models::{QueryColumn, QueryResult, SingleResultSet};
use odbc_api::{ConnectionOptions, Cursor, ResultSetMetadata};

pub struct Db2Query {
    pub config: Db2Config,
}

fn odbc_value_to_json(row: &mut odbc_api::CursorRow<'_>, col_idx: u16) -> serde_json::Value {
    let mut buf = Vec::new();
    match row.get_text(col_idx, &mut buf) {
        Ok(true) => {
            let s = String::from_utf8_lossy(&buf).to_string();
            if s.is_empty() {
                return serde_json::Value::String(s);
            }
            if let Ok(v) = s.parse::<i64>() {
                return serde_json::Value::Number(v.into());
            }
            if let Ok(v) = s.parse::<f64>() {
                if let Some(n) = serde_json::Number::from_f64(v) {
                    return serde_json::Value::Number(n);
                }
                return serde_json::Value::String(s);
            }
            serde_json::Value::String(s)
        }
        Ok(false) => serde_json::Value::Null,
        Err(_) => serde_json::Value::Null,
    }
}

impl Db2Query {
    async fn run_blocking<F, T>(&self, f: F) -> DriverResult<T>
    where
        F: FnOnce(odbc_api::Connection<'_>) -> DriverResult<T> + Send + 'static,
        T: Send + 'static,
    {
        let cfg = self.config.clone();
        tokio::task::spawn_blocking(move || {
            let conn_string = super::connection::build_connection_string(&cfg);
            let env = odbc_api::Environment::new().map_err(|e| conn_failed_error(&e))?;
            let conn = env
                .connect_with_connection_string(&conn_string, ConnectionOptions::default())
                .map_err(|e| conn_failed_error(&e))?;
            f(conn)
        })
        .await
        .map_err(|e| AppError::internal(format!("DB2 blocking task failed: {e}")))?
    }

    pub async fn execute_query(&self, sql: String) -> DriverResult<QueryResult> {
        let start = std::time::Instant::now();
        let statements = super::super::split_sql_statements(&sql);
        if statements.is_empty() {
            return Err(AppError::query_failed("Empty SQL statement"));
        }

        if statements.len() == 1 {
            let last_sql = statements.last().unwrap().clone();
            return self
                .run_blocking(move |conn| {
                    let sql_clean = super::super::strip_trailing_statement_terminator(&last_sql);
                    let first_kw = super::super::first_sql_keyword(sql_clean);
                    let is_read = matches!(
                        first_kw.as_deref(),
                        Some("SELECT") | Some("WITH") | Some("SHOW")
                    );

                    if is_read {
                        let cursor = conn
                            .execute(sql_clean, ())
                            .map_err(|e| AppError::query_failed(e.to_string()))?;
                        match cursor {
                            Some(mut c) => {
                                let num_cols = c
                                    .num_result_cols()
                                    .map_err(|e| AppError::query_failed(e.to_string()))?
                                    as u16;
                                let mut col_names = Vec::with_capacity(num_cols as usize);
                                let mut col_types = Vec::with_capacity(num_cols as usize);
                                for i in 1..=num_cols {
                                    let name = c
                                        .col_name(i)
                                        .map_err(|e| AppError::query_failed(e.to_string()))?;
                                    let data_type = c
                                        .col_data_type(i)
                                        .map_err(|e| AppError::query_failed(e.to_string()))?;
                                    col_names.push(name.clone());
                                    col_types.push(format!("{:?}", data_type));
                                }
                                let columns: Vec<QueryColumn> = col_names
                                    .iter()
                                    .zip(col_types.iter())
                                    .map(|(name, ty)| QueryColumn {
                                        name: name.clone(),
                                        r#type: ty.clone(),
                                    })
                                    .collect();

                                let mut data = Vec::new();
                                while let Some(mut row) = c
                                    .next_row()
                                    .map_err(|e| AppError::query_failed(e.to_string()))?
                                {
                                    let mut map = serde_json::Map::new();
                                    for (i, name) in col_names.iter().enumerate() {
                                        map.insert(
                                            name.clone(),
                                            odbc_value_to_json(&mut row, (i + 1) as u16),
                                        );
                                    }
                                    data.push(serde_json::Value::Object(map));
                                }

                                Ok(QueryResult {
                                    row_count: data.len() as i64,
                                    data,
                                    columns,
                                    time_taken_ms: start.elapsed().as_millis() as i64,
                                    success: true,
                                    error: None,
                                    result_sets: None,
                                })
                            }
                            None => Ok(QueryResult {
                                row_count: 0,
                                data: vec![],
                                columns: vec![],
                                time_taken_ms: start.elapsed().as_millis() as i64,
                                success: true,
                                error: None,
                                result_sets: None,
                            }),
                        }
                    } else {
                        let mut prepared = conn
                            .prepare(sql_clean)
                            .map_err(|e| AppError::query_failed(e.to_string()))?;
                        prepared
                            .execute(())
                            .map_err(|e| AppError::query_failed(e.to_string()))?;
                        conn.commit()
                            .map_err(|e| AppError::query_failed(format!("commit failed: {e}")))?;
                        let row_count = prepared
                            .row_count()
                            .map_err(|e| AppError::query_failed(e.to_string()))
                            .ok()
                            .flatten()
                            .unwrap_or(0) as i64;
                        Ok(QueryResult {
                            row_count,
                            data: vec![],
                            columns: vec![],
                            time_taken_ms: start.elapsed().as_millis() as i64,
                            success: true,
                            error: None,
                            result_sets: None,
                        })
                    }
                })
                .await;
        }

        // Multiple statements
        self.run_blocking(move |conn| {
            let mut result_sets = Vec::new();
            let mut last_error: Option<String> = None;

            for (idx, statement) in statements.iter().enumerate() {
                let sql_clean = super::super::strip_trailing_statement_terminator(statement);
                let first_kw = super::super::first_sql_keyword(sql_clean);
                let is_read = matches!(
                    first_kw.as_deref(),
                    Some("SELECT") | Some("WITH") | Some("SHOW")
                );

                let result = if is_read {
                    let cursor = conn
                        .execute(sql_clean, ())
                        .map_err(|e| AppError::query_failed(e.to_string()))?;
                    match cursor {
                        Some(mut c) => {
                            let num_cols = c
                                .num_result_cols()
                                .map_err(|e| AppError::query_failed(e.to_string()))?
                                as u16;
                            let mut col_names = Vec::with_capacity(num_cols as usize);
                            let mut col_types = Vec::with_capacity(num_cols as usize);
                            for i in 1..=num_cols {
                                let name = c
                                    .col_name(i)
                                    .map_err(|e| AppError::query_failed(e.to_string()))?;
                                let data_type = c
                                    .col_data_type(i)
                                    .map_err(|e| AppError::query_failed(e.to_string()))?;
                                col_names.push(name.clone());
                                col_types.push(format!("{:?}", data_type));
                            }
                            let columns: Vec<QueryColumn> = col_names
                                .iter()
                                .zip(col_types.iter())
                                .map(|(name, ty)| QueryColumn {
                                    name: name.clone(),
                                    r#type: ty.clone(),
                                })
                                .collect();

                            let mut data = Vec::new();
                            while let Some(mut row) = c
                                .next_row()
                                .map_err(|e| AppError::query_failed(e.to_string()))?
                            {
                                let mut map = serde_json::Map::new();
                                for (i, name) in col_names.iter().enumerate() {
                                    map.insert(
                                        name.clone(),
                                        odbc_value_to_json(&mut row, (i + 1) as u16),
                                    );
                                }
                                data.push(serde_json::Value::Object(map));
                            }
                            let row_count = data.len() as i64;
                            Ok((columns, data, row_count))
                        }
                        None => Ok((Vec::new(), Vec::new(), 0i64)),
                    }
                } else {
                    let mut prepared = conn
                        .prepare(sql_clean)
                        .map_err(|e| AppError::query_failed(e.to_string()))?;
                    prepared
                        .execute(())
                        .map_err(|e| AppError::query_failed(e.to_string()))?;
                    conn.commit()
                        .map_err(|e| AppError::query_failed(format!("commit failed: {e}")))?;
                    let row_count = prepared
                        .row_count()
                        .map_err(|e| AppError::query_failed(e.to_string()))
                        .ok()
                        .flatten()
                        .unwrap_or(0) as i64;
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
                        last_error = Some(e);
                        break;
                    }
                }
            }

            if let Some(err) = last_error {
                return Ok(QueryResult {
                    data: vec![],
                    row_count: 0,
                    columns: vec![],
                    time_taken_ms: start.elapsed().as_millis() as i64,
                    success: false,
                    error: Some(err),
                    result_sets: Some(result_sets),
                });
            }

            Ok(QueryResult {
                data: vec![],
                row_count: 0,
                columns: vec![],
                time_taken_ms: start.elapsed().as_millis() as i64,
                success: true,
                error: None,
                result_sets: Some(result_sets),
            })
        })
        .await
    }
}
