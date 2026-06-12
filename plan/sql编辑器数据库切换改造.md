## SQL 编辑器数据库可切换改造方案（同连接内）

### 简述
当前问题的根因是：编辑器只展示 `databaseName` 文本，不提供可编辑入口；并且数据库来源由 tab 创建时固定。  
本次改造可控，属于“中等改动、低到中风险”，主要改动集中在 [App.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/App.tsx) 和 [SqlEditor.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Editor/SqlEditor.tsx)。

你已确认的行为：
1. 切库后清空当前查询结果。
2. 若 tab 标题是默认 `Query(库名)`，切库后自动更新标题。

---

### 设计与实现（决策已定）

1. 在编辑器头部把只读数据库标签改为可选下拉
- 在 [SqlEditor.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Editor/SqlEditor.tsx) 中将当前 `databaseName` 展示块替换为 `Select`。
- 默认值使用当前 tab 的数据库（即创建时选中的库）。
- 下拉项来自父层传入的“同连接可用数据库列表”。
- 数据库列表加载中显示禁用态/占位文案（例如 `Loading databases...`）。

2. 将“数据库”作为 editor tab 的可变状态管理
- 在 [App.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/App.tsx) 的 `TabItem` 增加字段：
  - `availableDatabases?: string[]`
  - `isDatabasesLoading?: boolean`
- 新增方法：
  - `loadTabDatabases(tabId, connectionId)`：调用 `api.metadata.listDatabasesById(connectionId)` 拉取列表并写回对应 tab。
  - `handleEditorDatabaseChange(tabId, nextDatabase)`：处理切库后的联动更新。

3. 切库后的联动逻辑（核心）
- `handleEditorDatabaseChange` 执行以下更新：
  - 更新 `tab.database = nextDatabase`
  - 清空 `tab.queryResults = null`（按你确认）
  - 重新拉取并更新 `tab.schemaOverview`（`api.metadata.getSchemaOverview(connectionId, nextDatabase)`）
  - 若 `tab.title` 是默认格式 `Query(...)`，同步改成 `Query(nextDatabase)`（按你确认）
- 说明：SQL 文本 `sqlContent` 不改动，避免用户输入丢失。

4. 保存与执行路径保持兼容
- 现有保存逻辑已使用 `databaseName/tab.database`，切库后保存会自动带新库，无需后端接口改动。
- 执行/导出/AI 侧都依赖 `tab.database`，切库后会自然生效。

5. 初始化数据库列表的时机
- 创建新查询 tab（`handleCreateQuery`）后立即加载可用数据库列表。
- 打开已保存查询（`handleOpenSavedQuery`）后也加载可用数据库列表。
- 若列表拉取失败：
  - 不中断编辑器使用；
  - 保底至少保留当前 `tab.database` 作为唯一可选项；
  - toast 提示加载失败（可重试）。

---

### 公共接口/类型变更

1. `SqlEditorProps` 变更（[SqlEditor.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Editor/SqlEditor.tsx)）
- 新增：
  - `availableDatabases?: string[]`
  - `isDatabasesLoading?: boolean`
  - `onDatabaseChange?: (database: string) => void`
- 保留：
  - `databaseName?: string`（作为当前值）

2. `TabItem` 变更（[App.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/App.tsx)）
- 新增：
  - `availableDatabases?: string[]`
  - `isDatabasesLoading?: boolean`

---

### 测试与验收场景

1. 基础切换
- 新建 SQL tab 后默认选中初始数据库。
- 下拉可切换到同连接其他数据库。
- 切换后执行 SQL 请求参数里的 `database` 为新值。

2. 保存行为
- 切换数据库后点击保存（新建/更新）：
  - 保存记录里的 `database` 应为当前下拉选中值。
- 重新从保存查询打开时，数据库默认回显为保存值。

3. 切库联动
- 切库后 `queryResults` 被清空。
- 自动补全/schema 信息切换到新数据库内容。
- AI 侧（使用 activeTab 的 database/schemaOverview）上下文同步变化。

4. 标题策略
- 默认标题 `Query(oldDb)` 切库后变成 `Query(newDb)`。
- 非默认标题（用户命名或保存后标题）不自动改名。

5. 异常路径
- `listDatabasesById` 失败时编辑器仍可正常执行/保存当前库。
- `getSchemaOverview` 失败时不阻塞切库，补全降级。

---

### 风险与复杂度评估

- 难度：中等（约半天到 1 天，含联调与回归）。
- 主要风险点：
  1. 不同驱动数据库概念差异（尤其 sqlite/单库场景）导致下拉为空或只有一个值。
  2. 切库后 schema 拉取失败时的降级体验。
  3. 默认标题识别逻辑要避免误判用户自定义标题。
- 风险控制：
  - 下拉数据兜底当前库；
  - schema 拉取失败不阻塞；
  - 标题仅在明确匹配默认模板时更新。

---

### 明确假设与默认值

1. 仅支持“同 connectionId 下切换数据库”，不支持跨连接切换。
2. 切库不会清空 SQL 文本。
3. 切库会清空结果区（已确认）。
4. 默认标题会随切库更新，非默认标题不更新（已确认）。
5. 后端现有接口 `list_databases_by_id/get_schema_overview/execute_query/save_query` 无需新增字段。
