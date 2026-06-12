# DbPaw `INSERT SQL` 文件导入功能方案（首版）

## 摘要
目标是在不改动现有执行模型前提下，新增一个“导入 `.sql`（仅 `INSERT`）并执行”的闭环能力，支持连接/数据库级入口、事务全回滚、执行结果统计与错误可追踪。

已确认的产品决策（按你刚才选择）：
1. 首版仅支持 `INSERT` 语句导入。
2. 失败策略为事务全回滚（任一语句失败则整体失败）。
3. 入口放在连接/数据库级（不是表级、不是编辑器级）。

---

## 现状结论（基于代码）
1. 已有“导出 SQL(INSERT)”能力，但没有导入能力。  
[transfer.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/commands/transfer.rs)
2. 前端 `api.transfer` 只有 `exportTable` / `exportQueryResult`。  
[api.ts](/Users/father/per/lea/jspro/nextdb/DbPaw/src/services/api.ts)
3. 后端已统一通过 `execute_with_retry` + 各驱动 `execute_query` 执行 SQL，可复用。  
[commands/mod.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/commands/mod.rs)  
[query.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/commands/query.rs)
4. ClickHouse 在项目定位中为预览只读，首版导入应禁用。  
[README_CN.md](/Users/father/per/lea/jspro/nextdb/DbPaw/README_CN.md)

---

## 功能范围（首版）
1. 支持选择本地 `.sql` 文件并导入执行。
2. 文件内只允许 `INSERT` 语句（允许注释、空行、分号结尾）。
3. 默认单次导入上限（建议）：文件大小 20MB、语句数 50k（超限直接拒绝并提示）。
4. 执行模式：单事务，全部成功才提交。
5. 结果反馈：总语句数、成功数、失败语句序号、错误信息、耗时。
6. 支持数据库：PostgreSQL/MySQL/SQLite；ClickHouse 禁用入口并提示只读。

不在首版范围：
1. `UPDATE/DELETE/DDL` 导入。
2. “遇错继续”策略。
3. 复杂脚本语言（存储过程体、`DELIMITER`、`COPY FROM STDIN` 等）。

---

## 实现方式（前后端分层）

### 前端
1. 在连接/数据库节点菜单新增 `Import SQL...`。
2. 通过 Tauri 文件选择器选取 `.sql`。
3. 弹出确认框，显示目标连接/数据库与“仅 INSERT + 全回滚”说明。
4. 调用新 API：`api.transfer.importSqlFile(...)`。
5. 展示导入结果 toast + 可展开错误详情。

建议改动点：
1. [ConnectionList.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Sidebar/ConnectionList.tsx)
2. [api.ts](/Users/father/per/lea/jspro/nextdb/DbPaw/src/services/api.ts)
3. [mocks.ts](/Users/father/per/lea/jspro/nextdb/DbPaw/src/services/mocks.ts)

### 后端
1. 在 `transfer` 模块新增命令 `import_sql_file`。
2. 读取文件内容后做词法级拆分（按语句分段，忽略字符串内分号和注释）。
3. 每条语句做白名单校验：首关键字必须为 `INSERT`（大小写不敏感）。
4. 建立事务，逐条执行；任一失败则回滚并返回错误详情。
5. 返回结构化结果并可选发进度事件（大文件）。

建议改动点：
1. [transfer.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/commands/transfer.rs)
2. [lib.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/lib.rs)
3. （如需）驱动层补充事务执行入口或在 `transfer` 内按现有连接池直接开事务。

---

## 对外接口变更（API/类型）
新增 TS 类型（`src/services/api.ts`）：
1. `ImportSqlParams`
2. `ImportSqlResult`
3. `ImportSqlErrorItem`

建议字段：
1. `ImportSqlParams`: `id`, `database?`, `filePath`, `driver`
2. `ImportSqlResult`: `filePath`, `totalStatements`, `successStatements`, `failedAt?`, `error?`, `timeTakenMs`, `rolledBack`

新增 invoke：
1. `transfer.importSqlFile(params) => invoke<ImportSqlResult>("import_sql_file", params)`

---

## 关键技术决策
1. 语句拆分必须自己实现最小可靠 parser，不使用简单 `split(';')`。
2. 校验策略采用“严格白名单”（仅 `INSERT`），降低误操作风险。
3. 事务语义优先一致性，不提供部分成功。
4. 大文件避免一次性构建巨大错误字符串，错误明细做截断（例如最多前 20 条）。

---

## 测试与验收标准

### 后端测试
1. 纯 `INSERT` 文件导入成功，`rolledBack=false`。
2. 含一条语法错误，整体 `rolledBack=true`，验证无部分写入。
3. 含 `UPDATE/DELETE/CREATE`，应在执行前被拦截。
4. 含注释、空行、字符串内分号，拆分结果正确。
5. 空文件/仅注释文件，返回可理解错误。
6. 超大文件/超语句数触发上限保护。

### 前端测试
1. 连接树入口可见，ClickHouse 不可用并给明确提示。
2. 文件选择取消时不中断 UI。
3. 成功提示包含总数与耗时。
4. 失败提示包含失败语句序号与错误摘要。
5. Mock 模式下命令可跑通（新增 mock handler）。

---

## 风险与规避
1. 多数据库事务实现差异：统一先从 Postgres/MySQL/SQLite 验证事务能力。
2. SQL 方言差异（如 `INSERT OR REPLACE`）：白名单规则需兼容常见 `INSERT` 变体。
3. 超大文件内存压力：首版限制文件大小，后续可做流式读取+分段执行。

---

## 假设与默认值
1. 首版不支持 ClickHouse 导入（只读）。
2. 目标数据库由当前连接上下文决定，可选覆盖 `database`。
3. 失败时返回第一处错误为主，附有限明细。
4. 默认阈值：20MB / 50k statements（可后续配置化）。
