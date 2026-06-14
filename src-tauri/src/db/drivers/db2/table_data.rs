use super::connection::Db2Config;
use super::super::{conn_failed_error, DriverResult};
use crate::error::AppError;
use crate::models::TableDataResponse;
use odbc_api::ConnectionOptions;

pub struct Db2TableData {
    pub config: Db2Config,
}

fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
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

fn collect_cursor_data(
    mut cursor: odbc_api::CursorImpl<odbc_api::handles::StatementImpl<'_>>,
) -> DriverResult<(Vec<String>, Vec<serde_json::Value>)> {
    let num_cols = cursor
        .num_result_cols()
        .map_err(|e| AppError::query_failed(e.to_string()))? as u16;
    let mut col_names = Vec::with_capacity(num_cols as usize);
    for i in 1..=num_cols {
        let name = cursor
            .col_name(i)
            .map_err(|e| AppError::query_failed(e.to_string()))?;
        col_names.push(name);
    }

    let mut rows = Vec::new();
    while let Some(mut row) = cursor
        .next_row()
        .map_err(|e| AppError::query_failed(e.to_string()))?
    {
        let mut map = serde_json::Map::new();
        for (i, name) in col_names.iter().enumerate() {
            map.insert(name.clone(), odbc_value_to_json(&mut row, (i + 1) as u16));
        }
        rows.push(serde_json::Value::Object(map));
    }
    Ok((col_names, rows))
}

impl Db2TableData {
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
        let start = std::time::Instant::now();
        let safe_page = if page < 1 { 1 } else { page };
        let safe_limit = if limit < 1 { 100 } else { limit };
        let offset = (safe_page - 1) * safe_limit;

        let filter = filter.map(|f| super::super::normalize_quotes(&f));
        let order_by = order_by.map(|f| super::super::normalize_quotes(&f));

        let table_ref = format!("{}.{}", quote_ident(&schema), quote_ident(&table));

        let where_clause = match &filter {
            Some(f) if !f.trim().is_empty() => format!(" WHERE {}", f.trim()),
            _ => String::new(),
        };

        let order_clause = if let Some(ref raw) = order_by {
            if raw.trim().is_empty() {
                String::new()
            } else {
                format!(" ORDER BY {}", raw.trim())
            }
        } else if let Some(ref col) = sort_column {
            let dir = if matches!(sort_direction.as_deref(), Some("desc")) {
                "DESC"
            } else {
                "ASC"
            };
            format!(" ORDER BY {} {}", quote_ident(col), dir)
        } else {
            String::new()
        };

        self.run_blocking(move |conn| {
            let count_sql = format!("SELECT COUNT(*) FROM {}{}", table_ref, where_clause);
            let count_cursor = conn
                .execute(&count_sql, ())
                .map_err(|e| AppError::query_failed(e.to_string()))?;
            let mut total: i64 = 0;
            if let Some(c) = count_cursor {
                let (_, count_rows) = collect_cursor_data(c)?;
                if let Some(row) = count_rows.first() {
                    total = row.as_str().and_then(|s| s.parse().ok()).unwrap_or(0);
                }
            }

            let data_sql = format!(
                "SELECT * FROM {}{}{} OFFSET {} ROWS FETCH NEXT {} ROWS ONLY",
                table_ref, where_clause, order_clause, offset, safe_limit
            );
            let data_cursor = conn
                .execute(&data_sql, ())
                .map_err(|e| AppError::query_failed(e.to_string()))?;
            let mut data = Vec::new();
            if let Some(c) = data_cursor {
                let (_, rows) = collect_cursor_data(c)?;
                data = rows;
            }

            Ok(TableDataResponse {
                data,
                total,
                page: safe_page,
                limit: safe_limit,
                execution_time_ms: start.elapsed().as_millis() as i64,
            })
        })
        .await
    }

    pub async fn get_table_data_chunk(
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
        self.get_table_data(
            schema,
            table,
            page,
            limit,
            sort_column,
            sort_direction,
            filter,
            order_by,
        )
        .await
    }
}
