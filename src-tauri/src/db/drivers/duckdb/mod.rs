pub mod connection;
pub mod helpers;
pub mod metadata;
pub mod query;

use super::{DatabaseDriver, DriverCapabilities, DriverResult};
use crate::models::{
    QueryResult, SchemaOverview, TableDataResponse, TableInfo, TableMetadata, TableStructure,
};
use async_trait::async_trait;

#[derive(Debug)]
pub struct DuckdbDriver {
    connection: connection::DuckdbConnection,
    metadata: metadata::DuckdbMetadata,
    query: query::DuckdbQuery,
}

impl DuckdbDriver {
    pub async fn connect(form: &crate::models::ConnectionForm) -> DriverResult<Self> {
        let conn = connection::DuckdbConnection::connect(form).await?;

        Ok(Self {
            metadata: metadata::DuckdbMetadata {
                connection: conn.clone(),
            },
            query: query::DuckdbQuery {
                connection: conn.clone(),
            },
            connection: conn,
        })
    }
}

#[async_trait]
impl DatabaseDriver for DuckdbDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities::empty()
    }

    async fn close(&self) {}

    async fn test_connection(&self) -> DriverResult<()> {
        self.connection
            .run_blocking(|conn| {
                conn.execute("SELECT 1", [])
                    .map_err(|e| crate::error::AppError::query_failed(format!("{e}")))?;
                Ok(())
            })
            .await
    }

    async fn list_databases(&self) -> DriverResult<Vec<String>> {
        self.metadata.list_databases().await
    }

    async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>> {
        self.metadata.list_tables(schema).await
    }

    async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableStructure> {
        self.metadata.get_table_structure(schema, table).await
    }

    async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableMetadata> {
        self.metadata.get_table_metadata(schema, table).await
    }

    async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String> {
        self.metadata.get_table_ddl(schema, table).await
    }

    async fn get_table_data(
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
        self.query
            .get_table_data(
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

    async fn get_table_data_chunk(
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
        self.query
            .get_table_data(
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

    async fn execute_query(&self, sql: String) -> DriverResult<QueryResult> {
        self.query.execute_query(sql).await
    }

    async fn get_schema_overview(&self, schema: Option<String>) -> DriverResult<SchemaOverview> {
        self.metadata.get_schema_overview(schema).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ConnectionForm;
    use uuid::Uuid;

    fn temp_db_path() -> String {
        let mut p = std::env::temp_dir();
        p.push(format!("dbpaw-duckdb-test-{}.duckdb", Uuid::new_v4()));
        p.to_string_lossy().to_string()
    }

    #[tokio::test]
    async fn test_connect_validation_error() {
        let form = ConnectionForm {
            driver: "duckdb".to_string(),
            file_path: None,
            ..Default::default()
        };
        let result = DuckdbDriver::connect(&form).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("file_path cannot be empty"));
    }

    #[tokio::test]
    async fn test_execute_query_select_and_dml() {
        let path = temp_db_path();
        let form = ConnectionForm {
            driver: "duckdb".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let driver = DuckdbDriver::connect(&form).await.unwrap();
        driver
            .execute_query("CREATE TABLE items (id INTEGER, name VARCHAR);".to_string())
            .await
            .unwrap();

        let insert_result = driver
            .execute_query("INSERT INTO items VALUES (1, 'a'), (2, 'b');".to_string())
            .await
            .unwrap();
        assert!(insert_result.row_count >= 0);

        let select_result = driver
            .execute_query("SELECT id, name FROM items ORDER BY id;".to_string())
            .await
            .unwrap();
        assert_eq!(select_result.row_count, 2);
        assert_eq!(select_result.columns.len(), 2);
        assert_eq!(select_result.columns[0].r#type, "INTEGER");
        assert_eq!(select_result.columns[1].r#type, "TEXT");

        let show_result = driver
            .execute_query("SHOW TABLES;".to_string())
            .await
            .unwrap();
        assert!(!show_result.data.is_empty());
        assert!(!show_result.columns.is_empty());

        let returning_result = driver
            .execute_query("INSERT INTO items VALUES (3, 'c')\nRETURNING id, name;".to_string())
            .await
            .unwrap();
        assert_eq!(returning_result.row_count, 1);
        assert_eq!(returning_result.columns.len(), 2);
        assert_eq!(
            returning_result.data[0]["id"],
            serde_json::Value::String("3".to_string())
        );
        assert_eq!(
            returning_result.data[0]["name"],
            serde_json::Value::String("c".to_string())
        );

        driver.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_number_from_f64_nan_and_inf_are_stringified() {
        assert_eq!(
            helpers::number_from_f64(f64::NAN),
            serde_json::Value::String("NaN".to_string())
        );
        assert_eq!(
            helpers::number_from_f64(f64::INFINITY),
            serde_json::Value::String("inf".to_string())
        );
    }

    #[tokio::test]
    async fn test_list_tables_metadata_and_ddl() {
        let path = temp_db_path();
        let form = ConnectionForm {
            driver: "duckdb".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let driver = DuckdbDriver::connect(&form).await.unwrap();
        driver
            .execute_query(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR, age INTEGER);"
                    .to_string(),
            )
            .await
            .unwrap();

        let tables = driver.list_tables(None).await.unwrap();
        assert!(tables.iter().any(|t| t.name == "users"));

        let structure = driver
            .get_table_structure("main".to_string(), "users".to_string())
            .await
            .unwrap();
        assert!(structure.columns.iter().any(|c| c.name == "name"));

        let ddl = driver
            .get_table_ddl("main".to_string(), "users".to_string())
            .await
            .unwrap();
        assert!(ddl.to_lowercase().contains("create table"));

        driver.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_duckdb_cell_to_json_preserves_decimal_and_temporal_values() {
        let path = temp_db_path();
        let form = ConnectionForm {
            driver: "duckdb".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let driver = DuckdbDriver::connect(&form).await.unwrap();
        driver
            .execute_query(
                "CREATE TABLE products (\
                    product_id INTEGER PRIMARY KEY, \
                    price DECIMAL(10,2), \
                    created_date DATE, \
                    created_at TIMESTAMP\
                );"
                .to_string(),
            )
            .await
            .unwrap();
        driver
            .execute_query(
                "INSERT INTO products (product_id, price, created_date, created_at) VALUES \
                 (1, 4236.50, '2026-01-02', '2026-01-02 03:04:05');"
                    .to_string(),
            )
            .await
            .unwrap();

        let table_data = driver
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
        assert_eq!(table_data.data.len(), 1);
        let row = table_data.data.first().unwrap();
        let price = row["price"].as_str().expect("price should be a string");
        assert!(price.contains('.'));
        assert_eq!(price.parse::<f64>().unwrap(), 4236.5);
        assert_eq!(
            row["created_date"],
            serde_json::Value::String("2026-01-02".to_string())
        );
        assert_ne!(
            row["created_date"],
            serde_json::Value::String("20456".to_string())
        );
        let created_at = row["created_at"]
            .as_str()
            .expect("created_at should be a string");
        assert!(created_at.contains("2026-01-02"));

        let query_result = driver
            .execute_query(
                "SELECT price, created_date, created_at FROM products WHERE product_id = 1;"
                    .to_string(),
            )
            .await
            .unwrap();
        assert_eq!(query_result.row_count, 1);
        let query_row = query_result.data.first().unwrap();
        let query_price = query_row["price"].as_str().unwrap();
        assert!(query_price.contains('.'));
        assert_eq!(query_price.parse::<f64>().unwrap(), 4236.5);
        assert_eq!(
            query_row["created_date"],
            serde_json::Value::String("2026-01-02".to_string())
        );
        let query_created_at = query_row["created_at"]
            .as_str()
            .expect("created_at should be a string");
        assert!(query_created_at.contains("2026-01-02"));

        driver.close().await;
        let _ = std::fs::remove_file(path);
    }
}
