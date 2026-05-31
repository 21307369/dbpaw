# MCP Integration Test Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 21 integration tests to `mcp_integration.rs` covering Resources, Prompts, Completion, Sampling, expanded SQL safety, and edge cases.

**Architecture:** All tests use the stdio binary (`dbpaw-mcp`), send JSON-RPC requests via stdin, and validate JSON responses from stdout. No database connections needed.

**Tech Stack:** Rust, serde_json, std::process::Command

---

## File Structure

**Single file modified:** `src-tauri/tests/mcp_integration.rs`

All 21 tests are added to this existing file. The helper functions (`get_mcp_binary`, `send_request`) are reused as-is.

---

### Task 1: Protocol Basics Tests

**Files:**
- Modify: `src-tauri/tests/mcp_integration.rs`

- [ ] **Step 1: Add `test_mcp_ping`**

```rust
#[test]
fn test_mcp_ping() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert_eq!(v["jsonrpc"], "2.0");
    assert_eq!(v["id"], 2);
    assert_eq!(v["result"], serde_json::json!({}));
    assert!(v.get("error").is_none());

    proc.kill().unwrap();
}
```

- [ ] **Step 2: Add `test_mcp_initialized_notification`**

```rust
#[test]
fn test_mcp_initialized_notification() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    // initialized is a notification (no id), should not produce a response
    let stdin = proc.stdin.as_mut().unwrap();
    stdin.write_all(b"{\"jsonrpc\":\"2.0\",\"method\":\"initialized\"}\n").unwrap();
    stdin.flush().unwrap();

    // Send a ping to verify server is still alive
    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"ping","params":{}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();
    assert_eq!(v["id"], 2);

    proc.kill().unwrap();
}
```

- [ ] **Step 3: Add `test_mcp_method_not_found`**

```rust
#[test]
fn test_mcp_method_not_found() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"nonexistent/method","params":{}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert!(v.get("error").is_some());
    assert_eq!(v["error"]["code"], -32601);

    proc.kill().unwrap();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --test mcp_integration test_mcp_ping test_mcp_initialized_notification test_mcp_method_not_found -- --test-threads=1 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: add MCP protocol basics tests (ping, initialized, method_not_found)"
```

---

### Task 2: Resources Tests

**Files:**
- Modify: `src-tauri/tests/mcp_integration.rs`

- [ ] **Step 1: Add `test_mcp_resources_list`**

```rust
#[test]
fn test_mcp_resources_list() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    let resources = v["result"]["resources"].as_array().unwrap();
    assert!(!resources.is_empty(), "Expected at least 1 resource");

    // Should have the connections resource
    let names: Vec<&str> = resources.iter().map(|r| r["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"connections"));

    proc.kill().unwrap();
}
```

- [ ] **Step 2: Add `test_mcp_resources_templates_list`**

```rust
#[test]
fn test_mcp_resources_templates_list() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"resources/templates/list","params":{}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    let templates = v["result"]["resourceTemplates"].as_array().unwrap();
    assert!(!templates.is_empty(), "Expected at least 1 resource template");

    // Should have table_list and table_detail templates
    let names: Vec<&str> = templates.iter().map(|t| t["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"table_list"));
    assert!(names.contains(&"table_detail"));

    proc.kill().unwrap();
}
```

- [ ] **Step 3: Add `test_mcp_resources_read_connections`**

```rust
#[test]
fn test_mcp_resources_read_connections() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"dbpaw://connections"}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    // Should return contents array (may be empty if no connections saved)
    assert!(v["result"]["contents"].as_array().is_some());

    proc.kill().unwrap();
}
```

- [ ] **Step 4: Add `test_mcp_resources_read_invalid_uri`**

```rust
#[test]
fn test_mcp_resources_read_invalid_uri() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"invalid://unknown"}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    // Should return error
    assert!(v.get("error").is_some() || v["result"]["isError"] == true);

    proc.kill().unwrap();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --test mcp_integration test_mcp_resources -- --test-threads=1 2>&1 | tail -20
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: add MCP Resources integration tests (list, templates, read, invalid URI)"
```

---

### Task 3: Prompts Tests

**Files:**
- Modify: `src-tauri/tests/mcp_integration.rs`

- [ ] **Step 1: Add `test_mcp_prompts_list`**

```rust
#[test]
fn test_mcp_prompts_list() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"prompts/list","params":{}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    let prompts = v["result"]["prompts"].as_array().unwrap();
    assert!(!prompts.is_empty(), "Expected at least 1 prompt");

    let names: Vec<&str> = prompts.iter().map(|p| p["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"analyze_table"));

    proc.kill().unwrap();
}
```

- [ ] **Step 2: Add `test_mcp_prompts_get_unknown`**

```rust
#[test]
fn test_mcp_prompts_get_unknown() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"nonexistent_prompt","arguments":{}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert!(v.get("error").is_some() || v["result"]["isError"] == true);

    proc.kill().unwrap();
}
```

- [ ] **Step 3: Add `test_mcp_prompts_get_missing_params`**

```rust
#[test]
fn test_mcp_prompts_get_missing_params() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"prompts/get"}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert!(v.get("error").is_some() || v["result"]["isError"] == true);

    proc.kill().unwrap();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --test mcp_integration test_mcp_prompts -- --test-threads=1 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: add MCP Prompts integration tests (list, get unknown, missing params)"
```

---

### Task 4: Completion + Sampling Tests

**Files:**
- Modify: `src-tauri/tests/mcp_integration.rs`

- [ ] **Step 1: Add `test_mcp_completion_complete`**

```rust
#[test]
fn test_mcp_completion_complete() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"completion/complete","params":{"ref":{"type":"ref/prompt","name":"analyze_table"},"argument":{"name":"connection_id","value":""}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    let values = v["result"]["completion"]["values"].as_array();
    assert!(values.is_some(), "Expected completion values array");

    proc.kill().unwrap();
}
```

- [ ] **Step 2: Add `test_mcp_completion_unknown_arg`**

```rust
#[test]
fn test_mcp_completion_unknown_arg() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"completion/complete","params":{"ref":{"type":"ref/prompt","name":"analyze_table"},"argument":{"name":"unknown_arg","value":""}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    let values = v["result"]["completion"]["values"].as_array().unwrap();
    assert!(values.is_empty(), "Expected empty values for unknown argument");

    proc.kill().unwrap();
}
```

- [ ] **Step 3: Add `test_mcp_sampling_create_message`**

```rust
#[test]
fn test_mcp_sampling_create_message() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"sampling/createMessage","params":{"messages":[{"role":"user","content":{"type":"text","text":"hello"}}]}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    // Sampling should return an error (requires client support)
    assert!(v.get("error").is_some() || v["result"]["isError"] == true);

    proc.kill().unwrap();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --test mcp_integration test_mcp_completion test_mcp_sampling -- --test-threads=1 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: add MCP Completion and Sampling integration tests"
```

---

### Task 5: Expanded SQL Safety Tests

**Files:**
- Modify: `src-tauri/tests/mcp_integration.rs`

- [ ] **Step 1: Add `test_mcp_sql_safety_truncate_blocked`**

```rust
#[test]
fn test_mcp_sql_safety_truncate_blocked() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dbpaw_execute_query","arguments":{"connection_id":1,"sql":"TRUNCATE TABLE users"}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert_eq!(v["result"]["isError"], true);
    let text = v["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Dangerous keyword"));

    proc.kill().unwrap();
}
```

- [ ] **Step 2: Add `test_mcp_sql_safety_alter_blocked`**

```rust
#[test]
fn test_mcp_sql_safety_alter_blocked() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dbpaw_execute_query","arguments":{"connection_id":1,"sql":"ALTER TABLE users ADD COLUMN age INT"}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert_eq!(v["result"]["isError"], true);
    let text = v["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Dangerous keyword"));

    proc.kill().unwrap();
}
```

- [ ] **Step 3: Add `test_mcp_sql_safety_create_blocked`**

```rust
#[test]
fn test_mcp_sql_safety_create_blocked() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dbpaw_execute_query","arguments":{"connection_id":1,"sql":"CREATE TABLE test (id INT)"}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert_eq!(v["result"]["isError"], true);
    let text = v["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("Dangerous keyword"));

    proc.kill().unwrap();
}
```

- [ ] **Step 4: Add `test_mcp_sql_safety_update_no_where_blocked`**

```rust
#[test]
fn test_mcp_sql_safety_update_no_where_blocked() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dbpaw_execute_query","arguments":{"connection_id":1,"sql":"UPDATE users SET name = 'test'"}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert_eq!(v["result"]["isError"], true);
    let text = v["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("WHERE"));

    proc.kill().unwrap();
}
```

- [ ] **Step 5: Add `test_mcp_sql_safety_delete_no_where_blocked`**

```rust
#[test]
fn test_mcp_sql_safety_delete_no_where_blocked() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dbpaw_execute_query","arguments":{"connection_id":1,"sql":"DELETE FROM users"}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert_eq!(v["result"]["isError"], true);
    let text = v["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("WHERE"));

    proc.kill().unwrap();
}
```

- [ ] **Step 6: Add `test_mcp_sql_safety_select_where_allowed`**

```rust
#[test]
fn test_mcp_sql_safety_select_where_allowed() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"dbpaw_execute_query","arguments":{"connection_id":1,"sql":"SELECT * FROM users WHERE id = 1"}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    // Should NOT be a safety rejection — it may fail due to no DB connection,
    // but the error should NOT contain safety-related keywords
    if let Some(text) = v["result"]["content"][0]["text"].as_str() {
        assert!(!text.contains("Dangerous keyword"), "SELECT WHERE should not be blocked by safety");
        assert!(!text.contains("Write operation"), "SELECT WHERE should not be blocked by safety");
        assert!(!text.contains("Multiple statements"), "SELECT WHERE should not be blocked by safety");
    }

    proc.kill().unwrap();
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --test mcp_integration test_mcp_sql_safety -- --test-threads=1 2>&1 | tail -20
```

Expected: 12 tests pass (6 original + 6 new).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: add expanded SQL safety integration tests (TRUNCATE, ALTER, CREATE, UPDATE/DELETE without WHERE)"
```

---

### Task 6: Tools Edge Cases Tests

**Files:**
- Modify: `src-tauri/tests/mcp_integration.rs`

- [ ] **Step 1: Add `test_mcp_tools_call_missing_params`**

```rust
#[test]
fn test_mcp_tools_call_missing_params() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call"}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert!(v.get("error").is_some() || v["result"]["isError"] == true);

    proc.kill().unwrap();
}
```

- [ ] **Step 2: Add `test_mcp_tools_call_missing_name`**

```rust
#[test]
fn test_mcp_tools_call_missing_name() {
    let mut proc = Command::new(get_mcp_binary())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();

    send_request(&mut proc, r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#);

    let response = send_request(&mut proc, r#"{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"arguments":{}}}}"#);
    let v: Value = serde_json::from_str(&response).unwrap();

    assert!(v.get("error").is_some() || v["result"]["isError"] == true);

    proc.kill().unwrap();
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
cd src-tauri && cargo test --test mcp_integration test_mcp_tools_call_missing -- --test-threads=1 2>&1 | tail -20
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: add MCP tools/call edge case tests (missing params, missing name)"
```

---

### Task 7: Final Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run all MCP integration tests**

```bash
cd src-tauri && cargo test --test mcp_integration -- --test-threads=1 2>&1 | tail -30
```

Expected: 27 tests pass (6 original + 21 new).

- [ ] **Step 2: Verify no regressions in unit tests**

```bash
cd src-tauri && cargo test --lib mcp 2>&1 | tail -20
```

Expected: All existing unit tests pass.

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add src-tauri/tests/mcp_integration.rs
git commit -m "test: complete MCP integration test expansion (27 tests)"
```
