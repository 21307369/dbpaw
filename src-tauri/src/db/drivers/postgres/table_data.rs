use super::metadata::{pg_qualified_table, pg_quote_ident};
use super::query::normalize_postgres_row_json;
use crate::error::AppError;
use crate::models::TableDataResponse;
use sqlx::Row;
use std::collections::HashSet;

fn validation_error(message: impl Into<String>) -> AppError {
    AppError::validation(message)
}

fn query_error(message: impl Into<String>) -> AppError {
    AppError::query_failed(message)
}

pub struct PostgresTableData {
    pub pool: sqlx::PgPool,
}

impl PostgresTableData {
    async fn load_high_precision_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<HashSet<String>, AppError> {
        let rows = sqlx::query(
            "SELECT column_name, data_type, udt_name \
            FROM information_schema.columns \
            WHERE table_schema = $1 AND table_name = $2",
        )
        .bind(schema)
        .bind(table)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| query_error(format!("Failed to load column types: {e}")))?;

        let mut cols = HashSet::new();
        for row in rows {
            let col_name = super::metadata::decode_postgres_text_cell(&row, 0)?;
            let data_type = super::metadata::decode_postgres_text_cell(&row, 1)?;
            let udt_name = super::metadata::decode_postgres_text_cell(&row, 2)?;
            if super::metadata::is_high_precision_pg_type(&data_type, &udt_name) {
                cols.insert(col_name);
            }
        }
        Ok(cols)
    }

    async fn fetch_table_rows_as_json(
        &self,
        schema: &str,
        table: &str,
        where_clause: &str,
        order_clause: &str,
        limit: i64,
        offset: i64,
        high_precision_cols: &HashSet<String>,
    ) -> Result<Vec<serde_json::Value>, AppError> {
        let qt = pg_qualified_table(schema, table);
        let query = format!(
            "SELECT to_jsonb(t) AS __row_json FROM {} t{}{} LIMIT $1 OFFSET $2",
            qt, where_clause, order_clause
        );
        let rows = sqlx::query(&query)
            .bind(limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| query_error(format!("SQL: {} | {}", query, e)))?;

        let mut data = Vec::with_capacity(rows.len());
        for row in rows {
            let mut row_json = row
                .try_get::<sqlx::types::Json<serde_json::Value>, _>("__row_json")
                .map(|v| v.0)
                .map_err(|e| query_error(format!("Failed to decode __row_json: {e}")))?;
            normalize_postgres_row_json(&mut row_json, high_precision_cols)?;
            data.push(row_json);
        }
        Ok(data)
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

        let filter = filter.map(|f| super::super::normalize_quotes(&f));
        let order_by = order_by.map(|f| super::super::normalize_quotes(&f));

        let where_clause = match &filter {
            Some(f) if !f.trim().is_empty() => format!(" WHERE {}", f.trim()),
            _ => String::new(),
        };

        let qt = pg_qualified_table(&schema, &table);
        let count_query = format!("SELECT COUNT(*) FROM {}{}", qt, where_clause);
        let total: i64 = sqlx::query_scalar(&count_query)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| query_error(format!("SQL: {} | {}", count_query, e)))?;

        let order_clause = if let Some(ref ob) = order_by {
            if !ob.trim().is_empty() {
                format!(" ORDER BY {}", ob.trim())
            } else {
                String::new()
            }
        } else if let Some(ref col) = sort_column {
            if !col.chars().all(|c| c.is_alphanumeric() || c == '_') {
                return Err(validation_error("Invalid sort column name"));
            }
            let dir = match sort_direction.as_deref() {
                Some("desc") => "DESC",
                _ => "ASC",
            };
            format!(" ORDER BY {} {}", pg_quote_ident(col), dir)
        } else {
            String::new()
        };

        let high_precision_cols = self.load_high_precision_columns(&schema, &table).await?;
        let data = self
            .fetch_table_rows_as_json(
                &schema,
                &table,
                &where_clause,
                &order_clause,
                limit,
                offset,
                &high_precision_cols,
            )
            .await?;

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
