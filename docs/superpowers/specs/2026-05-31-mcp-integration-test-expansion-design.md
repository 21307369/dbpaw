# MCP Integration Test Expansion Design

> 日期：2026-05-31
> 状态：已批准
> 范围：扩展 `mcp_integration.rs` 覆盖所有 MCP 协议方法

---

## 1. 背景与目标

当前 `src-tauri/tests/mcp_integration.rs` 有 6 个测试，仅覆盖 initialize、tools/list 和 SQL 安全检查。MCP 服务器实现了完整的 MCP 2025-03-26 协议（Resources、Prompts、Completion、Sampling、Notifications），但这些功能没有集成测试。

**目标**：添加 21 个集成测试，覆盖所有协议方法和边界情况。

---

## 2. 测试策略

所有测试通过 stdio 二进制 (`dbpaw-mcp`) 运行，发送 JSON-RPC 请求并验证响应。不需要数据库连接——测试验证协议行为而非数据操作。

**测试基础设施**：复用现有的 `send_request()` 辅助函数，每个测试独立启动进程。

---

## 3. 新增测试清单

### 3.1 协议基础（3 个测试）

| 测试名 | 方法 | 验证点 |
|--------|------|--------|
| `test_mcp_ping` | `ping` | 返回空 result `{}` |
| `test_mcp_initialized_notification` | `initialized` | 通知不崩溃，无响应 |
| `test_mcp_method_not_found` | `nonexistent/method` | 返回 -32601 错误 |

### 3.2 Resources（4 个测试）

| 测试名 | 方法 | 验证点 |
|--------|------|--------|
| `test_mcp_resources_list` | `resources/list` | 返回 resources 数组 |
| `test_mcp_resources_templates_list` | `resources/templates/list` | 返回 resourceTemplates 数组 |
| `test_mcp_resources_read_connections` | `resources/read` (uri: `dbpaw://connections`) | 返回 contents 数组 |
| `test_mcp_resources_read_invalid_uri` | `resources/read` (uri: `invalid://uri`) | 返回错误 |

### 3.3 Prompts（3 个测试）

| 测试名 | 方法 | 验证点 |
|--------|------|--------|
| `test_mcp_prompts_list` | `prompts/list` | 返回 prompts 数组，包含 analyze_table |
| `test_mcp_prompts_get_unknown` | `prompts/get` (name: `unknown`) | 返回错误 |
| `test_mcp_prompts_get_missing_params` | `prompts/get` (无 params) | 返回错误 |

### 3.4 Completion（2 个测试）

| 测试名 | 方法 | 验证点 |
|--------|------|--------|
| `test_mcp_completion_complete` | `completion/complete` | 返回 completion.values 数组 |
| `test_mcp_completion_unknown_arg` | `completion/complete` (unknown arg) | 返回空 values |

### 3.5 Sampling（1 个测试）

| 测试名 | 方法 | 验证点 |
|--------|------|--------|
| `test_mcp_sampling_create_message` | `sampling/createMessage` | 返回错误（客户端不支持） |

### 3.6 SQL 安全扩展（6 个测试）

| 测试名 | SQL | 验证点 |
|--------|-----|--------|
| `test_mcp_sql_safety_truncate_blocked` | `TRUNCATE TABLE users` | Dangerous keyword 拒绝 |
| `test_mcp_sql_safety_alter_blocked` | `ALTER TABLE users ADD col INT` | Dangerous keyword 拒绝 |
| `test_mcp_sql_safety_create_blocked` | `CREATE TABLE t (id INT)` | Dangerous keyword 拒绝 |
| `test_mcp_sql_safety_update_no_where_blocked` | `UPDATE users SET name='a'` | WHERE 缺失拒绝 |
| `test_mcp_sql_safety_delete_no_where_blocked` | `DELETE FROM users` | WHERE 缺失拒绝 |
| `test_mcp_sql_safety_select_where_allowed` | `SELECT * FROM users WHERE id=1` | 允许（无 DB 错误但非安全拒绝） |

### 3.7 Tools 边界情况（2 个测试）

| 测试名 | 场景 | 验证点 |
|--------|------|--------|
| `test_mcp_tools_call_missing_params` | tools/call 无 params | 返回错误 |
| `test_mcp_tools_call_missing_name` | tools/call 有 params 无 name | 返回错误 |

---

## 4. 不测试的内容

- 数据库实际查询结果（需要 Docker/真实数据库，属于 driver 集成测试范畴）
- HTTP transport（需要启动 HTTP 服务器，单独测试）
- 并发/多会话（超出协议测试范围）
- NotificationBus 内部机制（纯单元测试范畴）

---

## 5. 验证方式

```bash
cd src-tauri && cargo test --test mcp_integration 2>&1
```

预期：所有 27 个测试（6 原有 + 21 新增）通过。
