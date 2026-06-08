# Cassandra 驱动实现计划

## 概述

本文档描述为 DbPaw 添加 Apache Cassandra 数据库支持的完整实现计划。使用 Rust `scylla` crate 作为驱动，同时兼容 ScyllaDB。

## 技术选型

- **Rust 驱动**: `scylla` v1.6.0（同时支持 Cassandra 和 ScyllaDB）
- **协议**: CQL Binary Protocol v4
- **默认端口**: 9042
- **数据库类型**: Wide-column store（kind: "widecolumn"）

## 实现阶段

### 阶段 1: 后端基础驱动

#### 1.1 添加依赖

**文件**: `src-tauri/Cargo.toml`

```toml
scylla = { version = "1.6", features = ["chrono", "uuid"] }
```

#### 1.2 创建驱动模块

**文件**: `src-tauri/src/db/drivers/cassandra.rs`

实现 `DatabaseDriver` trait 的所有方法：

```rust
pub struct CassandraDriver {
    session: scylla::client::session::Session,
    ssh_tunnel: Option<SshTunnel>,
    default_keyspace: String,
}
```

**核心方法实现**:

| 方法 | 实现要点 |
|------|----------|
| `connect` | 解析 host:port，支持多节点（seed_nodes），建立 session |
| `test_connection` | 执行 `SELECT now()` 验证连接 |
| `list_databases` | 查询 `system_schema.keyspaces` |
| `list_tables` | 查询 `system_schema.tables` WHERE keyspace = ? |
| `get_table_structure` | 查询 `system_schema.columns` 获取列信息 |
| `get_table_metadata` | 查询 `system_schema.columns` + `system_schema.indexes` |
| `get_table_ddl` | 从 `system_schema.tables` 拼接 CREATE TABLE 语句 |
| `get_table_data` | 使用 `SELECT * FROM table LIMIT ?` 分页 |
| `get_table_data_chunk` | 同 get_table_data |
| `execute_query` | 执行 CQL，返回 JSON 结果 |
| `get_schema_overview` | 查询 keyspace 下所有表的列信息 |
| `close` | 关闭 session |

**数据类型映射**:

| CQL 类型 | JSON 类型 | 显示类型 |
|----------|-----------|----------|
| text, varchar, ascii | string | text |
| int | number | int |
| bigint, varint | number | bigint |
| float, double | number | double |
| boolean | boolean | boolean |
| uuid, timeuuid | string | uuid |
| timestamp | string (ISO 8601) | timestamp |
| date | string (YYYY-MM-DD) | date |
| time | string (HH:MM:SS) | time |
| blob | string (base64) | blob |
| list, set | array | list/set |
| map | object | map |
| tuple | array | tuple |
| udt | object | udt |

#### 1.3 注册驱动

**文件**: `src-tauri/src/db/drivers/mod.rs`

```rust
// 顶部添加
pub mod cassandra;

// use 语句添加
use self::cassandra::CassandraDriver;

// connect() 函数添加 match arm
"cassandra" => {
    let driver = CassandraDriver::connect(form).await?;
    Ok(Box::new(driver) as Box<dyn DatabaseDriver>)
}
```

### 阶段 2: 连接表单支持

#### 2.1 更新 ConnectionForm

**文件**: `src-tauri/src/models/mod.rs`

ConnectionForm 已有 `seed_nodes` 字段，可用于 Cassandra 多节点连接。无需修改。

#### 2.2 连接参数处理

**连接参数**:

| 参数 | 说明 | 默认值 |
|------|------|--------|
| host | 主机地址 | 必填 |
| port | 端口 | 9042 |
| username | 用户名 | 可选 |
| password | 密码 | 可选 |
| database | 默认 keyspace | 可选 |
| ssl | 启用 TLS | false |
| seed_nodes | 额外种子节点 | 可选 |
| connect_timeout_ms | 连接超时 | 5000 |

### 阶段 3: 前端集成

#### 3.1 注册驱动配置

**文件**: `src/lib/driver-registry.tsx`

```typescript
{
  id: "cassandra",
  label: "Cassandra",
  kind: "widecolumn",  // 新增类型
  defaultPort: 9042,
  isFileBased: false,
  isMysqlFamily: false,
  supportsSSLCA: false,
  supportsSchemaBrowsing: false,
  supportsCreateDatabase: true,
  supportsRoutines: false,
  importCapability: "unsupported",
  icon: () => renderLocalIcon("/icons/db/cassandra.svg"),
  treeConfig: createSqlTreeConfig(),  // 复用 SQL 树配置
}
```

#### 3.2 更新 Driver 类型

**文件**: `src/lib/driver-registry.tsx`

```typescript
const DRIVER_IDS = [
  // ... 现有驱动
  "cassandra",
] as const;
```

更新 `DriverKind`:

```typescript
export type DriverKind = "sql" | "kv" | "document" | "search" | "widecolumn";
```

#### 3.3 添加图标

**文件**: `public/icons/db/cassandra.svg`

添加 Cassandra 官方 SVG 图标。

#### 3.4 国际化

**文件**: `src/lib/i18n/locales/en.ts`, `zh.ts`

```typescript
cassandra: {
  title: "Cassandra",
  description: "Apache Cassandra / ScyllaDB",
  keyspace: "Keyspace",
  partitionKey: "Partition Key",
  clusteringKey: "Clustering Key",
},
```

### 阶段 4: 特殊处理

#### 4.1 查询执行

Cassandra 使用 CQL，不是 SQL。需要特殊处理：

1. **不支持多语句**: CQL 不支持分号分隔的多语句
2. **分页**: 使用 token-based pagination 或 LIMIT/OFFSET
3. **ALLOW FILTERING**: 全表扫描需要添加此关键字

**建议**: 在 `execute_query` 中：
- 检测是否为 SELECT 语句
- 如果无 WHERE 子句，自动添加 `ALLOW FILTERING`
- 限制返回行数（默认 1000）

#### 4.2 DDL 生成

Cassandra 的 CREATE TABLE 语法：

```sql
CREATE TABLE keyspace.table_name (
    id uuid PRIMARY KEY,
    name text,
    created_at timestamp
) WITH CLUSTERING ORDER BY (name ASC)
  AND bloom_filter_fp_chance = 0.01
  AND compaction = {'class': 'SizeTieredCompactionStrategy'};
```

需要从 `system_schema.tables` 读取：
- `partition_key` - 分区键
- `clustering_columns` - 聚类列
- `bloom_filter_fp_chance`
- `compaction`
- `compression`
- `gc_grace_seconds`
- 等其他属性

#### 4.3 元数据增强

**额外元数据信息**:

```rust
pub struct CassandraTableExtra {
    pub partition_key: Vec<String>,
    pub clustering_columns: Vec<String>,
    pub compaction_strategy: String,
    pub bloom_filter_fp_chance: f64,
    pub caching: serde_json::Value,
    pub gc_grace_seconds: i64,
    pub default_time_to_live: i64,
}
```

需要在 `src-tauri/src/models/mod.rs` 中添加此结构体，并扩展 `TableMetadata`。

### 阶段 5: 测试

#### 5.1 单元测试

**文件**: `src-tauri/src/db/drivers/cassandra.rs`

- 测试 CQL 类型映射
- 测试连接参数解析
- 测试 DDL 生成

#### 5.2 集成测试

**文件**: `src-tauri/tests/cassandra_integration.rs`

需要 Docker 容器：

```yaml
# docker-compose.test.yml
cassandra:
  image: cassandra:4.1
  ports:
    - "9042:9042"
  environment:
    CASSANDRA_CLUSTER_NAME: test_cluster
```

测试用例：
- 连接测试
- 列出 keyspaces
- 列出 tables
- 获取表结构
- 执行 SELECT 查询
- 执行 INSERT/UPDATE/DELETE

#### 5.3 更新测试脚本

**文件**: `scripts/test-integration.sh`

添加 Cassandra 测试支持。

## 工作量估算

| 阶段 | 工作项 | 预计时间 |
|------|--------|----------|
| 1 | 后端基础驱动 | 3-4 天 |
| 2 | 连接表单 | 0.5 天 |
| 3 | 前端集成 | 1 天 |
| 4 | 特殊处理 | 1-2 天 |
| 5 | 测试 | 1-2 天 |
| **总计** | | **7-10 天** |

## 风险与注意事项

### 1. CQL 与 SQL 差异

- 不支持 JOIN
- 不支持子查询
- 不支持 GROUP BY（部分版本支持）
- 必须使用分区键查询以获得最佳性能
- 全表扫描需要 `ALLOW FILTERING`（生产环境不推荐）

### 2. 驱动依赖

`scylla` crate 依赖：
- tokio（已存在于项目中）
- chrono（已存在）
- uuid（已存在）

可能需要处理：
- OpenSSL 依赖（可选特性）
- 平台兼容性

### 3. SSH 隧道

Cassandra 使用原生协议（非 HTTP），SSH 隧道需要支持 TCP 转发。现有 `ssh.rs` 已支持。

### 4. 连接池

`scylla` 驱动内置连接池管理，无需使用项目现有的 `bb8` 池。

## 参考实现

- MongoDB 驱动: `src-tauri/src/db/drivers/mongodb.rs`（非 SQL 数据库参考）
- ClickHouse 驱动: `src-tauri/src/db/drivers/clickhouse.rs`（列式数据库参考）

## 后续扩展

完成基础实现后，可考虑：

1. **批量操作**: 支持 BATCH 语句
2. **预编译语句**: 使用 PreparedStatement 提升性能
3. **物化视图**: 显示和管理 Materialized Views
4. **索引管理**: 显示和创建二级索引
5. **性能监控**: 集成 nodetool 指标
