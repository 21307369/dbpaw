use super::super::types::*;
use crate::state::AppState;
use serde_json::Value;

async fn get_schema_for_connection(state: &AppState, connection_id: i64) -> Result<String, String> {
    let connections = crate::commands::connection::get_connections_direct(state).await?;
    let conn = connections
        .iter()
        .find(|c| c.id == connection_id)
        .ok_or(format!("Connection {} not found", connection_id))?;
    Ok(super::default_schema_for_driver(&conn.db_type))
}

pub fn get_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "dbpaw_list_connections".to_string(),
            description: "List all saved database connections".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        ToolDefinition {
            name: "dbpaw_list_databases".to_string(),
            description: "List all databases for a connection".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": {
                        "type": "integer",
                        "description": "Connection ID"
                    }
                },
                "required": ["connection_id"]
            }),
        },
        ToolDefinition {
            name: "dbpaw_list_tables".to_string(),
            description: "List all tables in a database".to_string(),
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
                    }
                },
                "required": ["connection_id"]
            }),
        },
        ToolDefinition {
            name: "dbpaw_describe_table".to_string(),
            description: "Get table structure (columns, types, indexes, foreign keys)".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": {
                        "type": "integer",
                        "description": "Connection ID"
                    },
                    "database": {
                        "type": "string",
                        "description": "Database name"
                    },
                    "table": {
                        "type": "string",
                        "description": "Table name"
                    }
                },
                "required": ["connection_id", "database", "table"]
            }),
        },
        ToolDefinition {
            name: "dbpaw_get_ddl".to_string(),
            description: "Get CREATE TABLE DDL statement".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "connection_id": {
                        "type": "integer",
                        "description": "Connection ID"
                    },
                    "database": {
                        "type": "string",
                        "description": "Database name"
                    },
                    "table": {
                        "type": "string",
                        "description": "Table name"
                    }
                },
                "required": ["connection_id", "database", "table"]
            }),
        },
    ]
}

pub async fn list_connections(state: &AppState) -> Result<ToolResult, String> {
    let connections = crate::commands::connection::get_connections_direct(state).await?;

    let mut output = String::from("| ID | Name | Type | Host | Port | Database |\n");
    output.push_str("|---|------|------|------|------|----------|\n");

    for conn in &connections {
        output.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} |\n",
            conn.id, conn.name, conn.db_type, conn.host, conn.port, conn.database
        ));
    }

    Ok(ToolResult::text(output))
}

pub async fn list_databases(state: &AppState, args: Value) -> Result<ToolResult, String> {
    let connection_id = args["connection_id"]
        .as_i64()
        .ok_or("Missing connection_id")?;

    let databases =
        crate::commands::connection::list_databases_by_id_direct(state, connection_id).await?;

    let mut output = String::from("Databases:\n");
    for db in &databases {
        output.push_str(&format!("- {}\n", db));
    }

    Ok(ToolResult::text(output))
}

pub async fn list_tables(state: &AppState, args: Value) -> Result<ToolResult, String> {
    let connection_id = args["connection_id"]
        .as_i64()
        .ok_or("Missing connection_id")?;
    let database = args["database"].as_str().map(|s| s.to_string());

    let tables = crate::commands::execute_with_retry_from_app_state(
        state,
        connection_id,
        database.clone(),
        |driver| async move { driver.list_tables(None).await },
    )
    .await?;

    let mut output = format!(
        "Tables in {}:\n",
        database.unwrap_or_else(|| "default".to_string())
    );
    output.push_str("| Schema | Name | Type |\n");
    output.push_str("|--------|------|------|\n");

    for table in &tables {
        output.push_str(&format!(
            "| {} | {} | {} |\n",
            table.schema, table.name, table.r#type
        ));
    }

    Ok(ToolResult::text(output))
}

pub async fn describe_table(state: &AppState, args: Value) -> Result<ToolResult, String> {
    let connection_id = args["connection_id"]
        .as_i64()
        .ok_or("Missing connection_id")?;
    let database = args["database"]
        .as_str()
        .ok_or("Missing database")?
        .to_string();
    let table = args["table"]
        .as_str()
        .ok_or("Missing table")?
        .to_string();

    let schema = get_schema_for_connection(state, connection_id).await?;

    let metadata = crate::commands::metadata::get_table_metadata_direct(
        state,
        connection_id,
        Some(database),
        schema,
        table.clone(),
    )
    .await?;

    let mut output = format!("## {}\n\n", table);

    // Columns
    output.push_str("### Columns\n");
    output.push_str("| Name | Type | Nullable | Default | Primary Key | Comment |\n");
    output.push_str("|------|------|----------|---------|-------------|--------|\n");
    for col in &metadata.columns {
        output.push_str(&format!(
            "| {} | {} | {} | {} | {} | {} |\n",
            col.name,
            col.r#type,
            col.nullable,
            col.default_value.as_deref().unwrap_or("-"),
            col.primary_key,
            col.comment.as_deref().unwrap_or("")
        ));
    }

    // Indexes
    if !metadata.indexes.is_empty() {
        output.push_str("\n### Indexes\n");
        output.push_str("| Name | Unique | Type | Columns |\n");
        output.push_str("|------|--------|------|--------|\n");
        for idx in &metadata.indexes {
            output.push_str(&format!(
                "| {} | {} | {} | {} |\n",
                idx.name,
                idx.unique,
                idx.index_type.as_deref().unwrap_or("-"),
                idx.columns.join(", ")
            ));
        }
    }

    // Foreign Keys
    if !metadata.foreign_keys.is_empty() {
        output.push_str("\n### Foreign Keys\n");
        output.push_str("| Name | Column | Referenced Table | Referenced Column |\n");
        output.push_str("|------|--------|-----------------|------------------|\n");
        for fk in &metadata.foreign_keys {
            output.push_str(&format!(
                "| {} | {} | {}.{} | {} |\n",
                fk.name,
                fk.column,
                fk.referenced_schema.as_deref().unwrap_or(""),
                fk.referenced_table,
                fk.referenced_column
            ));
        }
    }

    Ok(ToolResult::text(output))
}

pub async fn get_ddl(state: &AppState, args: Value) -> Result<ToolResult, String> {
    let connection_id = args["connection_id"]
        .as_i64()
        .ok_or("Missing connection_id")?;
    let database = args["database"]
        .as_str()
        .ok_or("Missing database")?
        .to_string();
    let table = args["table"]
        .as_str()
        .ok_or("Missing table")?
        .to_string();

    let schema = get_schema_for_connection(state, connection_id).await?;

    let ddl = crate::commands::metadata::get_table_ddl_direct(
        state,
        connection_id,
        Some(database),
        schema,
        table,
    )
    .await?;

    Ok(ToolResult::text(ddl))
}
