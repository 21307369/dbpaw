## Oracle 只读 MVP 接入计划（DbPaw）

### Summary
目标是在不改动现有已支持数据库行为的前提下，新增 Oracle 只读能力：连接测试、库对象浏览、执行查询、结果分页展示、导出。  
范围明确为只读：不支持表格内编辑/插入/更新/删除，不做迁移工具适配。  
预计实现节奏：3 个阶段，约 4-8 个工作日（不含 Oracle 环境申请时间）。

### Key Changes
1. 后端驱动层（核心）
- 新增 Oracle 驱动实现 `DatabaseDriver`，并接入驱动工厂分发。  
- 重点改动：
  - [mod.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/db/drivers/mod.rs)
  - [Cargo.toml](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/Cargo.toml)
  - 新文件：`src-tauri/src/db/drivers/oracle.rs`
- 设计约束：
  - 统一返回现有 `QueryResult/TableMetadata/TableDataResponse` 结构，不新增前端消费协议。
  - Oracle 分页采用 Oracle 语法（`OFFSET ... FETCH NEXT ...` 或等价实现），与现有 `get_table_data_chunk` 契约保持一致。
  - 错误码前缀延续现有风格（如 `[VALIDATION_ERROR]`、`[CONN_FAILED]`）。

2. 连接模型与命令层
- 扩展 `driver` 取值支持 `"oracle"`，命令层不新增新命令，继续复用现有 tauri commands。  
- Oracle 连接参数默认采用最小集：`host/port/database(username/password)`；`database` 在 MVP 中定义为 service name（默认约定）。  
- 重点改动：
  - [models/mod.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/models/mod.rs)
  - `src-tauri/src/commands/query.rs`（默认 limit 注入分支补充 oracle）
- 公共接口变化：
  - 前后端 `Driver` union 增加 `"oracle"`。
  - 不新增字段；SID/高级连接串留到后续版本。

3. 前端接入与只读约束
- 连接创建弹窗增加 Oracle 选项与默认端口 `1521`。  
- SQL 编辑器语法高亮先落到 `StandardSQL`（MVP 不引入 Oracle 专属词法包）。  
- TableView 对 Oracle 标记为只读（与 ClickHouse 类似），隐藏/禁用编辑入口。  
- 导出链路复用现有逻辑，仅补充 Oracle 标识符处理分支。  
- 重点改动：
  - `src/services/api.ts`（`Driver` 类型）
  - `src/components/business/Sidebar/ConnectionList.tsx`
  - `src/components/business/DataGrid/TableView.tsx` 与 `tableView/utils.ts`

4. 元数据与对象可见性（MVP 策略）
- 只保证当前用户可见对象：
  - 表列表：`ALL_TABLES`/`USER_TABLES`（按权限可见性优先）
  - 列信息：`ALL_TAB_COLUMNS`
  - 主键/索引/外键：分别用 Oracle 字典视图映射到现有结构
- DDL：
  - MVP 默认通过 `DBMS_METADATA.GET_DDL` 尝试获取；失败时降级提示“当前对象不支持提取 DDL”。

### Test Plan
1. 单元测试（Rust）
- Oracle SQL 组装函数测试：连接串构造、标识符引用、分页 SQL 生成、schema/table 规范化。
- 错误映射测试：常见连接失败、鉴权失败、对象不存在返回格式。

2. 集成测试（Rust，`#[ignore]`）
- 新增 `oracle_integration.rs`，覆盖：
  - `test_connection`
  - `list_tables`
  - `get_table_metadata`
  - `get_table_data/get_table_data_chunk`
  - `execute_query`
- 运行开关新增：`RUN_ORACLE_IT=1`，并接入现有 `scripts/test-integration.sh` 流程。

3. 前端回归
- 连接弹窗字段与默认端口校验。
- Oracle 标签页执行 SQL、分页、导出三条路径手工验证。
- 确认 Oracle 下编辑按钮不可用，不影响其他驱动。

### Risks & Mitigations
- Oracle 客户端依赖/链接复杂：  
  缓解：MVP 先锁定一种 Rust Oracle 驱动方案并验证三平台构建矩阵，再合并业务逻辑。
- 元数据权限差异大（不同实例授权差异）：  
  缓解：优先用 `ALL_*` 视图并在失败时降级到 `USER_*`，错误信息中显式提示权限不足。
- SQL 方言差异导致默认 limit 注入误判：  
  缓解：在 `query guard` 中为 Oracle 单独分支与测试样例，避免破坏已有 mssql/clickhouse 规则。
- 大结果集性能：
  缓解：严格走分块查询与默认 limit，MVP 不做全量一次性拉取。

### Assumptions / Defaults
- Oracle MVP 默认“只读”，不支持网格编辑和 DML 辅助写回。
- `ConnectionForm.database` 在 Oracle 场景定义为 service name。
- 暂不支持 SID、Wallet、TNS 文件、Kerberos、高级 SSL 选项。
- 仅承诺 Linux/macOS/Windows 开发环境可编译；发布包内置依赖策略放在下一阶段。
