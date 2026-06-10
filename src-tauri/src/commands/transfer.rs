mod export_service;
mod import_plan;
mod import_service;
mod sql_writer;
mod writer;

use self::export_service::{
    do_database_export, do_query_export, do_table_export, DEFAULT_CHUNK_SIZE,
};
#[cfg(test)]
use self::import_plan::*;
use self::import_service::{execute_sql_import, prepare_sql_import};
#[cfg(test)]
use self::sql_writer::{quote_ident, quote_target, sql_value};
#[cfg(test)]
use self::writer::{csv_escape, validate_output_path, ExportWriter};
use self::writer::{extension_for_format, resolve_output_path};
#[cfg(test)]
use crate::db::drivers::{DatabaseDriver, DriverResult};
use crate::error::AppError;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
#[cfg(test)]
use serde_json::Value;
#[cfg(test)]
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Csv,
    Json,
    SqlDml,
    SqlDdl,
    SqlFull,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportScope {
    CurrentPage,
    Filtered,
    FullTable,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub file_path: String,
    pub row_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSqlResult {
    pub file_path: String,
    pub total_statements: i64,
    pub success_statements: i64,
    pub failed_at: Option<i64>,
    pub failed_batch: Option<i64>,
    pub failed_statement_preview: Option<String>,
    pub error: Option<String>,
    pub time_taken_ms: i64,
    pub rolled_back: bool,
}

#[tauri::command]
pub async fn export_table_data(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
    driver: String,
    format: ExportFormat,
    scope: ExportScope,
    filter: Option<String>,
    order_by: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
    file_path: Option<String>,
    chunk_size: Option<i64>,
) -> Result<ExportResult, String> {
    let output_path = resolve_output_path(file_path, &table, extension_for_format(&format))?;
    let chunk = chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE).max(1);
    super::execute_with_retry(&state, id, database, |db_driver| {
        let output_path = output_path.clone();
        let schema = schema.clone();
        let table = table.clone();
        let driver = driver.clone();
        let filter = filter.clone();
        let order_by = order_by.clone();
        let sort_column = sort_column.clone();
        let sort_direction = sort_direction.clone();
        let scope = scope.clone();
        let format = format.clone();
        async move {
            do_table_export(
                db_driver,
                output_path,
                schema,
                table,
                driver,
                format,
                scope,
                filter,
                order_by,
                sort_column,
                sort_direction,
                page,
                limit,
                chunk,
            )
            .await
        }
    })
    .await
    .map_err(String::from)
}

pub async fn export_table_data_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    schema: String,
    table: String,
    driver: String,
    format: ExportFormat,
    scope: ExportScope,
    filter: Option<String>,
    order_by: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
    file_path: Option<String>,
    chunk_size: Option<i64>,
) -> Result<ExportResult, String> {
    let output_path = resolve_output_path(file_path, &table, extension_for_format(&format))?;
    let chunk = chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE).max(1);
    super::execute_with_retry_from_app_state(state, id, database, |db_driver| {
        let output_path = output_path.clone();
        let schema = schema.clone();
        let table = table.clone();
        let driver = driver.clone();
        let filter = filter.clone();
        let order_by = order_by.clone();
        let sort_column = sort_column.clone();
        let sort_direction = sort_direction.clone();
        let scope = scope.clone();
        let format = format.clone();
        async move {
            do_table_export(
                db_driver,
                output_path,
                schema,
                table,
                driver,
                format,
                scope,
                filter,
                order_by,
                sort_column,
                sort_direction,
                page,
                limit,
                chunk,
            )
            .await
        }
    })
    .await
    .map_err(String::from)
}

#[tauri::command]
pub async fn export_database_sql(
    state: State<'_, AppState>,
    id: i64,
    database: String,
    driver: String,
    format: ExportFormat,
    file_path: Option<String>,
    chunk_size: Option<i64>,
) -> Result<ExportResult, String> {
    let output_path = resolve_output_path(file_path, &database, "sql")?;
    let chunk = chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE).max(1);
    super::execute_with_retry(&state, id, Some(database), |db_driver| {
        let output_path = output_path.clone();
        let driver = driver.clone();
        let format = format.clone();
        async move { do_database_export(db_driver, output_path, driver, format, chunk).await }
    })
    .await
    .map_err(String::from)
}

pub async fn export_database_sql_direct(
    state: &AppState,
    id: i64,
    database: String,
    driver: String,
    format: ExportFormat,
    file_path: Option<String>,
    chunk_size: Option<i64>,
) -> Result<ExportResult, String> {
    let output_path = resolve_output_path(file_path, &database, "sql")?;
    let chunk = chunk_size.unwrap_or(DEFAULT_CHUNK_SIZE).max(1);
    super::execute_with_retry_from_app_state(state, id, Some(database), |db_driver| {
        let output_path = output_path.clone();
        let driver = driver.clone();
        let format = format.clone();
        async move { do_database_export(db_driver, output_path, driver, format, chunk).await }
    })
    .await
    .map_err(String::from)
}

#[tauri::command]
pub async fn export_query_result(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    sql: String,
    driver: String,
    format: ExportFormat,
    file_path: Option<String>,
) -> Result<ExportResult, String> {
    if matches!(format, ExportFormat::SqlDdl) {
        return Err(AppError::unsupported("SqlDdl format is not supported for query exports").to_string().into());
    }
    let output_path =
        resolve_output_path(file_path, "query_result", extension_for_format(&format))?;

    super::execute_with_retry(&state, id, database, |db_driver| {
        let output_path = output_path.clone();
        let driver = driver.clone();
        let sql = sql.clone();
        let format = format.clone();
        async move { do_query_export(db_driver, output_path, sql, driver, format).await }
    })
    .await
    .map_err(String::from)
}

pub async fn export_query_result_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    sql: String,
    driver: String,
    format: ExportFormat,
    file_path: Option<String>,
) -> Result<ExportResult, String> {
    if matches!(format, ExportFormat::SqlDdl) {
        return Err(AppError::unsupported("SqlDdl format is not supported for query exports").to_string().into());
    }
    let output_path =
        resolve_output_path(file_path, "query_result", extension_for_format(&format))?;

    super::execute_with_retry_from_app_state(state, id, database, |db_driver| {
        let output_path = output_path.clone();
        let driver = driver.clone();
        let sql = sql.clone();
        let format = format.clone();
        async move { do_query_export(db_driver, output_path, sql, driver, format).await }
    })
    .await
    .map_err(String::from)
}

#[tauri::command]
pub async fn import_sql_file(
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    file_path: String,
    driver: String,
) -> Result<ImportSqlResult, String> {
    let prepared = prepare_sql_import(file_path, &driver)?;
    let started_at = std::time::Instant::now();
    super::execute_with_retry(&state, id, database, |db_driver| {
        let prepared = prepared.clone();
        async move { execute_sql_import(db_driver, prepared, started_at).await }
    })
    .await
    .map_err(String::from)
}

pub async fn import_sql_file_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    file_path: String,
    driver: String,
) -> Result<ImportSqlResult, String> {
    let prepared = prepare_sql_import(file_path, &driver)?;
    let started_at = std::time::Instant::now();
    super::execute_with_retry_from_app_state(state, id, database, |db_driver| {
        let prepared = prepared.clone();
        async move { execute_sql_import(db_driver, prepared, started_at).await }
    })
    .await
    .map_err(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        QueryResult, SchemaOverview, TableDataResponse, TableInfo, TableMetadata, TableStructure,
    };
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn transfer_module_boundaries_are_explicit() {
        let _ = super::export_service::DEFAULT_CHUNK_SIZE;
        let _ = super::import_plan::MAX_IMPORT_STATEMENTS;
        let _ = super::writer::extension_for_format(&ExportFormat::Csv);
        let _ = super::sql_writer::quote_ident("id", "postgres");
    }

    struct FakeExportDriver {
        tables: Vec<TableInfo>,
        ddls: HashMap<(String, String), String>,
        rows: HashMap<(String, String), Vec<Value>>,
    }

    #[async_trait]
    impl DatabaseDriver for FakeExportDriver {
        async fn test_connection(&self) -> DriverResult<()> {
            Ok(())
        }

        async fn list_databases(&self) -> DriverResult<Vec<String>> {
            Ok(vec!["db".to_string()])
        }

        async fn list_tables(&self, _schema: Option<String>) -> DriverResult<Vec<TableInfo>> {
            Ok(self.tables.clone())
        }

        async fn get_table_structure(
            &self,
            _schema: String,
            _table: String,
        ) -> DriverResult<TableStructure> {
            Err("not used".to_string().into())
        }

        async fn get_table_metadata(
            &self,
            schema: String,
            table: String,
        ) -> DriverResult<TableMetadata> {
            let key = (schema, table);
            let has_rows = self.rows.contains_key(&key);
            let columns = if has_rows {
                vec![crate::models::ColumnInfo {
                    name: "id".to_string(),
                    r#type: "INT".to_string(),
                    nullable: false,
                    default_value: None,
                    primary_key: true,
                    comment: None,
                    default_constraint_name: None,
                }]
            } else {
                Vec::new()
            };
            Ok(TableMetadata {
                columns,
                indexes: Vec::new(),
                foreign_keys: Vec::new(),
                clickhouse_extra: None,
                cassandra_extra: None,
                special_type_summaries: Vec::new(),
            })
        }

        async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String> {
            self.ddls
                .get(&(schema, table))
                .cloned()
                .ok_or_else(|| crate::error::AppError::not_found("missing ddl"))
        }

        async fn get_table_data(
            &self,
            _schema: String,
            _table: String,
            _page: i64,
            _limit: i64,
            _sort_column: Option<String>,
            _sort_direction: Option<String>,
            _filter: Option<String>,
            _order_by: Option<String>,
        ) -> DriverResult<TableDataResponse> {
            Err("not used".to_string().into())
        }

        async fn get_table_data_chunk(
            &self,
            schema: String,
            table: String,
            page: i64,
            limit: i64,
            _sort_column: Option<String>,
            _sort_direction: Option<String>,
            _filter: Option<String>,
            _order_by: Option<String>,
        ) -> DriverResult<TableDataResponse> {
            let key = (schema, table);
            let all_rows = self.rows.get(&key).cloned().unwrap_or_default();
            let offset = ((page.max(1) - 1) * limit.max(1)) as usize;
            let chunk = all_rows
                .into_iter()
                .skip(offset)
                .take(limit.max(1) as usize)
                .collect::<Vec<_>>();
            Ok(TableDataResponse {
                total: self
                    .rows
                    .get(&key)
                    .map(|rows| rows.len() as i64)
                    .unwrap_or(0),
                data: chunk,
                page,
                limit,
                execution_time_ms: 0,
            })
        }

        async fn execute_query(&self, _sql: String) -> DriverResult<QueryResult> {
            Err("not used".to_string().into())
        }

        async fn get_schema_overview(
            &self,
            _schema: Option<String>,
        ) -> DriverResult<SchemaOverview> {
            Err("not used".to_string().into())
        }

        async fn close(&self) {}
    }

    #[test]
    fn csv_escape_works() {
        assert_eq!(csv_escape("simple"), "simple");
        assert_eq!(csv_escape("a,b"), "\"a,b\"");
        assert_eq!(csv_escape("a\"b"), "\"a\"\"b\"");
        assert_eq!(csv_escape("a\nb"), "\"a\nb\"");
        assert_eq!(csv_escape("a,\nb"), "\"a,\nb\"");
    }

    #[test]
    fn sql_value_works() {
        assert_eq!(sql_value(&Value::Null), "NULL");
        assert_eq!(sql_value(&Value::Bool(true)), "TRUE");
        assert_eq!(
            sql_value(&Value::String("O'Reilly".to_string())),
            "'O''Reilly'"
        );
        assert_eq!(
            sql_value(&Value::Number(serde_json::Number::from(42))),
            "42"
        );
        assert_eq!(sql_value(&Value::Bool(false)), "FALSE");
    }

    #[test]
    fn quote_target_uses_schema_when_present() {
        assert_eq!(
            quote_target(Some("public"), "users", "postgres"),
            "\"public\".\"users\""
        );
        assert_eq!(
            quote_target(Some("analytics"), "events", "mysql"),
            "`analytics`.`events`"
        );
        assert_eq!(
            quote_target(Some("analytics"), "events", "tidb"),
            "`analytics`.`events`"
        );
        assert_eq!(
            quote_target(Some("analytics"), "events", "mariadb"),
            "`analytics`.`events`"
        );
        assert_eq!(
            quote_target(Some("analytics"), "events", "clickhouse"),
            "`analytics`.`events`"
        );
        assert_eq!(
            quote_target(Some("dbo"), "events", "mssql"),
            "[dbo].[events]"
        );
    }

    #[test]
    fn quote_target_ignores_empty_schema() {
        assert_eq!(quote_target(Some("  "), "users", "postgres"), "\"users\"");
        assert_eq!(quote_target(None, "users", "mysql"), "`users`");
        assert_eq!(quote_target(None, "users", "tidb"), "`users`");
        assert_eq!(quote_target(None, "users", "mariadb"), "`users`");
    }

    #[test]
    fn quote_target_uses_unqualified_main_for_duckdb() {
        assert_eq!(quote_target(Some("main"), "users", "duckdb"), "\"users\"");
        assert_eq!(
            quote_target(Some("analytics"), "events", "duckdb"),
            "\"analytics\".\"events\""
        );
    }

    #[test]
    fn quote_ident_escapes_driver_specific_chars() {
        assert_eq!(quote_ident("a`b", "mysql"), "`a``b`");
        assert_eq!(quote_ident("a`b", "clickhouse"), "`a``b`");
        assert_eq!(quote_ident("a]b", "mssql"), "[a]]b]");
        assert_eq!(quote_ident("a\"b", "postgres"), "\"a\"\"b\"");
    }

    #[test]
    fn validate_output_path_rejects_empty_path() {
        assert_eq!(
            validate_output_path(&PathBuf::new()).unwrap_err().to_string(),
            "[ERR-3001] Invalid output path"
        );
    }

    #[test]
    fn validate_output_path_rejects_directory_path() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("dbpaw-transfer-test-dir-{unique}"));
        fs::create_dir_all(&dir).unwrap();
        let err = validate_output_path(&dir).unwrap_err().to_string();
        assert_eq!(err, "[ERR-3001] Output path points to a directory");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn validate_output_path_rejects_path_without_filename() {
        let err = validate_output_path(&PathBuf::from("/")).unwrap_err().to_string();
        assert_eq!(err, "[ERR-3001] Output path must include a file name");
    }

    #[test]
    fn write_rows_rejects_non_object_rows() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("dbpaw-transfer-test-{unique}.json"));
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::Json).unwrap();
        let err = writer
            .write_rows(
                &[Value::String("not-object".to_string())],
                &["a".to_string()],
                None,
                "t",
                "postgres",
            )
            .unwrap_err();
        assert_eq!(err, "[ERR-3001] row is not a JSON object");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn parse_sql_statements_handles_quotes_and_comments() {
        let sql = r#"
            -- comment 1
            INSERT INTO users (name, note) VALUES ('alice', 'hello;world');
            /* block comment ; ; */
            INSERT INTO users (name) VALUES ("bob");
            # mysql style comment
            INSERT INTO users(name) VALUES ($tag$semi;inside$tag$);
        "#;

        let statements = parse_sql_statements(sql, "mysql").unwrap();
        assert_eq!(statements.len(), 3);
        assert!(statements[0].starts_with("INSERT INTO users"));
        assert!(statements[1].contains("\"bob\""));
        assert!(statements[2].contains("$tag$semi;inside$tag$"));
    }

    #[test]
    fn parse_sql_statements_rejects_unterminated_block_comment() {
        let err = parse_sql_statements("INSERT INTO t VALUES (1); /*", "mysql").unwrap_err();
        assert!(err.contains("Unterminated block comment"));
    }

    #[test]
    fn parse_sql_statements_preserves_hash_for_postgres() {
        let sql = "SELECT 1 # 2;\nSELECT '#not_comment';";
        let statements = parse_sql_statements(sql, "postgres").unwrap();
        assert_eq!(statements.len(), 2);
        assert_eq!(statements[0], "SELECT 1 # 2");
        assert_eq!(statements[1], "SELECT '#not_comment'");
    }

    #[test]
    fn parse_sql_statements_supports_mysql_delimiter_blocks() {
        let sql = r#"
            DELIMITER $$
            CREATE PROCEDURE p_demo()
            BEGIN
                SELECT 1;
                SELECT 'semi;inside';
            END$$
            DELIMITER ;
            SELECT 2;
        "#;

        let statements = parse_sql_statements(sql, "mysql").unwrap();
        assert_eq!(statements.len(), 2);
        assert!(statements[0].starts_with("CREATE PROCEDURE p_demo()"));
        assert!(statements[0].contains("SELECT 1;"));
        assert!(statements[0].contains("SELECT 'semi;inside';"));
        assert_eq!(statements[1], "SELECT 2");
    }

    #[test]
    fn parse_sql_statements_ignores_mysql_delimiter_inside_strings() {
        let sql = r#"
            DELIMITER //
            CREATE TRIGGER trg_demo BEFORE INSERT ON demo
            FOR EACH ROW
            BEGIN
                SET @note = 'DELIMITER // should stay';
            END//
            DELIMITER ;
        "#;

        let statements = parse_sql_statements(sql, "mysql").unwrap();
        assert_eq!(statements.len(), 1);
        assert!(statements[0].contains("DELIMITER // should stay"));
        assert!(statements[0].contains("END"));
    }

    #[test]
    fn parse_sql_statements_supports_sqlite_trigger_blocks() {
        let sql = r#"
            CREATE TRIGGER trg_demo
            AFTER INSERT ON demo
            BEGIN
                INSERT INTO audit_log(message) VALUES ('first;value');
                UPDATE demo SET touched_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid;
            END;
            SELECT 1;
        "#;

        let statements = parse_sql_statements(sql, "sqlite").unwrap();
        assert_eq!(statements.len(), 2);
        assert!(statements[0].starts_with("CREATE TRIGGER trg_demo"));
        assert!(statements[0].contains("VALUES ('first;value');"));
        assert!(statements[0].contains("UPDATE demo SET touched_at = CURRENT_TIMESTAMP"));
        assert_eq!(statements[1], "SELECT 1");
    }

    #[test]
    fn parse_sql_statements_keeps_sqlite_case_end_inside_trigger_body() {
        let sql = r#"
            CREATE TRIGGER trg_case
            AFTER UPDATE ON demo
            BEGIN
                UPDATE demo
                SET status = CASE WHEN NEW.id > 10 THEN 'big' ELSE 'small' END;
            END;
        "#;

        let statements = parse_sql_statements(sql, "sqlite").unwrap();
        assert_eq!(statements.len(), 1);
        assert!(statements[0].contains("CASE WHEN NEW.id > 10 THEN 'big' ELSE 'small' END;"));
        assert!(statements[0].ends_with("END"));
    }

    #[test]
    fn parse_sql_statements_supports_oracle_create_or_replace_blocks() {
        let sql = r#"
            CREATE OR REPLACE PROCEDURE p_demo IS
            BEGIN
                INSERT INTO audit_log(message) VALUES ('first;value');
                UPDATE audit_log SET message = 'done' WHERE message = 'first;value';
            END;
            /
            SELECT 1 FROM DUAL;
        "#;

        let statements = parse_sql_statements(sql, "oracle").unwrap();
        assert_eq!(statements.len(), 2);
        assert!(statements[0].starts_with("CREATE OR REPLACE PROCEDURE p_demo IS"));
        assert!(statements[0].contains("VALUES ('first;value');"));
        assert!(statements[0].contains("END;"));
        assert_eq!(statements[1], "SELECT 1 FROM DUAL");
    }

    #[test]
    fn parse_sql_statements_supports_oracle_case_end_inside_block() {
        let sql = r#"
            CREATE OR REPLACE FUNCTION f_demo RETURN VARCHAR2 IS
                v_result VARCHAR2(10);
            BEGIN
                v_result := CASE WHEN 1 = 1 THEN 'yes' ELSE 'no' END;
                RETURN v_result;
            END;
            /
        "#;

        let statements = parse_sql_statements(sql, "oracle").unwrap();
        assert_eq!(statements.len(), 1);
        assert!(statements[0].contains("CASE WHEN 1 = 1 THEN 'yes' ELSE 'no' END;"));
        assert!(statements[0].ends_with("END;"));
    }

    #[test]
    fn parse_mssql_batches_splits_on_go_lines_only() {
        let sql = r#"
            SELECT 1;
            GO
            SELECT 'GO should stay in string';
            -- GO in comment should not split
            SELECT 2;
            GO
            /* GO in block comment
               GO
            */
            SELECT 3;
        "#;

        let batches = parse_mssql_batches(sql).unwrap();
        assert_eq!(batches.len(), 3);
        assert!(batches[0].contains("SELECT 1"));
        assert!(batches[1].contains("SELECT 'GO should stay in string'"));
        assert!(batches[2].contains("SELECT 3"));
    }

    #[test]
    fn parse_mssql_batches_supports_go_repeat_count() {
        let sql = "SELECT 1\nGO 3\nSELECT 2\nGO";
        let batches = parse_mssql_batches(sql).unwrap();
        assert_eq!(batches.len(), 4);
        assert_eq!(batches[0], "SELECT 1");
        assert_eq!(batches[1], "SELECT 1");
        assert_eq!(batches[2], "SELECT 1");
        assert_eq!(batches[3], "SELECT 2");
    }

    #[test]
    fn statement_controls_transaction_detects_driver_specific_tokens() {
        assert!(statement_controls_transaction("BEGIN TRANSACTION", "mssql"));
        assert!(!statement_controls_transaction("BEGIN TRY", "mssql"));
        assert!(statement_controls_transaction("BEGIN", "sqlite"));
        assert!(statement_controls_transaction("START TRANSACTION", "mysql"));
        assert!(statement_controls_transaction("ROLLBACK", "postgres"));
    }

    #[test]
    fn prepare_import_plan_disables_outer_tx_when_script_controls_it() {
        let sqlite_plan =
            prepare_import_plan("BEGIN;\nCREATE TABLE t(id INTEGER);\nCOMMIT;", "sqlite").unwrap();
        assert_eq!(sqlite_plan.units.len(), 3);
        assert!(sqlite_plan.script_managed_transaction);

        let mssql_plan = prepare_import_plan("SELECT 1\nGO\nSELECT 2", "mssql").unwrap();
        assert_eq!(mssql_plan.units.len(), 2);
        assert!(!mssql_plan.script_managed_transaction);
    }

    #[test]
    fn should_use_outer_import_transaction_disables_mssql_outer_tx() {
        let sqlite_plan = prepare_import_plan("CREATE TABLE t(id INTEGER);", "sqlite").unwrap();
        assert!(should_use_outer_import_transaction("sqlite", &sqlite_plan));

        let sqlite_script_tx =
            prepare_import_plan("BEGIN;\nCREATE TABLE t(id INTEGER);\nCOMMIT;", "sqlite").unwrap();
        assert!(!should_use_outer_import_transaction(
            "sqlite",
            &sqlite_script_tx
        ));

        let mssql_plan = prepare_import_plan("SELECT 1\nGO\nSELECT 2", "mssql").unwrap();
        assert!(!should_use_outer_import_transaction("mssql", &mssql_plan));
    }

    #[test]
    fn import_transaction_sql_maps_per_driver() {
        assert_eq!(
            import_transaction_sql("mysql", "mysql").unwrap(),
            ("START TRANSACTION", "COMMIT", "ROLLBACK")
        );
        assert_eq!(
            import_transaction_sql("postgres", "postgres").unwrap(),
            ("BEGIN", "COMMIT", "ROLLBACK")
        );
        assert_eq!(
            import_transaction_sql("postgres", "postgresql").unwrap(),
            ("BEGIN", "COMMIT", "ROLLBACK")
        );
        assert_eq!(
            import_transaction_sql("mssql", "mssql").unwrap(),
            (
                "BEGIN TRANSACTION",
                "COMMIT TRANSACTION",
                "ROLLBACK TRANSACTION"
            )
        );
        assert_eq!(
            import_transaction_sql("oracle", "oracle").unwrap(),
            ("SELECT 1 FROM DUAL", "COMMIT", "ROLLBACK")
        );
        assert!(import_transaction_sql("clickhouse", "clickhouse").is_err());
        assert!(import_transaction_sql("starrocks", "starrocks").is_err());
    }

    #[test]
    fn normalize_driver_name_maps_aliases() {
        assert_eq!(normalize_driver_name("postgres"), "postgres");
        assert_eq!(normalize_driver_name("postgresql"), "postgres");
        assert_eq!(normalize_driver_name("pgsql"), "postgres");
        assert_eq!(normalize_driver_name("mysql"), "mysql");
    }

    #[test]
    fn truncate_error_message_caps_length() {
        let source = "x".repeat(600);
        let truncated = truncate_error_message(&source);
        assert!(truncated.len() <= 503);
        assert!(truncated.ends_with("..."));
    }

    fn tmp_path(suffix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("dbpaw-transfer-test-{unique}-{suffix}"))
    }

    fn make_row(pairs: &[(&str, Value)]) -> Value {
        let mut map = serde_json::Map::new();
        for (k, v) in pairs {
            map.insert(k.to_string(), v.clone());
        }
        Value::Object(map)
    }

    #[test]
    fn extension_for_format_sql_variants_all_return_sql() {
        assert_eq!(extension_for_format(&ExportFormat::SqlDml), "sql");
        assert_eq!(extension_for_format(&ExportFormat::SqlDdl), "sql");
        assert_eq!(extension_for_format(&ExportFormat::SqlFull), "sql");
        assert_eq!(extension_for_format(&ExportFormat::Csv), "csv");
        assert_eq!(extension_for_format(&ExportFormat::Json), "json");
    }

    #[test]
    fn export_writer_csv_writes_header_then_rows() {
        let path = tmp_path("csv_header.csv");
        let cols = vec!["id".to_string(), "name".to_string()];
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::Csv).unwrap();
        writer.write_csv_header(&cols).unwrap();
        let rows = vec![make_row(&[
            ("id", Value::Number(1.into())),
            ("name", Value::String("alice".to_string())),
        ])];
        writer
            .write_rows(&rows, &cols, None, "t", "postgres")
            .unwrap();
        writer.finish().unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("id,name\n"));
        assert!(content.contains("1,alice"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn write_csv_header_is_noop_for_sql_formats() {
        let path = tmp_path("sql_noop_header.sql");
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::SqlDml).unwrap();
        writer.write_csv_header(&["id".to_string()]).unwrap();
        writer.finish().unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert_eq!(content, "");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn export_writer_sql_dml_writes_insert_statements() {
        let path = tmp_path("sql_dml.sql");
        let cols = vec!["id".to_string(), "name".to_string()];
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::SqlDml).unwrap();
        let rows = vec![
            make_row(&[
                ("id", Value::Number(1.into())),
                ("name", Value::String("alice".to_string())),
            ]),
            make_row(&[("id", Value::Number(2.into())), ("name", Value::Null)]),
        ];
        let count = writer
            .write_rows(&rows, &cols, Some("public"), "users", "postgres")
            .unwrap();
        writer.finish().unwrap();
        assert_eq!(count, 2);
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("INSERT INTO \"public\".\"users\""));
        assert!(content.contains("VALUES (1, 'alice')"));
        assert!(content.contains("VALUES (2, NULL)"));
        assert!(!content.contains("CREATE TABLE"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn export_writer_sql_ddl_writes_only_ddl() {
        let path = tmp_path("sql_ddl.sql");
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::SqlDdl).unwrap();
        writer
            .write_ddl("CREATE TABLE users (id INTEGER);")
            .unwrap();
        writer.finish().unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("CREATE TABLE users (id INTEGER);"));
        assert!(!content.contains("INSERT INTO"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn export_writer_sql_full_writes_ddl_then_inserts() {
        let path = tmp_path("sql_full.sql");
        let cols = vec!["id".to_string(), "val".to_string()];
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::SqlFull).unwrap();
        writer
            .write_ddl("CREATE TABLE t (id INT, val TEXT);")
            .unwrap();
        let rows = vec![make_row(&[
            ("id", Value::Number(1.into())),
            ("val", Value::String("x".to_string())),
        ])];
        let count = writer
            .write_rows(&rows, &cols, None, "t", "postgres")
            .unwrap();
        writer.finish().unwrap();
        assert_eq!(count, 1);
        let content = fs::read_to_string(&path).unwrap();
        let ddl_pos = content.find("CREATE TABLE").unwrap();
        let dml_pos = content.find("INSERT INTO").unwrap();
        assert!(ddl_pos < dml_pos, "DDL should appear before DML");
        assert!(content.contains("VALUES (1, 'x')"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn database_export_writes_all_tables_in_schema_then_name_order() {
        let path = tmp_path("database_export.sql");
        let driver = Arc::new(FakeExportDriver {
            tables: vec![
                TableInfo {
                    schema: "zeta".to_string(),
                    name: "logs".to_string(),
                    r#type: "table".to_string(),
                },
                TableInfo {
                    schema: "alpha".to_string(),
                    name: "users".to_string(),
                    r#type: "table".to_string(),
                },
                TableInfo {
                    schema: "alpha".to_string(),
                    name: "accounts".to_string(),
                    r#type: "table".to_string(),
                },
            ],
            ddls: HashMap::from([
                (
                    ("alpha".to_string(), "accounts".to_string()),
                    "CREATE TABLE accounts (id INT);".to_string(),
                ),
                (
                    ("alpha".to_string(), "users".to_string()),
                    "CREATE TABLE users (id INT);".to_string(),
                ),
                (
                    ("zeta".to_string(), "logs".to_string()),
                    "CREATE TABLE logs (id INT);".to_string(),
                ),
            ]),
            rows: HashMap::from([
                (
                    ("alpha".to_string(), "accounts".to_string()),
                    vec![make_row(&[("id", Value::Number(1.into()))])],
                ),
                (
                    ("alpha".to_string(), "users".to_string()),
                    vec![make_row(&[("id", Value::Number(2.into()))])],
                ),
                (
                    ("zeta".to_string(), "logs".to_string()),
                    vec![make_row(&[("id", Value::Number(3.into()))])],
                ),
            ]),
        });

        let result = tauri::async_runtime::block_on(do_database_export(
            driver,
            path.clone(),
            "postgres".to_string(),
            ExportFormat::SqlFull,
            2000,
        ))
        .unwrap();

        assert_eq!(result.row_count, 3);
        let content = fs::read_to_string(&path).unwrap();
        let accounts_pos = content.find("CREATE TABLE accounts").unwrap();
        let users_pos = content.find("CREATE TABLE users").unwrap();
        let logs_pos = content.find("CREATE TABLE logs").unwrap();
        assert!(accounts_pos < users_pos);
        assert!(users_pos < logs_pos);
        assert!(content.contains("INSERT INTO \"alpha\".\"accounts\""));
        assert!(content.contains("INSERT INTO \"alpha\".\"users\""));
        assert!(content.contains("INSERT INTO \"zeta\".\"logs\""));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn database_export_respects_sql_ddl_mode() {
        let path = tmp_path("database_export_ddl.sql");
        let driver = Arc::new(FakeExportDriver {
            tables: vec![TableInfo {
                schema: "public".to_string(),
                name: "users".to_string(),
                r#type: "table".to_string(),
            }],
            ddls: HashMap::from([(
                ("public".to_string(), "users".to_string()),
                "CREATE TABLE users (id INT);".to_string(),
            )]),
            rows: HashMap::from([(
                ("public".to_string(), "users".to_string()),
                vec![make_row(&[("id", Value::Number(1.into()))])],
            )]),
        });

        let result = tauri::async_runtime::block_on(do_database_export(
            driver,
            path.clone(),
            "postgres".to_string(),
            ExportFormat::SqlDdl,
            2000,
        ))
        .unwrap();

        assert_eq!(result.row_count, 0);
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("CREATE TABLE users"));
        assert!(!content.contains("INSERT INTO"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn database_export_respects_sql_dml_mode() {
        let path = tmp_path("database_export_dml.sql");
        let driver = Arc::new(FakeExportDriver {
            tables: vec![TableInfo {
                schema: "public".to_string(),
                name: "users".to_string(),
                r#type: "table".to_string(),
            }],
            ddls: HashMap::from([(
                ("public".to_string(), "users".to_string()),
                "CREATE TABLE users (id INT);".to_string(),
            )]),
            rows: HashMap::from([(
                ("public".to_string(), "users".to_string()),
                vec![make_row(&[("id", Value::Number(1.into()))])],
            )]),
        });

        let result = tauri::async_runtime::block_on(do_database_export(
            driver,
            path.clone(),
            "postgres".to_string(),
            ExportFormat::SqlDml,
            2000,
        ))
        .unwrap();

        assert_eq!(result.row_count, 1);
        let content = fs::read_to_string(&path).unwrap();
        assert!(!content.contains("CREATE TABLE"));
        assert!(content.contains("INSERT INTO \"public\".\"users\""));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn write_ddl_trims_trailing_whitespace_and_adds_blank_line() {
        let path = tmp_path("ddl_trim.sql");
        let mut writer = ExportWriter::new(path.clone(), ExportFormat::SqlDdl).unwrap();
        writer.write_ddl("CREATE TABLE t (id INT);   \n\n").unwrap();
        writer.finish().unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.starts_with("CREATE TABLE t (id INT);"));
        assert!(content.ends_with("\n\n"));
        let _ = fs::remove_file(path);
    }
}

#[macro_export]
macro_rules! transfer_commands {
    () => {
        $crate::commands::transfer::export_table_data,
        $crate::commands::transfer::export_database_sql,
        $crate::commands::transfer::export_query_result,
        $crate::commands::transfer::import_sql_file,
    };
}
