# 侧边栏导航重构文档

## 架构概览

本次重构将侧边栏从硬编码的 "Tables → Procedures → Functions" 结构改为基于 `databaseGroups` 的动态分组系统。每个数据库类型可以定义自己的分类列表。

### 核心数据流

```
driver-registry.tsx          定义每个驱动使用哪个 tree adapter
        ↓
sql-adapter.tsx              定义每个数据库的 groups（Tables/Views/Functions/...）
        ↓
types.tsx                    DatabaseGroupConfig 接口定义
        ↓
ConnectionList.tsx           遍历 groups 渲染树节点
        ↓
api.ts → Tauri commands      调用后端 API 获取数据
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `src/lib/tree-adapters/types.tsx` | 定义 `DatabaseGroupConfig` 接口和 `TreeConfig` |
| `src/lib/tree-adapters/sql-adapter.tsx` | 定义每个数据库的 groups 数组 |
| `src/lib/driver-registry.tsx` | 将驱动映射到对应的 tree config |
| `src/components/business/Sidebar/ConnectionList.tsx` | 渲染侧边栏树，遍历 groups |
| `src/services/api.ts` | 前端 API 类型和方法 |
| `src-tauri/src/db/drivers/mod.rs` | `DatabaseDriver` trait 定义 |
| `src-tauri/src/models/mod.rs` | 数据模型（EventInfo, SequenceInfo, TypeInfo, SynonymInfo, PackageInfo） |

### DatabaseGroupConfig 接口

```typescript
interface DatabaseGroupConfig {
  id: string;                    // 唯一标识，如 "tables", "views", "events"
  label: string;                 // i18n key，如 "connection.tree.views"
  icon: ReactNode;               // 文件夹图标
  leafIcon: ReactNode;           // 叶子节点图标
  source: "tables" | "routines" | "events" | "sequences" | "types" | "synonyms" | "packages";
  sourceFilter?: string;         // 过滤值，如 "view", "procedure", "VIEW", "MaterializedView"
  contextMenuItems?: (ctx) => TreeMenuItem[];
  onLeafActivate?: (ctx) => void;
}
```

### source 和 sourceFilter 的关系

| source | 数据来源 | sourceFilter | 说明 |
|--------|----------|--------------|------|
| `"tables"` | `listTables()` | 无 | 返回所有表（type="table"） |
| `"tables"` | `listTables()` | `"view"` | MySQL 视图（type="view"） |
| `"tables"` | `listTables()` | `"VIEW"` | PostgreSQL 视图（type="VIEW"） |
| `"tables"` | `listTables()` | `"View"` | ClickHouse 视图（engine="View"） |
| `"tables"` | `listTables()` | `"MaterializedView"` | ClickHouse 物化视图（engine="MaterializedView"） |
| `"routines"` | `listRoutines()` | `"function"` | 函数 |
| `"routines"` | `listRoutines()` | `"procedure"` | 存储过程 |
| `"events"` | `listEvents()` | 无 | MySQL 事件 |
| `"sequences"` | `listSequences()` | 无 | 序列（PostgreSQL/Oracle/Db2） |
| `"types"` | `listTypes()` | 无 | 自定义类型（PostgreSQL/Oracle） |
| `"synonyms"` | `listSynonyms()` | 无 | 同义词（MSSQL） |
| `"packages"` | `listPackages()` | 无 | 包（Oracle） |

---

## 当前各数据库状态

### 已完成（本次改动）

| 数据库 | 侧边栏结构 | 需要后端 API | 状态 |
|--------|------------|--------------|------|
| **MySQL** | Tables → Views → Functions → Procedures → Events | `list_events` | ✅ 完成 |
| **PostgreSQL** | Tables → Views → Functions → Procedures → Sequences → Types | `list_sequences`, `list_types` | ✅ 完成 |
| **SQLite** | Tables → Views | 无（前端过滤） | ✅ 完成 |
| **DuckDB** | Tables → Views | 无（前端过滤） | ✅ 完成 |

### 已完成（使用 defaultSqlGroups）

| 数据库 | 侧边栏结构 | 状态 |
|--------|------------|------|
| **MariaDB** | Tables → Views → Functions → Procedures → Events | ✅ 完成 |
| **TiDB** | Tables → Views → Functions → Procedures | ✅ 完成 |
| **StarRocks** | Tables → Views → Functions → Procedures | ✅ 完成 |
| **Doris** | Tables → Views → Functions → Procedures | ✅ 完成 |
| **MSSQL** | Tables → Views → Functions → Procedures → Synonyms | ✅ 完成 |
| **Oracle** | Tables → Views → Functions → Procedures → Packages → Sequences → Types | ✅ 完成 |
| **ClickHouse** | Tables → Views → Materialized Views | ✅ 完成 |
| **IBM Db2** | Tables → Views → Functions → Procedures → Sequences | ✅ 完成 |

### 非 SQL 数据库（不需要改动）

| 数据库 | 当前结构 | 说明 |
|--------|----------|------|
| **Redis** | db0 → keys | 已有自己的结构 |
| **MongoDB** | database → collections | 已有自己的结构 |
| **Elasticsearch** | Indices → indices | 已有自己的结构 |
| **Cassandra** | keyspace → Tables | 已有自己的结构 |

---

## 如何为新数据库添加侧边栏分组

### 步骤 1：确定该数据库的分组

参考 Navicat 或 DataGrip，确定该数据库的侧边栏应该显示哪些分类。

例如，MSSQL 需要：Tables, Views, Functions, Procedures, Synonyms

### 步骤 2：检查后端是否已有对应的 API

查看 `src-tauri/src/db/drivers/<driver>.rs`，检查是否已有 `list_*` 方法。

- 如果已有（如 `list_tables` 返回 views），直接用 `sourceFilter` 过滤
- 如果没有，需要新增后端 API

### 步骤 3：如果需要新 API

**Rust 后端：**

1. 在 `src-tauri/src/models/mod.rs` 添加数据模型
2. 在 `src-tauri/src/db/drivers/mod.rs` 的 trait 添加默认方法
3. 在具体的 driver 文件实现该方法
4. 在 `src-tauri/src/commands/metadata.rs` 添加 Tauri command
5. 在 `src-tauri/src/lib.rs` 注册 command

**TypeScript 前端：**

1. 在 `src/services/api.ts` 添加类型和 API 方法
2. 在 `src/services/mocks.ts` 添加 mock 实现

### 步骤 4：在 sql-adapter.tsx 添加 groups

在 `src/lib/tree-adapters/sql-adapter.tsx` 中：

1. 添加新的 icon 导入（如果需要）
2. 创建新的 groups 数组
3. 在 `createSqlTreeConfig` 中根据 driverId 选择 groups

```typescript
const mssqlGroups: DatabaseGroupConfig[] = [
  { id: "tables",     label: "connection.tree.tables",     icon: <Table />,  leafIcon: <Table />,  source: "tables" },
  { id: "views",      label: "connection.tree.views",      icon: <Eye />,    leafIcon: <Eye />,    source: "tables", sourceFilter: "view" },
  { id: "functions",  label: "connection.tree.functions",  icon: <Cog />,    leafIcon: <Cog />,    source: "routines", sourceFilter: "function" },
  { id: "procedures", label: "connection.tree.procedures", icon: <Cog />,    leafIcon: <Cog />,    source: "routines", sourceFilter: "procedure" },
  { id: "synonyms",   label: "connection.tree.synonyms",   icon: <Link />,   leafIcon: <Link />,   source: "synonyms" },
];
```

### 步骤 5：在 driver-registry.tsx 更新驱动配置

```typescript
treeConfig: (callbacks) => createSqlTreeConfig(callbacks, { supportsSchemaNode: true }, "mssql"),
```

### 步骤 6：添加 i18n keys

在 `src/lib/i18n/locales/en.ts` 和 `zh.ts` 的 `connection.tree` 对象中添加：

```typescript
synonyms: "Synonyms",
noSynonyms: "No synonyms",
```

### 步骤 7：如果需要新的 source 类型

如果新的分组类型不是 `tables`、`routines`、`events`、`sequences`、`types`、`synonyms`、`packages` 之一，需要：

1. 在 `types.tsx` 的 `DatabaseGroupConfig.source` 类型中添加新值
2. 在 `ConnectionList.tsx` 中添加对应的状态（如 `databaseSynonyms`）和 fetch 函数
3. 在 `ConnectionList.tsx` 的 `getGroupItems` 函数中添加对应的数据获取逻辑
4. 在 `ConnectionList.tsx` 中添加对应的 render 函数（如 `renderSynonymNode`）
5. 在 `ConnectionList.tsx` 的 `renderGroupNode` 函数中添加对应的渲染分支
6. 在展开数据库时加载该类型的数据

---

## 后端 API 模式

### MySQL 模式（使用 `fetch_all_with_str_params`）

```rust
async fn list_events(&self, schema: Option<String>) -> Result<Vec<EventInfo>, String> {
    let target_schema = schema.unwrap_or_else(|| self.current_database()...);
    let rows = self.fetch_all_with_str_params(
        "SELECT ... FROM information_schema.XXX WHERE schema = ? ORDER BY name",
        &[&target_schema],
    ).await?;
    // 解码行数据
}
```

### PostgreSQL 模式（使用 `sqlx::query`）

```rust
async fn list_sequences(&self, schema: Option<String>) -> Result<Vec<SequenceInfo>, String> {
    let target_schema = schema.unwrap_or_else(|| "public".to_string());
    let rows = sqlx::query("SELECT ... FROM pg_xxx WHERE schema = $1 ORDER BY name")
        .bind(&target_schema)
        .fetch_all(&self.pool)
        .await?;
    // 解码行数据
}
```

### MSSQL 模式（使用 `fetch_rows`）

```rust
async fn list_synonyms(&self, schema: Option<String>) -> Result<Vec<SynonymInfo>, String> {
    let schema_filter = schema
        .filter(|s| !s.trim().is_empty())
        .map(|s| format!("AND s.name = '{}'", escape_literal(s.trim())));
    let sql = format!(
        "SELECT s.name, o.name, 'synonym' FROM sys.objects o \
         JOIN sys.schemas s ON s.schema_id = o.schema_id \
         WHERE o.type = 'SN' {} ORDER BY s.name, o.name",
        schema_filter.unwrap_or_default(),
    );
    let rows = self.fetch_rows(&sql).await?;
    // 解码行数据
}
```

### Oracle 模式（使用 `run_blocking` + `conn.query`）

```rust
async fn list_sequences(&self, schema: Option<String>) -> Result<Vec<SequenceInfo>, String> {
    let schema_upper = schema.map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty());
    self.run_blocking(move |conn| {
        let sql = format!(
            "SELECT SEQUENCE_OWNER, SEQUENCE_NAME, DATA_TYPE FROM ALL_SEQUENCES \
             WHERE SEQUENCE_OWNER = '{}' ORDER BY SEQUENCE_NAME",
            escape_literal(&schema_upper.unwrap_or_default())
        );
        let rows = conn.query(&sql, &[] as &[&dyn oracle::sql_type::ToSql])?;
        // 解码行数据
    }).await
}
```

### Db2 模式（使用 `run_blocking` + `conn.execute`）

```rust
async fn list_sequences(&self, schema: Option<String>) -> Result<Vec<SequenceInfo>, String> {
    let schema_upper = schema.map(|s| s.trim().to_uppercase()).filter(|s| !s.is_empty());
    self.run_blocking(move |conn| {
        let sql = format!(
            "SELECT SEQSCHEMA, SEQNAME, DATA_TYPE FROM SYSCAT.SEQUENCES \
             WHERE SEQSCHEMA = '{}' ORDER BY SEQSCHEMA, SEQNAME",
            escape_literal(&schema_upper.unwrap_or_default())
        );
        let cursor = conn.execute(&sql, ())?;
        // 解码行数据
    }).await
}
```

---

## 注意事项

1. **sourceFilter 大小写敏感**：MySQL 返回 `"view"`（小写），PostgreSQL 返回 `"VIEW"`（大写），ClickHouse 返回 `"View"` 和 `"MaterializedView"`（PascalCase）
2. **schema 节点**：PostgreSQL/MSSQL/Oracle/Db2 有 schema 层级，需要在 schema 下渲染 groups
3. **空分组**：当分组没有数据时，会显示 "No xxx" 的空状态消息
4. **数据加载**：events/sequences/types/synonyms/packages 的数据在展开数据库时加载，tables/routines 已有缓存机制
5. **新增 source 类型**：如需添加新的 source 类型（如 synonyms/packages），需同步修改 `types.tsx`、`ConnectionList.tsx` 的状态管理和渲染逻辑
