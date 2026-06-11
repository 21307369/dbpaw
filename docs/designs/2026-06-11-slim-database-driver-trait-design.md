# 精简 DatabaseDriver Trait

## 问题

`DatabaseDriver` trait（`src-tauri/src/db/drivers/traits.rs`）过于臃肿，包含 12 个必需方法 + 9 个带默认实现的可选方法。新增驱动时必须实现所有必需方法，即使很多方法是数据库特有的（routines、events、sequences、types、synonyms、packages、foreign keys）。该 trait 将核心查询/Schema 能力与数据库特有的元数据功能混在一起。

## 目标

将核心 trait 精简为只有所有数据库都必须实现的方法。将可选能力完全移到子 trait 中，消费方通过 downcast 调用。

## 设计

### 核心 Trait：12 个必需方法

```rust
#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    fn capabilities(&self) -> DriverCapabilities;
    fn as_any(&self) -> &dyn Any;
    async fn test_connection(&self) -> DriverResult<()>;
    async fn list_databases(&self) -> DriverResult<Vec<String>>;
    async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>>;
    async fn get_table_structure(&self, schema: String, table: String) -> DriverResult<TableStructure>;
    async fn get_table_metadata(&self, schema: String, table: String) -> DriverResult<TableMetadata>;
    async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String>;
    async fn get_table_data(
        &self,
        schema: String,
        table: String,
        page: i64,
        limit: i64,
        sort_column: Option<String>,
        sort_direction: Option<String>,
        filter: Option<String>,
        order_by: Option<String>,
    ) -> DriverResult<TableDataResponse>;
    async fn execute_query(&self, sql: String) -> DriverResult<QueryResult>;
    async fn get_schema_overview(&self, schema: Option<String>) -> DriverResult<SchemaOverview>;
    async fn close(&self);
}
```

### 从核心 Trait 移除的方法

| 方法 | 处理方式 | 原因 |
|------|---------|------|
| `get_table_data_chunk()` | 完全删除 | 所有 10 个驱动中与 `get_table_data()` 完全相同，导出服务直接调用 `get_table_data()` |
| `execute_query_with_id()` | 移到 `CancellableQueryDriver` 子 trait | 仅 MySQL/ClickHouse 实现，默认实现只是调用 `execute_query()` |
| `list_routines()` | 已在 `RoutineDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `get_routine_ddl()` | 已在 `RoutineDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `list_events()` | 已在 `EventDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `list_sequences()` | 已在 `SequenceDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `list_types()` | 已在 `TypeDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `list_synonyms()` | 已在 `SynonymDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `list_packages()` | 已在 `PackageDriver` 子 trait 中 | 从核心 trait 移除默认实现 |
| `get_schema_foreign_keys()` | 已在 `ForeignKeyDriver` 子 trait 中 | 从核心 trait 移除默认实现 |

### 新增子 Trait

```rust
#[async_trait]
pub trait CancellableQueryDriver: DatabaseDriver {
    async fn execute_query_with_id(
        &self,
        sql: String,
        query_id: Option<&str>,
    ) -> DriverResult<QueryResult>;
}
```

### Downcast 机制

在核心 trait 中添加 `as_any()` 用于安全 downcast：

```rust
pub trait DatabaseDriver: Send + Sync {
    fn as_any(&self) -> &dyn Any;
    // ...
}
```

消费方使用模式：

```rust
// 先检查能力
if driver.capabilities().contains(DriverCapabilities::ROUTINES) {
    // downcast 到子 trait
    let routine_driver = driver.as_any()
        .downcast_ref::<dyn RoutineDriver>()
        .ok_or_else(|| AppError::unsupported("Driver claims ROUTINES but doesn't implement RoutineDriver"))?;
    routine_driver.list_routines(schema).await
} else {
    Err(AppError::unsupported("Routines not supported for this driver"))
}
```

### DriverCapabilities（不变）

```rust
bitflags! {
    pub struct DriverCapabilities: u32 {
        const ROUTINES      = 0b0000_0001;
        const EVENTS        = 0b0000_0010;
        const SEQUENCES     = 0b0000_0100;
        const TYPES         = 0b0000_1000;
        const SYNONYMS      = 0b0001_0000;
        const PACKAGES      = 0b0010_0000;
        const FOREIGN_KEYS  = 0b0100_0000;
        const QUERY_WITH_ID = 0b1000_0000;
    }
}
```

## 实施步骤

### 步骤 1：更新核心 Trait

1. 从 `DatabaseDriver` 移除所有 9 个可选方法的默认实现
2. 在核心 trait 中添加 `fn as_any(&self) -> &dyn Any;`
3. 从核心 trait 移除 `get_table_data_chunk()`
4. 从核心 trait 移除 `execute_query_with_id()`
5. 添加 `CancellableQueryDriver` 子 trait

### 步骤 2：更新所有驱动

对 10 个驱动（sqlite、postgres、mysql、mssql、oracle、clickhouse、duckdb、mongodb、cassandra、db2）逐一处理：

1. 移除 `get_table_data_chunk()` 实现（它只是委托给 `get_table_data`）
2. 移除 `execute_query_with_id()` 实现（如果存在，仅 MySQL/ClickHouse）
3. 添加 `fn as_any(&self) -> &dyn Any { self }` 实现
4. 保持子 trait 实现（RoutineDriver、ForeignKeyDriver 等）不变

### 步骤 3：更新 Commands 层

1. **`metadata.rs`**：更新 `list_routines`、`list_events`、`list_sequences`、`list_types`、`list_synonyms`、`list_packages`、`get_routine_ddl`、`get_schema_foreign_keys` 使用 downcast 模式
2. **`query.rs`**：更新 `execute_query_with_id` 调用，通过 downcast 检查 `CancellableQueryDriver`
3. **`export_service.rs`**：将 `get_table_data_chunk()` 调用替换为 `get_table_data()`
4. **`transfer.rs`**：更新 mock 中的 `get_table_data_chunk` 引用

### 步骤 4：更新 Mock

1. `pool_manager.rs` MockDriver：移除 `get_table_data_chunk()`，添加 `as_any()`
2. `commands/mod.rs` MockDriver：移除 `get_table_data_chunk()`，添加 `as_any()`

### 步骤 5：更新 mod.rs 导出

更新 `src-tauri/src/db/drivers/mod.rs` 导出 `CancellableQueryDriver`。

## 影响总结

| 指标 | 之前 | 之后 |
|------|------|------|
| 核心 trait 总方法数 | 21（12 必需 + 9 可选） | 12（全部必需，+ as_any） |
| 新驱动必须实现的方法数 | 12 必需 + 9 可选 stub | 12（无 stub） |
| 子 trait 数量 | 7 | 8（新增 CancellableQueryDriver） |
| 变更文件数 | - | ~15 |

## 测试

1. `cargo check` — 验证 trait 约束编译通过
2. `cargo test` — 现有单元测试通过
3. 手动测试：连接各数据库类型，验证元数据标签页正常加载
4. 验证导出功能（直接调用 `get_table_data`）
5. 验证 MySQL/ClickHouse 查询取消功能正常
