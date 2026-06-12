## Redis 接入评估（DbPaw）

### Summary
- **难度评估：中高（可行）**  
- 基于你选择的目标（`作为新数据源` + `v1 命令行/Key 浏览` + `先单机端点`），预计是 **1 名工程师约 8-12 个工作日** 的改造。
- 难点不在“连上 Redis”，而在当前项目是 **SQL/表结构中心架构**（驱动 trait、元数据、SQL 编辑器、TableView 都围绕表模型），Redis 需要单独的交互模型。
- **不建议**把 Redis 强行塞进现有 `DatabaseDriver` 表模型，否则后续维护成本很高。

### Key Changes
- 架构层：
  - 新增独立 Redis 能力层（建议 `RedisService` 或 `NonSqlDriver`），与现有 SQL `DatabaseDriver` 并行，不复用表结构接口。
  - 连接池沿用 `PoolManager` 思路，但 Redis 用独立 key 命名（如 `connId:dbIndex`）。
- 后端（Tauri/Rust）：
  - 增加 Redis 客户端依赖（tokio 异步）。
  - 新增命令：连接测试、DB 列表/切换、`SCAN` 分页、key 详情（type/ttl/size/value 预览）、原生命令执行。
  - 结果统一为前端可渲染结构（字符串、列表、哈希、集合、有序集合、错误）。
- 前端：
  - 连接弹窗增加 `redis` 类型及字段（host/port/username/password/db/tls；SSH 可复用现有开关）。
  - 侧边栏增加 Redis 树（连接 -> DB -> keys），替代“表”语义。
  - 新增 Redis 工作区（命令面板 + key 详情面板）；不复用 SQL 编辑器为主入口。
- 数据与兼容：
  - 本地 `connections` 表继续复用大部分字段；必要时新增 `redis_db`/`redis_tls_mode` 字段（迁移脚本）。
  - 旧连接与现有 SQL 功能保持不变；Redis 走新分支，不影响现有数据库驱动。

### Test Plan
- 单元测试：
  - Redis 命令结果解析（不同 RESP 类型）。
  - `SCAN` 分页与 cursor 结束条件。
  - key 详情读取与大 value 截断策略。
- 集成测试（建议 Docker Redis）：
  - 连接鉴权（含密码）与断线重连。
  - 常见命令 `GET/SET/HGETALL/LRANGE/SMEMBERS/ZRANGE/TTL/DEL`。
  - 多 DB 切换（0/1/2）与并发浏览稳定性。
- 回归测试：
  - 现有 PostgreSQL/MySQL/SQLite/ClickHouse/MSSQL 流程不回归。
  - 连接管理、保存连接、删除连接行为一致。

### Assumptions
- v1 仅支持 **单机/托管单端点 Redis**，不含 Sentinel/Cluster。
- v1 以 **命令执行 + Key 浏览** 为主，不实现“SQL 兼容层”。
- 默认允许 value 预览截断（防止大 key 卡 UI），下载完整值作为后续增强项。
- 继续复用现有 SSH 隧道逻辑与连接存储机制。
