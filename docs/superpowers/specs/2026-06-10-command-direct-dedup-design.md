# Command/Direct Deduplication Design

## Problem

Every `#[tauri::command]` function has a corresponding `_direct` function that differs only in how it obtains the driver (`execute_with_retry` vs `execute_with_retry_from_app_state`). The business logic is copy-pasted, creating a maintenance hazard: changing one without changing the other introduces bugs.

Affected files: `commands/connection.rs`, `commands/query.rs`, `commands/metadata.rs`.

## Solution

Extract business logic into core functions that take `&AppState` and return `Result<T, AppError>`. Both the Tauri command and `_direct` function become thin wrappers that call the core.

### Core Function Pattern

```rust
pub async fn create_database_core(
    state: &AppState,
    id: i64,
    payload: CreateDatabasePayload,
) -> Result<(), AppError> {
    // ... all business logic
}
```

### Wrapper Pattern

```rust
#[tauri::command]
pub async fn create_database_by_id(
    state: State<'_, AppState>,
    id: i64,
    payload: CreateDatabasePayload,
) -> Result<(), String> {
    create_database_core(state.inner(), id, payload)
        .await
        .map_err(String::from)
}

pub async fn create_database_by_id_direct(
    state: &AppState,
    id: i64,
    payload: CreateDatabasePayload,
) -> Result<(), String> {
    create_database_core(state, id, payload)
        .await
        .map_err(String::from)
}
```

### Error Handling Alignment

Core functions return `Result<T, AppError>`. Error-to-String conversion happens only at the Tauri command boundary (`map_err(String::from)`). This aligns with AGENTS.md: "Structured errors must cross the backend from the inside out."

## Affected Functions

### connection.rs (8 pairs)

| Core function | Command wrapper | Direct wrapper |
|---|---|---|
| `create_database_core` | `create_database_by_id` | `create_database_by_id_direct` |
| `list_databases_core` | `list_databases_by_id` | `list_databases_by_id_direct` |
| `get_connections_core` | `get_connections` | `get_connections_direct` |
| `create_connection_core` | `create_connection` | `create_connection_direct` |
| `update_connection_core` | `update_connection` | `update_connection_direct` |
| `delete_connection_core` | `delete_connection` | `delete_connection_direct` |
| `get_mysql_charsets_core` | `get_mysql_charsets_by_id` | `get_mysql_charsets_by_id_direct` |
| `get_mysql_collations_core` | `get_mysql_collations_by_id` | `get_mysql_collations_by_id_direct` |

### query.rs (4 pairs)

| Core function | Command wrapper | Direct wrapper |
|---|---|---|
| `execute_query_core` | `execute_query` | `execute_query_by_id_direct` |
| `cancel_query_core` | `cancel_query` | `cancel_query_direct` |
| `list_sql_execution_logs_core` | `list_sql_execution_logs` | `list_sql_execution_logs_direct` |
| `append_sql_execution_log_core` | `append_sql_execution_log` | `append_sql_execution_log_direct` |

### metadata.rs (4 pairs)

| Core function | Command wrapper | Direct wrapper |
|---|---|---|
| `get_schema_overview_core` | `get_schema_overview` | `get_schema_overview_direct` |
| `get_table_structure_core` | `get_table_structure` | `get_table_structure_direct` |
| `get_table_ddl_core` | `get_table_ddl` | `get_table_ddl_direct` |
| `get_table_metadata_core` | `get_table_metadata` | `get_table_metadata_direct` |

## What Stays the Same

- `_direct` functions remain for backward compatibility (tests, MCP tools call them)
- `execute_with_retry` and `execute_with_retry_from_app_state` in `commands/mod.rs` are not changed (they already share `execute_with_retry_inner`)
- SQL builders (`build_mysql_create_database_sql`, etc.) stay as private helpers
- Validation functions (`validate_database_name`, etc.) stay as private helpers
- Tests remain in place and continue to pass

## Verification

1. `cargo check` passes
2. `cargo test` passes (existing unit tests)
3. `cargo clippy` clean
4. No behavioral changes — pure structural refactoring
