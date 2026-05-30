mod connection;
mod schema;
mod sql;

use super::types::*;
use crate::state::AppState;
use serde_json::Value;

pub fn default_schema_for_driver(driver: &str) -> String {
    match driver.to_ascii_lowercase().as_str() {
        "postgres" | "cockroach" => "public".to_string(),
        "mysql" | "mariadb" | "tidb" | "starrocks" | "doris" => "main".to_string(),
        "sqlite" | "duckdb" => "main".to_string(),
        "clickhouse" => "default".to_string(),
        "mssql" => "dbo".to_string(),
        _ => "public".to_string(),
    }
}

pub fn get_tool_definitions() -> Vec<ToolDefinition> {
    let mut tools = Vec::new();

    // 连接管理工具
    tools.extend(connection::get_definitions());

    // Schema 工具
    tools.extend(schema::get_definitions());

    // SQL 查询工具
    tools.extend(sql::get_definitions());

    tools
}

pub async fn execute_tool(
    state: &AppState,
    name: &str,
    arguments: Value,
) -> Result<ToolResult, String> {
    match name {
        // 连接管理
        "dbpaw_list_connections" => connection::list_connections(state).await,
        "dbpaw_list_databases" => connection::list_databases(state, arguments).await,
        "dbpaw_list_tables" => connection::list_tables(state, arguments).await,
        "dbpaw_describe_table" => connection::describe_table(state, arguments).await,
        "dbpaw_get_ddl" => connection::get_ddl(state, arguments).await,

        // Schema
        "dbpaw_get_schema_context" => schema::get_schema_context(state, arguments).await,

        // SQL
        "dbpaw_execute_query" => sql::execute_query(state, arguments).await,

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_postgres() {
        assert_eq!(default_schema_for_driver("postgres"), "public");
    }

    #[test]
    fn schema_cockroach() {
        assert_eq!(default_schema_for_driver("cockroach"), "public");
    }

    #[test]
    fn schema_mysql() {
        assert_eq!(default_schema_for_driver("mysql"), "main");
    }

    #[test]
    fn schema_sqlite() {
        assert_eq!(default_schema_for_driver("sqlite"), "main");
    }

    #[test]
    fn schema_clickhouse() {
        assert_eq!(default_schema_for_driver("clickhouse"), "default");
    }

    #[test]
    fn schema_mssql() {
        assert_eq!(default_schema_for_driver("mssql"), "dbo");
    }

    #[test]
    fn schema_unknown_defaults_to_public() {
        assert_eq!(default_schema_for_driver("some_new_db"), "public");
    }

    #[test]
    fn schema_case_insensitive() {
        assert_eq!(default_schema_for_driver("POSTGRES"), "public");
        assert_eq!(default_schema_for_driver("MySQL"), "main");
    }
}
