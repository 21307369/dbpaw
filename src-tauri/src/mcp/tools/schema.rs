use super::super::types::*;
use crate::state::AppState;
use serde_json::Value;

pub fn get_definitions() -> Vec<ToolDefinition> {
    vec![ToolDefinition {
        name: "dbpaw_get_schema_context".to_string(),
        description: "Get schema context for AI - provides table structures as a dictionary for writing SQL".to_string(),
        input_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "connection_id": {
                    "type": "integer",
                    "description": "Connection ID"
                },
                "database": {
                    "type": "string",
                    "description": "Database name (optional)"
                },
                "tables": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Specific table names to include (optional, defaults to first N tables)"
                },
                "max_tables": {
                    "type": "integer",
                    "description": "Maximum number of tables to include (default: 10, max: 30)"
                }
            },
            "required": ["connection_id"]
        }),
    }]
}

pub async fn get_schema_context(state: &AppState, args: Value) -> Result<ToolResult, String> {
    let connection_id = args["connection_id"]
        .as_i64()
        .ok_or("Missing connection_id")?;
    let database = args["database"].as_str().map(|s| s.to_string());
    let tables_filter: Option<Vec<String>> = args["tables"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase())).collect());
    let max_tables = args["max_tables"]
        .as_u64()
        .unwrap_or(10)
        .min(30) as usize;

    // 获取连接信息
    let connections = crate::commands::connection::get_connections_direct(state).await?;
    let conn = connections
        .iter()
        .find(|c| c.id == connection_id)
        .ok_or(format!("Connection {} not found", connection_id))?;
    let driver = conn.db_type.clone();
    let schema = super::default_schema_for_driver(&driver);

    // 获取表列表
    let all_tables = crate::commands::execute_with_retry_from_app_state(
        state,
        connection_id,
        database.clone(),
        |driver| async move { driver.list_tables(None).await },
    )
    .await?;

    // 过滤表
    let total_tables = all_tables.len();
    let selected_tables = if let Some(filter) = tables_filter {
        all_tables
            .into_iter()
            .filter(|t| filter.contains(&t.name.to_lowercase()))
            .collect::<Vec<_>>()
    } else {
        all_tables.into_iter().take(max_tables).collect::<Vec<_>>()
    };

    // 构建 Schema Context
    let mut output = format!(
        "Connection: {}\nDatabase: {}\n\n",
        conn.name,
        database.as_deref().unwrap_or("default")
    );

    for table in &selected_tables {
        match crate::commands::metadata::get_table_metadata_direct(
            state,
            connection_id,
            database.clone(),
            schema.clone(),
            table.name.clone(),
        )
        .await
        {
            Ok(metadata) => {
                output.push_str(&format!("## {}\n", table.name));
                output.push_str(&format!("Type: {}\n", table.r#type));

                for col in &metadata.columns {
                    let nullable = if col.nullable { "NULL" } else { "NOT NULL" };
                    let pk = if col.primary_key { " PK" } else { "" };
                    let comment = col
                        .comment
                        .as_ref()
                        .map(|c| format!(" -- {}", c))
                        .unwrap_or_default();
                    output.push_str(&format!(
                        "- {} {} {}{}{}\n",
                        col.name, col.r#type, nullable, pk, comment
                    ));
                }
                output.push('\n');
            }
            Err(e) => {
                output.push_str(&format!("## {}\nError: {}\n\n", table.name, e));
            }
        }
    }

    let truncated = selected_tables.len() < total_tables;
    if truncated {
        output.push_str(&format!(
            "... and {} more tables (use 'tables' parameter to specify which ones)\n",
            total_tables - selected_tables.len()
        ));
    }

    Ok(ToolResult::text(output))
}
