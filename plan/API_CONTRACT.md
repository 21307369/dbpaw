# nextDB API 接口契约文档

> 本文档定义了前后端开发的接口规范，双方以此为准进行独立开发。
> 任何接口变更需先更新本文档并通知对方。

---

## 目录

1. [通用约定](#通用约定)
2. [连接管理模块](#连接管理模块)
3. [数据库元数据模块](#数据库元数据模块)
4. [查询执行模块](#查询执行模块)
5. [表数据操作模块](#表数据操作模块)
6. [已保存查询模块](#已保存查询模块)
7. [查询历史模块](#查询历史模块)
8. [设置管理模块](#设置管理模块)
9. [AI 功能模块](#ai-功能模块)
10. [错误处理规范](#错误处理规范)
11. [契约版本与迁移](#契约版本与迁移)

---

## 通用约定

### 命名规范

| 场景 | 规范 | 示例 |
|------|------|------|
| Tauri 命令名 | snake_case | `get_connections`, `create_connection` |
| Rust 结构体字段 | snake_case | `db_type`, `created_at` |
| TypeScript 接口字段 | camelCase | `dbType`, `createdAt` |
| 数据库字段 | snake_case | `db_type`, `created_at` |

### 字段转换

Rust 端使用 `#[serde(rename_all = "camelCase")]` 宏自动转换：

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFormData {
    pub db_type: String,  // 自动转为 dbType
}
```

### 调用方式

```typescript
// 前端调用格式
import { invoke } from "@tauri-apps/api/core";

const result = await invoke<ReturnType>("command_name", { param1, param2 });
```

```rust
// 后端定义格式
#[tauri::command]
pub async fn command_name(
    param1: Type1,
    param2: Type2,
    state: State<'_, AppState>,
) -> Result<ReturnType, String> {
    // ...
}
```

### 返回值规范

- 成功：返回数据本身
- 失败：返回 `String` 类型错误消息
- 前端统一用 `try/catch` 捕获错误

---

## 连接管理模块

> 管理用户保存的数据库连接配置

### 类型定义

#### Connection (连接实体)

```typescript
// TypeScript
interface Connection {
  id: number;
  uuid: string;
  name: string;
  dbType: "postgres" | "mysql" | "sqlite" | "redis" | "clickhouse";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  filePath: string | null;      // SQLite 文件路径
  // SSH 隧道配置
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshPassword: string;
  sshKeyPath: string;
  sshUseKey: boolean;
  // 时间戳
  createdAt: string;            // ISO 8601 格式
  updatedAt: string;
}
```

```rust
// Rust
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Connection {
    pub id: i64,
    pub uuid: String,
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: i64,
    pub database: String,
    pub username: String,
    pub password: String,
    pub ssl: i64,               // 0 或 1
    pub file_path: Option<String>,
    pub ssh_enabled: i64,
    pub ssh_host: String,
    pub ssh_port: i64,
    pub ssh_user: String,
    pub ssh_password: String,
    pub ssh_key_path: String,
    pub ssh_use_key: i64,
    pub created_at: String,
    pub updated_at: String,
}
```

#### ConnectionFormData (表单数据)

```typescript
// TypeScript
interface ConnectionFormData {
  name: string;
  dbType: "postgres" | "mysql" | "sqlite" | "redis" | "clickhouse";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  filePath?: string;
  sshEnabled?: boolean;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshPassword?: string;
  sshKeyPath?: string;
  sshUseKey?: boolean;
}
```

```rust
// Rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionFormData {
    pub name: String,
    pub db_type: String,
    pub host: String,
    pub port: i64,
    pub database: String,
    pub username: String,
    pub password: String,
    pub ssl: bool,
    pub file_path: Option<String>,
    pub ssh_enabled: Option<bool>,
    pub ssh_host: Option<String>,
    pub ssh_port: Option<i64>,
    pub ssh_user: Option<String>,
    pub ssh_password: Option<String>,
    pub ssh_key_path: Option<String>,
    pub ssh_use_key: Option<bool>,
}
```

### 命令列表

#### get_connections

获取所有已保存的连接列表

| 属性 | 值 |
|------|-----|
| 命令名 | `get_connections` |
| 参数 | 无 |
| 返回值 | `Connection[]` |

```typescript
// 前端调用
const connections = await invoke<Connection[]>("get_connections");
```

```rust
// 后端签名
#[tauri::command]
pub async fn get_connections(pool: State<'_, SqlitePool>) -> Result<Vec<Connection>, String>
```

---

#### get_connection_by_uuid

根据 UUID 获取单个连接详情

| 属性 | 值 |
|------|-----|
| 命令名 | `get_connection_by_uuid` |
| 参数 | `uuid: string` |
| 返回值 | `Connection` |

```typescript
// 前端调用
const conn = await invoke<Connection>("get_connection_by_uuid", { uuid: "xxx-xxx" });
```

```rust
// 后端签名
#[tauri::command]
pub async fn get_connection_by_uuid(
    pool: State<'_, SqlitePool>,
    uuid: String
) -> Result<Connection, String>
```

---

#### create_connection

创建新的数据库连接配置

| 属性 | 值 |
|------|-----|
| 命令名 | `create_connection` |
| 参数 | `data: ConnectionFormData` |
| 返回值 | `Connection` |

```typescript
// 前端调用
const newConn = await invoke<Connection>("create_connection", {
  data: {
    name: "My Database",
    dbType: "postgres",
    host: "localhost",
    port: 5432,
    database: "mydb",
    username: "user",
    password: "pass",
    ssl: false,
  }
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn create_connection(
    pool: State<'_, SqlitePool>,
    data: ConnectionFormData
) -> Result<Connection, String>
```

---

#### update_connection

更新已有的连接配置

| 属性 | 值 |
|------|-----|
| 命令名 | `update_connection` |
| 参数 | `id: number`, `data: ConnectionFormData` |
| 返回值 | `Connection` |

```typescript
// 前端调用
const updated = await invoke<Connection>("update_connection", {
  id: 1,
  data: { /* ... */ }
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn update_connection(
    pool: State<'_, SqlitePool>,
    id: i64,
    data: ConnectionFormData
) -> Result<Connection, String>
```

---

#### delete_connection

删除连接配置

| 属性 | 值 |
|------|-----|
| 命令名 | `delete_connection` |
| 参数 | `id: number` |
| 返回值 | `boolean` |

```typescript
// 前端调用
const success = await invoke<boolean>("delete_connection", { id: 1 });
```

```rust
// 后端签名
#[tauri::command]
pub async fn delete_connection(
    pool: State<'_, SqlitePool>,
    id: i64
) -> Result<bool, String>
```

---

#### test_connection

测试连接是否可用（不保存）

| 属性 | 值 |
|------|-----|
| 命令名 | `test_connection` |
| 参数 | `data: ConnectionFormData` |
| 返回值 | `TestConnectionResult` |

```typescript
// 类型定义
interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;  // 连接延迟（毫秒）
}

// 前端调用
const result = await invoke<TestConnectionResult>("test_connection", {
  data: { /* ... */ }
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn test_connection(data: ConnectionFormData) -> Result<TestConnectionResult, String>
```

---

## 数据库元数据模块

> 获取数据库的表、列、索引等结构信息

### 类型定义

```typescript
// 表信息
interface TableInfo {
  schema: string;           // 模式名 (如 public)
  name: string;             // 表名
  type: "table" | "view";   // 类型
}

// 列信息
interface ColumnInfo {
  name: string;
  type: string;             // 数据类型 (如 VARCHAR(255))
  nullable: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
  comment?: string;
}

// 索引信息
interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
  primary: boolean;
}

// 外键信息
interface ForeignKeyInfo {
  name: string;
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

// 表结构（完整）
interface TableStructure {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];
}
```

### 命令列表

#### list_tables

获取数据库中的所有表和视图

| 属性 | 值 |
|------|-----|
| 命令名 | `list_tables` |
| 参数 | `uuid: string` |
| 返回值 | `TableInfo[]` |

```typescript
// 前端调用
const tables = await invoke<TableInfo[]>("list_tables", { uuid: "xxx" });
```

```rust
// 后端签名
#[tauri::command]
pub async fn list_tables(
    pool_manager: State<'_, PoolManager>,
    uuid: String
) -> Result<Vec<TableInfo>, String>
```

---

#### get_table_structure

获取表的详细结构（列、索引、外键）

| 属性 | 值 |
|------|-----|
| 命令名 | `get_table_structure` |
| 参数 | `uuid: string`, `schema: string`, `table: string` |
| 返回值 | `TableStructure` |

```typescript
// 前端调用
const structure = await invoke<TableStructure>("get_table_structure", {
  uuid: "xxx",
  schema: "public",
  table: "users"
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn get_table_structure(
    pool_manager: State<'_, PoolManager>,
    uuid: String,
    schema: String,
    table: String
) -> Result<TableStructure, String>
```

---

#### get_table_ddl

获取表的 DDL 创建语句

| 属性 | 值 |
|------|-----|
| 命令名 | `get_table_ddl` |
| 参数 | `uuid: string`, `schema: string`, `table: string` |
| 返回值 | `string` |

```typescript
// 前端调用
const ddl = await invoke<string>("get_table_ddl", {
  uuid: "xxx",
  schema: "public",
  table: "users"
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn get_table_ddl(
    pool_manager: State<'_, PoolManager>,
    uuid: String,
    schema: String,
    table: String
) -> Result<String, String>
```

---

## 查询执行模块

> 执行 SQL 语句并返回结果

### 类型定义

```typescript
// 查询结果
interface QueryResult {
  // 结果数据 (SELECT 查询)
  data: Record<string, unknown>[];
  // 影响行数 (INSERT/UPDATE/DELETE)
  rowCount: number;
  // 列信息
  columns: QueryColumn[];
  // 执行耗时（毫秒）
  timeTakenMs: number;
  // 是否成功
  success: boolean;
  // 错误信息
  error?: string;
}

interface QueryColumn {
  name: string;
  type: string;
}
```

### 命令列表

#### execute_query

执行 SQL 查询

| 属性 | 值 |
|------|-----|
| 命令名 | `execute_query` |
| 参数 | `uuid: string`, `query: string` |
| 返回值 | `QueryResult` |

```typescript
// 前端调用
const result = await invoke<QueryResult>("execute_query", {
  uuid: "xxx",
  query: "SELECT * FROM users WHERE id = 1"
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn execute_query(
    pool_manager: State<'_, PoolManager>,
    uuid: String,
    query: String
) -> Result<QueryResult, String>
```

---

## 表数据操作模块

> 分页查询、增删改表数据

### 类型定义

```typescript
// 分页响应
interface TableDataResponse {
  data: Record<string, unknown>[];
  total: number;        // 总记录数
  page: number;         // 当前页码
  limit: number;        // 每页条数
}

// 排序方向
type SortDirection = "asc" | "desc";
```

### 命令列表

#### get_table_data

分页获取表数据

| 属性 | 值 |
|------|-----|
| 命令名 | `get_table_data` |
| 参数 | 见下表 |
| 返回值 | `TableDataResponse` |

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| uuid | string | ✓ | 连接 UUID |
| schema | string | ✓ | 模式名 |
| table | string | ✓ | 表名 |
| page | number | ✓ | 页码 (从 1 开始) |
| limit | number | ✓ | 每页条数 |
| filter | string | ✗ | WHERE 条件 |
| sortColumn | string | ✗ | 排序列 |
| sortDirection | "asc" \| "desc" | ✗ | 排序方向 |

```typescript
// 前端调用
const data = await invoke<TableDataResponse>("get_table_data", {
  uuid: "xxx",
  schema: "public",
  table: "users",
  page: 1,
  limit: 50,
  filter: "status = 'active'",
  sortColumn: "created_at",
  sortDirection: "desc"
});
```

```rust
// 后端签名
#[tauri::command]
pub async fn get_table_data(
    pool_manager: State<'_, PoolManager>,
    uuid: String,
    schema: String,
    table: String,
    page: i64,
    limit: i64,
    filter: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
) -> Result<TableDataResponse, String>
```

---

#### insert_table_row

插入新行

| 属性 | 值 |
|------|-----|
| 命令名 | `insert_table_row` |
| 参数 | `uuid`, `schema`, `table`, `values` |
| 返回值 | `QueryResult` |

```typescript
// 类型定义
interface ColumnValue {
  column: string;
  value: unknown;
  isRawSql: boolean;  // 是否是 SQL 函数 (如 NOW())
}

// 前端调用
const result = await invoke<QueryResult>("insert_table_row", {
  uuid: "xxx",
  schema: "public",
  table: "users",
  values: [
    { column: "name", value: "John", isRawSql: false },
    { column: "created_at", value: "NOW()", isRawSql: true }
  ]
});
```

---

#### update_table_row

更新表行

| 属性 | 值 |
|------|-----|
| 命令名 | `update_table_row` |
| 参数 | `uuid`, `schema`, `table`, `primaryKeyColumns`, `primaryKeyValues`, `updates` |
| 返回值 | `QueryResult` |

```typescript
// 前端调用
const result = await invoke<QueryResult>("update_table_row", {
  uuid: "xxx",
  schema: "public",
  table: "users",
  primaryKeyColumns: ["id"],
  primaryKeyValues: [1],
  updates: [
    { column: "name", value: "Jane", isRawSql: false },
    { column: "updated_at", value: "NOW()", isRawSql: true }
  ]
});
```

---

#### delete_table_row

删除表行

| 属性 | 值 |
|------|-----|
| 命令名 | `delete_table_row` |
| 参数 | `uuid`, `schema`, `table`, `primaryKeyColumns`, `primaryKeyValues` |
| 返回值 | `QueryResult` |

```typescript
// 前端调用
const result = await invoke<QueryResult>("delete_table_row", {
  uuid: "xxx",
  schema: "public",
  table: "users",
  primaryKeyColumns: ["id"],
  primaryKeyValues: [1]
});
```

---

## 已保存查询模块

> 管理用户收藏的 SQL 查询片段

### 类型定义

```typescript
interface SavedQuery {
  id: number;
  connectionUuid: string;
  name: string;
  query: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedQueryFormData {
  name: string;
  query: string;
  description?: string;
}
```

### 命令列表

#### get_saved_queries

获取某连接下的所有已保存查询

| 属性 | 值 |
|------|-----|
| 命令名 | `get_saved_queries` |
| 参数 | `connectionUuid: string` |
| 返回值 | `SavedQuery[]` |

```typescript
const queries = await invoke<SavedQuery[]>("get_saved_queries", {
  connectionUuid: "xxx"
});
```

---

#### create_saved_query

保存新查询

| 属性 | 值 |
|------|-----|
| 命令名 | `create_saved_query` |
| 参数 | `connectionUuid: string`, `data: SavedQueryFormData` |
| 返回值 | `SavedQuery` |

```typescript
const saved = await invoke<SavedQuery>("create_saved_query", {
  connectionUuid: "xxx",
  data: {
    name: "Get Active Users",
    query: "SELECT * FROM users WHERE status = 'active'",
    description: "获取所有活跃用户"
  }
});
```

---

#### update_saved_query

更新已保存查询

| 属性 | 值 |
|------|-----|
| 命令名 | `update_saved_query` |
| 参数 | `id: number`, `data: SavedQueryFormData` |
| 返回值 | `SavedQuery` |

---

#### delete_saved_query

删除已保存查询

| 属性 | 值 |
|------|-----|
| 命令名 | `delete_saved_query` |
| 参数 | `id: number` |
| 返回值 | `boolean` |

---

## 查询历史模块

> 自动记录执行过的 SQL 查询

### 类型定义

```typescript
interface QueryHistory {
  id: number;
  connectionUuid: string;
  query: string;
  success: boolean;
  rowCount: number;
  timeTakenMs: number;
  error?: string;
  executedAt: string;
}
```

### 命令列表

#### get_query_history

获取查询历史记录

| 属性 | 值 |
|------|-----|
| 命令名 | `get_query_history` |
| 参数 | `connectionUuid: string`, `limit?: number` |
| 返回值 | `QueryHistory[]` |

```typescript
const history = await invoke<QueryHistory[]>("get_query_history", {
  connectionUuid: "xxx",
  limit: 100
});
```

---

#### clear_query_history

清空查询历史

| 属性 | 值 |
|------|-----|
| 命令名 | `clear_query_history` |
| 参数 | `connectionUuid: string` |
| 返回值 | `boolean` |

---

## 设置管理模块

> 管理应用配置项

### 类型定义

```typescript
// 预定义的设置键
type SettingKey =
  | "theme"              // 主题: "light" | "dark" | "system"
  | "fontSize"           // 编辑器字号
  | "autoSave"           // 自动保存
  | "aiProvider"         // AI 提供商
  | "aiApiKey"           // AI API Key
  | "aiModel"            // AI 模型名称
  | "aiBaseUrl";         // AI API 基础 URL
```

### 命令列表

#### get_setting

获取单个设置项

| 属性 | 值 |
|------|-----|
| 命令名 | `get_setting` |
| 参数 | `key: string` |
| 返回值 | `string \| null` |

```typescript
const theme = await invoke<string | null>("get_setting", { key: "theme" });
```

---

#### set_setting

设置配置项

| 属性 | 值 |
|------|-----|
| 命令名 | `set_setting` |
| 参数 | `key: string`, `value: string` |
| 返回值 | `void` |

```typescript
await invoke("set_setting", { key: "theme", value: "dark" });
```

---

#### get_all_settings

获取所有设置项

| 属性 | 值 |
|------|-----|
| 命令名 | `get_all_settings` |
| 参数 | 无 |
| 返回值 | `Record<string, string>` |

```typescript
const settings = await invoke<Record<string, string>>("get_all_settings");
```

---

## AI 功能模块

> 集成大语言模型的智能功能

### 类型定义

```typescript
// AI 生成 SQL 请求
interface GenerateSqlRequest {
  instruction: string;      // 用户的自然语言描述
  schemaContext?: string;   // 表结构 DDL 上下文
  dialect?: string;         // 数据库方言 (postgres/mysql/sqlite)
}

// AI 生成 SQL 响应
interface GenerateSqlResponse {
  sql: string;
  explanation?: string;     // SQL 解释
}
```

### 命令列表

#### generate_sql

自然语言转 SQL

| 属性 | 值 |
|------|-----|
| 命令名 | `generate_sql` |
| 参数 | `instruction: string`, `schemaContext?: string`, `dialect?: string` |
| 返回值 | `GenerateSqlResponse` |

```typescript
const result = await invoke<GenerateSqlResponse>("generate_sql", {
  instruction: "查询最近7天注册的用户数量",
  schemaContext: "CREATE TABLE users (id INT, name VARCHAR, created_at TIMESTAMP)",
  dialect: "postgres"
});
// result.sql = "SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"
```

---

#### explain_sql

解释 SQL 语句

| 属性 | 值 |
|------|-----|
| 命令名 | `explain_sql` |
| 参数 | `sql: string` |
| 返回值 | `string` |

```typescript
const explanation = await invoke<string>("explain_sql", {
  sql: "SELECT * FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 10"
});
```

---

#### optimize_sql

优化 SQL 语句

| 属性 | 值 |
|------|-----|
| 命令名 | `optimize_sql` |
| 参数 | `sql: string`, `schemaContext?: string` |
| 返回值 | `GenerateSqlResponse` |

---

## 错误处理规范

### 错误返回格式

后端统一返回 `Result<T, String>`，错误信息格式：

```
[ErrorCode] 错误描述
```

### 错误码列表

| 错误码 | 说明 | 示例 |
|--------|------|------|
| `CONN_FAILED` | 数据库连接失败 | `[CONN_FAILED] 无法连接到数据库: Connection refused` |
| `CONN_NOT_FOUND` | 连接不存在 | `[CONN_NOT_FOUND] 未找到 UUID 为 xxx 的连接` |
| `QUERY_ERROR` | SQL 执行错误 | `[QUERY_ERROR] syntax error at or near "SELEC"` |
| `AUTH_FAILED` | 认证失败 | `[AUTH_FAILED] 用户名或密码错误` |
| `PERMISSION_DENIED` | 权限不足 | `[PERMISSION_DENIED] 无权访问表 users` |
| `TIMEOUT` | 操作超时 | `[TIMEOUT] 查询执行超过 30 秒` |
| `VALIDATION_ERROR` | 参数校验失败 | `[VALIDATION_ERROR] 表名不能为空` |
| `AI_ERROR` | AI 服务错误 | `[AI_ERROR] API 调用失败: Rate limit exceeded` |

### 前端错误处理示例

```typescript
import { toast } from "sonner";

async function executeQuery(uuid: string, sql: string) {
  try {
    const result = await api.query.execute(uuid, sql);
    return result;
  } catch (error) {
    const message = error as string;
    
    // 根据错误码显示不同 toast
    if (message.includes("[CONN_FAILED]")) {
      toast.error("连接失败", { description: message });
    } else if (message.includes("[QUERY_ERROR]")) {
      toast.error("SQL 错误", { description: message });
    } else {
      toast.error("操作失败", { description: message });
    }
    
    throw error;
  }
}
```

---

## 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| v1.0.0 | 2026-01-26 | 初始版本 |

---

## 附录：前端 API 封装模板

```typescript
// src/lib/api.ts
import { invoke } from "@tauri-apps/api/core";
import type {
  Connection,
  ConnectionFormData,
  TestConnectionResult,
  TableInfo,
  TableStructure,
  QueryResult,
  TableDataResponse,
  SavedQuery,
  SavedQueryFormData,
  QueryHistory,
  GenerateSqlResponse,
} from "@/types";

export const api = {
  // 连接管理
  connections: {
    list: () => invoke<Connection[]>("get_connections"),
    getByUuid: (uuid: string) => invoke<Connection>("get_connection_by_uuid", { uuid }),
    create: (data: ConnectionFormData) => invoke<Connection>("create_connection", { data }),
    update: (id: number, data: ConnectionFormData) => invoke<Connection>("update_connection", { id, data }),
    delete: (id: number) => invoke<boolean>("delete_connection", { id }),
    test: (data: ConnectionFormData) => invoke<TestConnectionResult>("test_connection", { data }),
  },

  // 元数据
  metadata: {
    listTables: (uuid: string) => invoke<TableInfo[]>("list_tables", { uuid }),
    getTableStructure: (uuid: string, schema: string, table: string) =>
      invoke<TableStructure>("get_table_structure", { uuid, schema, table }),
    getTableDdl: (uuid: string, schema: string, table: string) =>
      invoke<string>("get_table_ddl", { uuid, schema, table }),
  },

  // 查询执行
  query: {
    execute: (uuid: string, query: string) => invoke<QueryResult>("execute_query", { uuid, query }),
  },

  // 表数据操作
  tableData: {
    get: (params: {
      uuid: string;
      schema: string;
      table: string;
      page: number;
      limit: number;
      filter?: string;
      sortColumn?: string;
      sortDirection?: "asc" | "desc";
    }) => invoke<TableDataResponse>("get_table_data", params),
    insert: (uuid: string, schema: string, table: string, values: Array<{ column: string; value: unknown; isRawSql: boolean }>) =>
      invoke<QueryResult>("insert_table_row", { uuid, schema, table, values }),
    update: (uuid: string, schema: string, table: string, primaryKeyColumns: string[], primaryKeyValues: unknown[], updates: Array<{ column: string; value: unknown; isRawSql: boolean }>) =>
      invoke<QueryResult>("update_table_row", { uuid, schema, table, primaryKeyColumns, primaryKeyValues, updates }),
    delete: (uuid: string, schema: string, table: string, primaryKeyColumns: string[], primaryKeyValues: unknown[]) =>
      invoke<QueryResult>("delete_table_row", { uuid, schema, table, primaryKeyColumns, primaryKeyValues }),
  },

  // 已保存查询
  savedQueries: {
    list: (connectionUuid: string) => invoke<SavedQuery[]>("get_saved_queries", { connectionUuid }),
    create: (connectionUuid: string, data: SavedQueryFormData) => invoke<SavedQuery>("create_saved_query", { connectionUuid, data }),
    update: (id: number, data: SavedQueryFormData) => invoke<SavedQuery>("update_saved_query", { id, data }),
    delete: (id: number) => invoke<boolean>("delete_saved_query", { id }),
  },

  // 查询历史
  history: {
    list: (connectionUuid: string, limit?: number) => invoke<QueryHistory[]>("get_query_history", { connectionUuid, limit }),
    clear: (connectionUuid: string) => invoke<boolean>("clear_query_history", { connectionUuid }),
  },

  // 设置
  settings: {
    get: (key: string) => invoke<string | null>("get_setting", { key }),
    set: (key: string, value: string) => invoke<void>("set_setting", { key, value }),
    getAll: () => invoke<Record<string, string>>("get_all_settings"),
  },

  // AI 功能
  ai: {
    generateSql: (instruction: string, schemaContext?: string, dialect?: string) =>
      invoke<GenerateSqlResponse>("generate_sql", { instruction, schemaContext, dialect }),
    explainSql: (sql: string) => invoke<string>("explain_sql", { sql }),
    optimizeSql: (sql: string, schemaContext?: string) =>
      invoke<GenerateSqlResponse>("optimize_sql", { sql, schemaContext }),
  },
};
```

---

## 契约版本与迁移

为配合从前端 mock 迁移到后端真实数据，契约引入增量更新，保持向后兼容：

### v1.1 增量改动
- 命令分组（文档层概念，不影响 Tauri 实际命令名）：
  - connections: `get_connections`, `create_connection`, `update_connection`, `delete_connection`, `get_connection_by_uuid`, `test_connection`
  - metadata: `list_tables`, `get_table_structure`, `get_table_ddl`
  - query: `execute_query`（后续扩展 `cancel_query`）
  - tableData: `get_table_data`, `insert_table_row`, `update_table_row`, `delete_table_row`
  - savedQueries: `get_saved_queries`, `create_saved_query`, `update_saved_query`, `delete_saved_query`
  - settings: `get_setting`, `set_setting`, `get_all_settings`
  - ai: `generate_sql`, `explain_sql`, `optimize_sql`
- 事件流（长查询与进度反馈，新增约定）：
  - 事件名：`query.progress`, `query.chunk`, `query.done`, `query.error`
  - 事件载荷：
    ```typescript
    interface QueryProgressEvt { queryId: string; phase: 'prepare'|'running'|'fetching'; percent?: number }
    interface QueryChunkEvt { queryId: string; rows: any[] }
    interface QueryDoneEvt { queryId: string; totalRows: number; executionMs: number }
    ```
  - 前端监听：`import { listen } from '@tauri-apps/api/event'`
- 分页/过滤/排序统一（对 `get_table_data` 的增强）：
  ```typescript
  interface Pagination { page: number; limit: number }
  interface Sorter { column: string; order: 'asc' | 'desc' }
  interface Filter { column: string; op: '='|'!='|'>'|'>='|'<'|'<='|'like'|'in'|'is_null'; value?: any }
  ```
  - 兼容：仍支持 `filter: string` 传入；推荐使用结构化 `Filter[]`（将通过新增 `filters?: Filter[]` 参数接入）
- 错误结构化（规划）：
  - 目标：迁移到 `Result<T, AppError>`，便于前端根据 `code` 精准处理
  - 结构：
    ```rust
    #[derive(Serialize, Deserialize)]
    pub struct AppError { pub code: String, pub message: String, pub details: Option<serde_json::Value> }
    ```
  - 迁移策略：短期继续返回 `[ERROR_CODE] message` 字符串；新增命令逐步采用结构化错误

### 前端替换指引
- `sql-editor`：用 `execute_query` 替换 `mockResults`/`mockColumns`；需要在 UI 处理 `columns` 映射与耗时展示
- `database-sidebar`：用 `get_connections` + `list_tables` 构建树；点击节点时调用 `get_table_structure`
- `table-view`：用 `get_table_data` 替换本地 mock，传入分页与排序参数；对编辑操作映射 `insert/update/delete` 命令
- 错误处理：保留对 `[ERROR_CODE]` 的解析，同时预留结构化错误处理分支

### 安全与持久化注意
- 前端不缓存明文密码；后端以加密方式存储（sqlx-sqlite）
- 所有 SQL 必须参数化，严禁字符串拼接
- 连接池按连接 UUID 复用，空闲释放
