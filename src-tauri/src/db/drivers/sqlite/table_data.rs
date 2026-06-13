use crate::error::AppError;
use crate::models::TableDataResponse;
use sqlx::{Column, Row};
use std::collections::HashMap;

use super::metadata::{pragma_table_info_sql, sqlite_table_ref};
use super::query::sqlite_cell_to_json;

fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('\"', "\"\""))
}

pub struct SqliteTableData {
    pub pool: sqlx::SqlitePool,
}

impl SqliteTableData {
    async fn load_declared_type_map(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<HashMap<String, String>, AppError> {
        let sql = pragma_table_info_sql(schema, table);
        let rows = sqlx::query(&sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::query_failed(format!("SQL: {} | {}", sql, e)))?;
        let mut map = HashMap::new();
        for row in rows {
            let name = row.try_get::<String, _>("name").unwrap_or_default();
            let ty = row.try_get::<String, _>("type").unwrap_or_default();
            if !name.is_empty() && !ty.trim().is_empty() {
                map.insert(name, ty);
            }
        }
        Ok(map)
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
        let safe_page = if page < 1 { 1 } else { page };
        let safe_limit = if limit < 1 { 100 } else { limit };
        let offset = (safe_page - 1) * safe_limit;
        let table_ref = sqlite_table_ref(&schema, &table);

        let filter = filter.map(|f| super::super::normalize_quotes(&f));
        let order_by = order_by.map(|f| super::super::normalize_quotes(&f));

        let where_clause = match &filter {
            Some(f) if !f.trim().is_empty() => format!(" WHERE {}", f.trim()),
            _ => String::new(),
        };

        let count_query = format!("SELECT COUNT(*) FROM {}{}", table_ref, where_clause);
        let total: i64 = sqlx::query_scalar(&count_query)
            .fetch_one(&self.pool)
            .await
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
            "SELECT * FROM {}{}{} LIMIT ? OFFSET ?",
            table_ref, where_clause, order_clause
        );
        let rows = sqlx::query(&query)
            .bind(safe_limit)
            .bind(offset)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::query_failed(format!("SQL: {} | {}", query, e)))?;
        let declared_type_map = self.load_declared_type_map(&schema, &table).await?;

        let mut data = Vec::new();
        for row in &rows {
            let mut obj = serde_json::Map::new();
            for col in row.columns() {
                let name = col.name();
                let declared_type = declared_type_map.get(name).map(|s| s.as_str());
                let value = sqlite_cell_to_json(row, name, declared_type)?;
                obj.insert(name.to_string(), value);
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
    async fn test_get_table_data_supports_public_schema_alias() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let table_data = SqliteTableData { pool: conn.pool.clone() };

        sqlx::query(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT); \
             INSERT INTO users (name) VALUES ('alice'), ('bob');",
        )
        .execute(&conn.pool)
        .await
        .unwrap();

        let result = table_data
            .get_table_data(
                "public".to_string(),
                "users".to_string(),
                1,
                100,
                Some("id".to_string()),
                Some("asc".to_string()),
                None,
                None,
            )
            .await
            .unwrap();

        assert_eq!(result.total, 2);
        assert_eq!(result.data.len(), 2);
        assert_eq!(
            result.data[0]["name"],
            serde_json::Value::String("alice".to_string())
        );

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_sqlite_raw_dispatch_and_temporal_normalization() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let table_data = SqliteTableData { pool: conn.pool.clone() };

        sqlx::query(
            "CREATE TABLE products (\
                id INTEGER PRIMARY KEY, \
                price NUMERIC, \
                created_date DATE, \
                created_at DATETIME, \
                is_active BOOLEAN\
            );",
        )
        .execute(&conn.pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO products (id, price, created_date, created_at, is_active) \
             VALUES (1, 4236.50, '2026-01-02', '2026-01-02T03:04:05.120Z', 1);",
        )
        .execute(&conn.pool)
        .await
        .unwrap();

        let result = table_data
            .get_table_data(
                "main".to_string(),
                "products".to_string(),
                1,
                100,
                None,
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(result.total, 1);
        let row = result.data.first().unwrap();
        assert!(
            row["price"].is_number(),
            "price should keep numeric semantics"
        );
        assert_eq!(
            row["created_date"],
            serde_json::Value::String("2026-01-02".to_string())
        );
        assert!(
            row["created_at"]
                .as_str()
                .map(|v| v.starts_with("2026-01-02T03:04:05"))
                .unwrap_or(false),
            "created_at should be normalized"
        );
        assert_eq!(row["is_active"], serde_json::Value::Bool(true));

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }
}
