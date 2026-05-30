# Backend Test Coverage Improvement Design

**Date:** 2026-05-30
**Scope:** Fix integration test script + add unit tests for untested backend modules

## Problem

Multiple backend modules have zero test coverage despite containing testable pure functions. Two existing integration test files are never executed because `test-integration.sh` doesn't register them.

**Current state:**
- 386 Rust unit tests passing
- 33 integration test files covering 15 databases
- 622 frontend unit tests

**Key gaps:**
- `cassandra.rs` (975 lines) — 0 unit tests, 5 high-value pure functions
- `mcp/types.rs` (133 lines) — 0 tests, serde types + constructors
- `mcp/tools/sql.rs` (128 lines) — 0 tests, `format_value` pure function
- `mcp/tools/connection.rs` + `schema.rs` — duplicated `default_schema_for_driver`
- `commands/redis.rs` (1440 lines) — 0 tests, 3 pure functions
- `ai/openai_compat.rs` (338 lines) — 0 tests, `validate_config` + duplicated role normalization
- `commands/metadata.rs` (284 lines) — 0 tests, `ensure_table_structure_found`
- `mssql_stateful_command_integration.rs` — exists (768 lines, 18 tests) but never runs
- `starrocks_stateful_command_integration.rs` — exists (594 lines, 13 tests) but never runs

## Goals

1. Fix `test-integration.sh` to register orphaned stateful tests (MSSQL + StarRocks)
2. Add ~18 unit tests for Cassandra driver pure functions
3. Add ~34 unit tests for MCP module (types + tools)
4. Add ~25 unit tests for Redis/AI/metadata pure functions
5. Deduplicate `default_schema_for_driver` in MCP tools
6. Extract `normalize_role` from `openai_compat.rs`

**Non-goals:** Integration tests for new databases, frontend tests, async command tests requiring AppState mocking.

## Changes

### 1. Fix `test-integration.sh`

**File:** `scripts/test-integration.sh`

Register existing orphaned stateful test files:

```bash
# starrocks) case — add line:
run_integration_test "starrocks_stateful_command_integration"

# mssql) case — add line:
run_integration_test "mssql_stateful_command_integration"

# all) case — add both lines after their respective command_integration entries
```

### 2. Cassandra driver unit tests

**File:** `src-tauri/src/db/drivers/cassandra.rs` (add `#[cfg(test)] mod tests` block)

#### `normalize_cassandra_error` tests (6 cases)

| Test | Input substring | Expected prefix |
|------|----------------|-----------------|
| authentication error | `"Authentication failed"` | `[CASSANDRA_ERROR] Authentication failed` |
| credentials error | `"invalid credentials"` | `[CASSANDRA_ERROR] Authentication failed` |
| connection refused | `"Connection refused"` | `[CASSANDRA_ERROR] Connection refused` |
| timeout error | `"timed out"` | `[CASSANDRA_ERROR] Connection timed out` |
| dns error | `"resolve hostname"` | `[CASSANDRA_ERROR] DNS resolution failed` |
| tls error | `"certificate verify"` | `[CASSANDRA_ERROR] TLS/SSL error` |
| unknown error | `"something weird"` | `[CASSANDRA_ERROR] something weird` |

#### `bytes_to_signed_bigint_string` tests (4 cases)

| Test | Input | Expected |
|------|-------|----------|
| empty bytes | `&[]` | `"0"` |
| positive number | `[0x01]` | `"1"` |
| negative number (two's complement -1) | `[0xFF]` | `"-1"` |
| larger negative | `[0x80]` | `"-128"` |

#### `unsigned_bytes_to_decimal` tests (3 cases)

| Test | Input | Expected |
|------|-------|----------|
| empty bytes | `&[]` | `"0"` |
| all zeros | `[0, 0]` | `"0"` |
| single byte | `[255]` | `"255"` |
| multi-byte | `[0x01, 0x00]` | `"256"` |

#### `column_type_to_string` tests (5 cases)

| Test | Input | Expected |
|------|-------|----------|
| native int | `NativeType::Int` | `"int"` |
| native text | `NativeType::Text` | `"text"` |
| list | `Collection { List(Native(Int)), frozen: false }` | `"list<int>"` |
| frozen map | `Collection { Map(Native(Text), Native(Int)), frozen: true }` | `"frozen<map<text, int>>"` |
| tuple | `Tuple([Native(Int), Native(Text)])` | `"tuple<int, text>"` |

Note: `cql_value_to_json` tests depend on being able to construct `CqlValue` instances from the scylla driver crate. If `CqlValue` constructors are accessible, add ~12 tests covering: Null, Ascii/Text, Boolean, Int/BigInt, Timestamp (millis→datetime), Date (days offset), Time (nanos), Blob (base64), List, Map. If constructors are not accessible, skip these and document as future work.

### 3. MCP types unit tests

**File:** `src-tauri/src/mcp/types.rs` (add `#[cfg(test)] mod tests` block)

#### Constructor tests (4 cases)

| Test | Description |
|------|-------------|
| `JsonRpcResponse::success` | `jsonrpc == "2.0"`, `id` preserved, `result` is `Some`, `error` is `None` |
| `JsonRpcResponse::error` | `jsonrpc == "2.0"`, `error.code` matches, `result` is `None` |
| `ToolResult::text` | one content item, `content_type == "text"`, `is_error` is `None` |
| `ToolResult::error` | one content item, `is_error == Some(true)` |

#### Serde round-trip tests (12 cases)

| Type | Test |
|------|------|
| `JsonRpcRequest` | serialize with/without optional fields; deserialize valid JSON |
| `JsonRpcResponse` | serialize success (no error field); serialize error (no result field) |
| `JsonRpcError` | serialize with/without `data` |
| `ToolDefinition` | verify `inputSchema` rename |
| `ResourceDefinition` | verify `mimeType` rename |
| `PromptDefinition` | serialize with/without `arguments` |
| `TextContent` | verify `type` rename |
| `ToolResult` | verify `isError` rename + skip_serializing_if |

#### Error code constants (1 case)

Assert values match JSON-RPC 2.0 spec: `PARSE_ERROR = -32700`, `INVALID_REQUEST = -32600`, `METHOD_NOT_FOUND = -32601`, `INVALID_PARAMS = -32602`, `INTERNAL_ERROR = -32603`.

### 4. MCP tools unit tests

#### Deduplicate `default_schema_for_driver`

**Files:**
- `src-tauri/src/mcp/tools/mod.rs` — add `pub fn default_schema_for_driver(driver: &str) -> String`
- `src-tauri/src/mcp/tools/connection.rs` — remove local function, use `super::default_schema_for_driver`
- `src-tauri/src/mcp/tools/schema.rs` — remove local function, use `super::default_schema_for_driver`

#### `default_schema_for_driver` tests (8 cases)

**File:** `src-tauri/src/mcp/tools/mod.rs` (add `#[cfg(test)] mod tests` block)

| Input | Expected |
|-------|----------|
| `"postgres"` | `"public"` |
| `"cockroach"` | `"public"` |
| `"mysql"` | `"main"` |
| `"sqlite"` | `"main"` |
| `"clickhouse"` | `"default"` |
| `"mssql"` | `"dbo"` |
| `"unknown_driver"` | `"public"` |
| `"POSTGRES"` (case insensitive) | `"public"` |

#### `format_value` tests (7 cases)

**File:** `src-tauri/src/mcp/tools/sql.rs` (add `#[cfg(test)] mod tests` block)

| Input | Expected |
|-------|----------|
| `Value::Null` | `"NULL"` |
| `Value::String("hello")` | `"hello"` |
| `Value::String(101 chars)` | first 97 chars + `"..."` |
| `Value::Number(42)` | `"42"` |
| `Value::Bool(true)` | `"true"` |
| `Value::Array([])` | `"[array]"` |
| `Value::Object({})` | `"{object}"` |

#### `get_definitions` tests (2 cases)

| Test | Description |
|------|-------------|
| `sql::get_definitions` | returns 1 tool named `"dbpaw_execute_query"`, required fields include `connection_id` and `sql` |
| `schema::get_definitions` | returns 1 tool named `"dbpaw_get_schema_context"` |

### 5. Redis command unit tests

**File:** `src-tauri/src/commands/redis.rs` (add `#[cfg(test)] mod tests` block)

#### `cache_key` tests (5 cases)

| Input | Expected |
|-------|----------|
| `(1, Some("db0"), false)` | `"1:db0"` |
| `(1, None, false)` | `"1:"` |
| `(42, Some("db1"), true)` | `"42:cluster"` |
| `(42, None, true)` | `"42:cluster"` |
| `(99, Some("mydb"), false)` | `"99:mydb"` |

#### `is_io_error` tests (4 cases)

| Input | Expected |
|-------|----------|
| `"[REDIS_ERROR] broken pipe"` | `true` |
| `"[REDIS_ERROR] connection reset by peer"` | `true` |
| `"[REDIS_ERROR] ERR wrong number of arguments"` | `false` |
| `"some other error"` | `false` |

#### `clamp_redis_command_logs_limit` tests (4 cases)

| Input | Expected |
|-------|----------|
| `None` | `100` |
| `Some(50)` | `50` |
| `Some(0)` | `1` |
| `Some(200)` | `100` |

### 6. AI openai_compat unit tests

**File:** `src-tauri/src/ai/openai_compat.rs`

#### Extract `normalize_role` function

Extract the duplicated role normalization logic (lines 98-102 and 207-210) into a standalone function:

```rust
fn normalize_role(role: &str) -> String {
    match role {
        "system" | "user" | "assistant" | "tool" => role.to_string(),
        "developer" => "system".to_string(),
        _ => "user".to_string(),
    }
}
```

Replace both inline closures in `chat_once` and `chat_stream` with calls to `normalize_role`.

#### `validate_config` tests (4 cases)

| Test | Input | Expected |
|------|-------|----------|
| all valid | `base_url="http://x", api_key="k", model="m"` | `Ok(())` |
| empty base_url | `base_url="", api_key="k", model="m"` | `Err("baseUrl")` |
| empty api_key | `base_url="http://x", api_key="", model="m"` | `Err("apiKey")` |
| empty model | `base_url="http://x", api_key="k", model=""` | `Err("model")` |

#### `normalize_role` tests (5 cases)

| Input | Expected |
|-------|----------|
| `"system"` | `"system"` |
| `"user"` | `"user"` |
| `"assistant"` | `"assistant"` |
| `"developer"` | `"system"` |
| `"unknown_role"` | `"user"` |

### 7. Commands metadata unit test

**File:** `src-tauri/src/commands/metadata.rs` (add `#[cfg(test)] mod tests` block)

#### `ensure_table_structure_found` tests (3 cases)

| Test | Input | Expected |
|------|-------|----------|
| non-empty columns | `TableStructure { columns: [col], .. }` | `Ok(structure)` |
| empty columns | `TableStructure { columns: [], .. }` | `Err("[NOT_FOUND]")` |
| error message contains table name | `table="users"` | error contains `"users"` |

## File Summary

| File | Action | Tests Added |
|------|--------|-------------|
| `scripts/test-integration.sh` | Modify (add 2 stateful test registrations) | 0 (activates 31 existing tests) |
| `src-tauri/src/db/drivers/cassandra.rs` | Modify (add unit tests) | ~18 |
| `src-tauri/src/mcp/types.rs` | Modify (add unit tests) | ~17 |
| `src-tauri/src/mcp/tools/mod.rs` | Modify (add shared function + tests) | ~8 |
| `src-tauri/src/mcp/tools/connection.rs` | Modify (use shared function) | 0 |
| `src-tauri/src/mcp/tools/schema.rs` | Modify (use shared function) | 0 |
| `src-tauri/src/mcp/tools/sql.rs` | Modify (add tests) | ~9 |
| `src-tauri/src/commands/redis.rs` | Modify (add tests) | ~13 |
| `src-tauri/src/ai/openai_compat.rs` | Modify (extract normalize_role + tests) | ~9 |
| `src-tauri/src/commands/metadata.rs` | Modify (add tests) | ~3 |
| **Total** | | **~77** |

## Verification

After all changes:
1. `cargo test --manifest-path src-tauri/Cargo.toml --lib` — all unit tests pass
2. `bun run typecheck` — no type errors
3. `bun run test:smoke` — full smoke suite passes
