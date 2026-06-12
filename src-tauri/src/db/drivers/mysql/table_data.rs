use crate::error::AppError;
use crate::models::TableDataResponse;
use rust_decimal::Decimal;
use sqlx::{Column, Row};
use std::collections::{HashMap, HashSet};

fn validation_error(message: impl Into<String>) -> AppError {
    AppError::validation(message)
}

fn query_error(message: impl Into<String>) -> AppError {
    AppError::query_failed(message)
}

fn decode_mysql_text_cell(row: &sqlx::mysql::MySqlRow, idx: usize) -> Result<String, AppError> {
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return Ok(v);
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return Ok(String::from_utf8_lossy(&v).to_string());
    }
    Err(query_error(format!(
        "Failed to decode MySQL text column at index {idx}"
    )))
}

fn decode_mysql_optional_text_cell(
    row: &sqlx::mysql::MySqlRow,
    idx: usize,
) -> Result<Option<String>, AppError> {
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return Ok(v);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return Ok(v.map(|b| String::from_utf8_lossy(&b).to_string()));
    }
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return Ok(Some(v));
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return Ok(Some(String::from_utf8_lossy(&v).to_string()));
    }
    Err(query_error(format!(
        "Failed to decode MySQL optional text column at index {idx}"
    )))
}

fn quote_mysql_ident(ident: &str) -> String {
    format!("`{}`", ident.replace('`', "``"))
}

fn quote_mysql_json_key(key: &str) -> String {
    format!("'{}'", key.replace('\'', "''"))
}

fn quote_mysql_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "''"))
}

fn render_mysql_query_with_str_params(sql: &str, params: &[&str]) -> Result<String, AppError> {
    let mut rendered = String::with_capacity(sql.len() + params.len() * 16);
    let mut parts = sql.split('?');
    if let Some(first) = parts.next() {
        rendered.push_str(first);
    }

    let mut used = 0usize;
    for part in parts {
        let Some(param) = params.get(used) else {
            return Err(query_error(format!(
                "Placeholder count does not match parameter count for SQL: {}",
                sql
            )));
        };
        rendered.push_str(&quote_mysql_string_literal(param));
        rendered.push_str(part);
        used += 1;
    }

    if used != params.len() {
        return Err(query_error(format!(
            "Placeholder count does not match parameter count for SQL: {}",
            sql
        )));
    }

    Ok(rendered)
}

fn mysql_qualified_table(schema: &str, table: &str) -> String {
    if schema.is_empty() {
        quote_mysql_ident(table)
    } else {
        format!("{}.{}", quote_mysql_ident(schema), quote_mysql_ident(table))
    }
}

fn is_high_precision_mysql_data_type(data_type: &str) -> bool {
    matches!(
        data_type.trim().to_ascii_lowercase().as_str(),
        "bigint" | "decimal" | "numeric"
    )
}

fn is_high_precision_mysql_query_type(type_name: &str) -> bool {
    let type_name = type_name.trim().to_ascii_uppercase();
    type_name == "BIGINT" || type_name == "BIGINT UNSIGNED" || type_name.starts_with("DECIMAL")
}

fn is_mysql_temporal_type(data_type: &str) -> bool {
    matches!(
        data_type.trim().to_ascii_lowercase().as_str(),
        "timestamp" | "datetime" | "date" | "time"
    )
}

fn build_mysql_json_object_expr(columns: &[(String, String)], table_alias: Option<&str>) -> String {
    if columns.is_empty() {
        return "JSON_OBJECT()".to_string();
    }

    let alias = table_alias.map(quote_mysql_ident);
    let mut args = Vec::with_capacity(columns.len() * 2);
    for (name, data_type) in columns {
        args.push(quote_mysql_json_key(name));
        let base_ref = if let Some(alias) = &alias {
            format!("{}.{}", alias, quote_mysql_ident(name))
        } else {
            quote_mysql_ident(name)
        };
        if is_high_precision_mysql_data_type(data_type) {
            args.push(format!("CAST({base_ref} AS CHAR)"));
        } else if is_mysql_temporal_type(data_type) {
            args.push(format!(
                "TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM DATE_FORMAT({base_ref}, '%Y-%m-%d %H:%i:%s.%f')))"
            ));
        } else {
            args.push(base_ref);
        }
    }
    format!("JSON_OBJECT({})", args.join(", "))
}

fn sanitize_mysql_subquery_sql(sql: &str) -> &str {
    super::super::strip_trailing_statement_terminator(sql)
}

fn build_mysql_json_projection_query(base_query: &str, json_expr: &str) -> String {
    let sanitized_base_query = sanitize_mysql_subquery_sql(base_query);
    format!(
        "SELECT {} AS __row_json FROM ({}) AS {}",
        json_expr,
        sanitized_base_query,
        quote_mysql_ident("__dbpaw_row")
    )
}

fn is_prepared_protocol_unsupported_error(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    lower.contains("1295")
        || lower.contains("prepared statement protocol")
        || lower.contains("preparedoes not support")
        || lower.contains("only support prepare selectstmt or insertstmt now")
        || lower.contains("prepareok expected 12 bytes but got 10 bytes")
}

fn is_missing_mysql_json_object_function(err: &str) -> bool {
    let lower = err.to_ascii_lowercase();
    (lower.contains("1305")
        || lower.contains("does not exist")
        || lower.contains("unknown function"))
        && (lower.contains("json_object") || lower.contains("json object"))
}

fn is_high_precision_mysql_column(
    column_name: &str,
    high_precision_cols: &HashSet<String>,
) -> bool {
    high_precision_cols
        .iter()
        .any(|col| col.eq_ignore_ascii_case(column_name))
}

fn decimal_to_json_number_or_string(value: Decimal) -> serde_json::Value {
    let normalized = value.normalize().to_string();
    serde_json::Number::from_f64(normalized.parse::<f64>().unwrap_or(f64::NAN))
        .map(serde_json::Value::Number)
        .unwrap_or_else(|| serde_json::Value::String(normalized))
}

fn decode_mysql_cell_to_json(
    row: &sqlx::mysql::MySqlRow,
    column_name: &str,
    high_precision_cols: &HashSet<String>,
) -> serde_json::Value {
    if let Ok(v) = row.try_get::<Option<sqlx::types::Json<serde_json::Value>>, _>(column_name) {
        return v.map(|json| json.0).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<bool>, _>(column_name) {
        return v
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(column_name) {
        return match v {
            Some(value) if is_high_precision_mysql_column(column_name, high_precision_cols) => {
                serde_json::Value::String(value.to_string())
            }
            Some(value) => serde_json::Value::Number(value.into()),
            None => serde_json::Value::Null,
        };
    }
    if let Ok(v) = row.try_get::<Option<u64>, _>(column_name) {
        return match v {
            Some(value) if is_high_precision_mysql_column(column_name, high_precision_cols) => {
                serde_json::Value::String(value.to_string())
            }
            Some(value) => serde_json::Value::Number(serde_json::Number::from(value)),
            None => serde_json::Value::Null,
        };
    }
    if let Ok(v) = row.try_get::<Option<Decimal>, _>(column_name) {
        return match v {
            Some(value) if is_high_precision_mysql_column(column_name, high_precision_cols) => {
                serde_json::Value::String(value.normalize().to_string())
            }
            Some(value) => decimal_to_json_number_or_string(value),
            None => serde_json::Value::Null,
        };
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(column_name) {
        return match v {
            Some(value) => serde_json::Number::from_f64(value)
                .map(serde_json::Value::Number)
                .unwrap_or(serde_json::Value::Null),
            None => serde_json::Value::Null,
        };
    }
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDateTime>, _>(column_name) {
        return v
            .map(|value| serde_json::Value::String(super::super::format_naive_datetime(&value)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<chrono::NaiveDate>, _>(column_name) {
        return v
            .map(|value| serde_json::Value::String(super::super::format_naive_date(&value)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<chrono::NaiveTime>, _>(column_name) {
        return v
            .map(|value| serde_json::Value::String(super::super::format_naive_time(&value)))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(column_name) {
        return v
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(column_name) {
        return v
            .map(|bytes| serde_json::Value::String(String::from_utf8_lossy(&bytes).to_string()))
            .unwrap_or(serde_json::Value::Null);
    }

    serde_json::Value::Null
}

fn decode_mysql_rows_without_projection(
    rows: &[sqlx::mysql::MySqlRow],
    high_precision_cols: &HashSet<String>,
) -> Vec<serde_json::Value> {
    let mut data = Vec::with_capacity(rows.len());
    for row in rows {
        let mut obj = serde_json::Map::new();
        for col in row.columns() {
            let name = col.name();
            obj.insert(
                name.to_string(),
                decode_mysql_cell_to_json(row, name, high_precision_cols),
            );
        }
        data.push(serde_json::Value::Object(obj));
    }
    data
}

fn normalize_mysql_row_json(
    row_json: &mut serde_json::Value,
    high_precision_cols: &HashSet<String>,
) -> Result<(), AppError> {
    let obj = row_json
        .as_object_mut()
        .ok_or_else(|| query_error("Expected JSON object row from JSON_OBJECT"))?;

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

fn decode_mysql_json_cell(
    row: &sqlx::mysql::MySqlRow,
    column_name: &str,
) -> Result<serde_json::Value, AppError> {
    if let Ok(v) = row.try_get::<sqlx::types::Json<serde_json::Value>, _>(column_name) {
        return Ok(v.0);
    }
    if let Ok(v) = row.try_get::<String, _>(column_name) {
        return serde_json::from_str(&v)
            .map_err(|e| query_error(format!("Failed to parse JSON cell: {e}")));
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(column_name) {
        return serde_json::from_slice(&v)
            .map_err(|e| query_error(format!("Failed to parse JSON bytes cell: {e}")));
    }
    Err(query_error("Failed to decode MySQL JSON cell"))
}

pub struct MysqlTableData {
    pub pool: sqlx::MySqlPool,
    pub driver_name: String,
    pub compatibility_mode: bool,
}

impl MysqlTableData {
    fn is_compatibility_mode(&self) -> bool {
        self.compatibility_mode
    }

    async fn fetch_all_sql(&self, sql: &str) -> Result<Vec<sqlx::mysql::MySqlRow>, AppError> {
        if self.is_compatibility_mode() {
            sqlx::raw_sql(sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        } else {
            sqlx::query(sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        }
    }

    async fn fetch_all_with_str_params(
        &self,
        sql: &str,
        params: &[&str],
    ) -> Result<Vec<sqlx::mysql::MySqlRow>, AppError> {
        if self.is_compatibility_mode() {
            let rendered = render_mysql_query_with_str_params(sql, params)?;
            self.fetch_all_sql(&rendered).await
        } else {
            let mut query = sqlx::query(sql);
            for param in params {
                query = query.bind(*param);
            }
            query
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        }
    }

    async fn fetch_i64_scalar_sql(&self, sql: &str) -> Result<i64, AppError> {
        if self.is_compatibility_mode() {
            let row = self
                .fetch_all_sql(sql)
                .await?
                .into_iter()
                .next()
                .ok_or_else(|| query_error("No rows returned"))?;
            row.try_get::<i64, _>(0)
                .or_else(|_| row.try_get::<u64, _>(0).map(|v| v as i64))
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        } else {
            sqlx::query_scalar(sql)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        }
    }

    async fn current_database(&self) -> Result<Option<String>, AppError> {
        let row = self
            .fetch_all_sql("SELECT DATABASE()")
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| query_error("No rows returned"))?;
        decode_mysql_optional_text_cell(&row, 0)
    }

    async fn resolve_schema_name(&self, schema: &str) -> Result<String, AppError> {
        if !schema.trim().is_empty() {
            return Ok(schema.to_string());
        }
        self.current_database()
            .await
            .map_err(|e| query_error(format!("Failed to resolve current database: {e}")))?
            .ok_or_else(|| query_error("No active MySQL database selected"))
    }

    async fn load_table_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<(String, String)>, AppError> {
        let rows = self
            .fetch_all_with_str_params(
                "SELECT column_name, data_type \
                 FROM information_schema.columns \
                 WHERE table_schema = ? AND table_name = ? \
                 ORDER BY ordinal_position",
                &[schema, table],
            )
            .await
            .map_err(|e| query_error(format!("Failed to load MySQL column metadata: {e}")))?;

        let mut columns = Vec::with_capacity(rows.len());
        for row in rows {
            let name = decode_mysql_text_cell(&row, 0)?;
            let data_type = decode_mysql_text_cell(&row, 1)?;
            columns.push((name, data_type));
        }
        Ok(columns)
    }

    async fn fetch_rows_as_json(
        &self,
        base_query: &str,
        binds: &[i64],
        json_expr: &str,
        high_precision_cols: &HashSet<String>,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let query = build_mysql_json_projection_query(base_query, json_expr);

        let mut q = sqlx::query(&query);
        for bind in binds {
            q = q.bind(*bind);
        }
        let rows = match q.fetch_all(&self.pool).await {
            Ok(rows) => rows,
            Err(e) => {
                let error_text = e.to_string();
                if is_missing_mysql_json_object_function(&error_text) {
                    return self
                        .fetch_rows_as_json_without_projection(
                            base_query,
                            binds,
                            high_precision_cols,
                        )
                        .await;
                }
                return Err(query_error(format!("SQL: {} | {}", query, e)));
            }
        };

        let mut data = Vec::with_capacity(rows.len());
        for row in rows {
            let mut row_json = decode_mysql_json_cell(&row, "__row_json")?;
            normalize_mysql_row_json(&mut row_json, high_precision_cols)?;
            data.push(row_json);
        }
        Ok(data)
    }

    async fn fetch_rows_as_json_without_projection(
        &self,
        base_query: &str,
        binds: &[i64],
        high_precision_cols: &HashSet<String>,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let mut q = sqlx::query(base_query);
        for bind in binds {
            q = q.bind(*bind);
        }

        let rows = q
            .fetch_all(&self.pool)
            .await
            .map_err(|e| query_error(format!("SQL: {} | {}", base_query, e)))?;

        Ok(decode_mysql_rows_without_projection(
            &rows,
            high_precision_cols,
        ))
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
    ) -> Result<TableDataResponse, AppError> {
        let start = std::time::Instant::now();
        let offset = (page - 1) * limit;
        let qualified = mysql_qualified_table(&schema, &table);

        let filter = filter.map(|f| super::super::normalize_quotes(&f));
        let order_by = order_by.map(|f| super::super::normalize_quotes(&f));

        let where_clause = match &filter {
            Some(f) if !f.trim().is_empty() => format!(" WHERE {}", f.trim()),
            _ => String::new(),
        };

        let count_query = format!("SELECT COUNT(*) FROM {}{}", qualified, where_clause);
        let total = self.fetch_i64_scalar_sql(&count_query).await?;

        let order_clause = if let Some(ref ob) = order_by {
            if !ob.trim().is_empty() {
                format!(" ORDER BY {}", ob.trim())
            } else {
                String::new()
            }
        } else if let Some(ref col) = sort_column {
            // Validate column name to prevent SQL injection
            if !col.chars().all(|c| c.is_alphanumeric() || c == '_') {
                return Err(validation_error("Invalid sort column name"));
            }
            let dir = match sort_direction.as_deref() {
                Some("desc") => "DESC",
                _ => "ASC",
            };
            format!(" ORDER BY {} {}", quote_mysql_ident(col), dir)
        } else {
            String::new()
        };

        let target_schema = self.resolve_schema_name(&schema).await?;
        let table_columns = self.load_table_columns(&target_schema, &table).await?;
        let high_precision_cols: HashSet<String> = table_columns
            .iter()
            .filter(|(_, data_type)| is_high_precision_mysql_data_type(data_type))
            .map(|(name, _)| name.clone())
            .collect();
        let json_expr = build_mysql_json_object_expr(&table_columns, Some("__dbpaw_row"));
        let data = if self.is_compatibility_mode() {
            let query = format!(
                "SELECT * FROM {}{}{} LIMIT {} OFFSET {}",
                qualified, where_clause, order_clause, limit, offset
            );
            let rows = self.fetch_all_sql(&query).await?;
            decode_mysql_rows_without_projection(&rows, &high_precision_cols)
        } else {
            let base_query = format!(
                "SELECT * FROM {}{}{} LIMIT ? OFFSET ?",
                qualified, where_clause, order_clause
            );
            self.fetch_rows_as_json(
                &base_query,
                &[limit, offset],
                &json_expr,
                &high_precision_cols,
            )
            .await?
        };

        let duration = start.elapsed();
        Ok(TableDataResponse {
            data,
            total,
            page,
            limit,
            execution_time_ms: duration.as_millis() as i64,
        })
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
    ) -> Result<TableDataResponse, AppError> {
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
