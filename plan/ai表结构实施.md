### AI 选表与表结构传递方案（首版）

### 简述
目标是先完成你最关心的部分：在 AI 侧边栏增加“表选择框”，并把“所选表结构”准确传给 AI。  
首版按已确认偏好执行：`未选表不允许发送`、`只传列名+类型`、`下拉多选+搜索`。

### 参考文档价值评估
1. [AI_SQL_GENERATION_GUIDE.md](/Users/father/per/lea/jspro/nextdb/DbPaw/AI_SQL_GENERATION_GUIDE.md) 参考价值高。它对“表结构传递格式（schema.table + columns）”和“先选表再生成”的路径与本项目技术栈最接近，可直接复用。
2. [AI架构分析文档.md](/Users/father/per/lea/jspro/nextdb/DbPaw/AI架构分析文档.md) 参考价值中等。对你当前需求直接可用的是 token 控制、Prompt 分层和 RAG 思路；多提供商 Java 架构细节对本仓 Rust/Tauri 首版不必照搬。

### 当前代码现状（已确认）
1. 前端已把 `schemaOverview` 传给 AI 请求，但没有显式“选表 UI”： [AISidebar.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Sidebar/AISidebar.tsx)。
2. 后端已做提示词组装和选表，但选表逻辑存在“无命中时只保留 1 张表”的问题，会误伤上下文： [prompt.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/ai/prompt.rs)。
3. `SchemaOverview` 当前数据粒度正好是“列名+类型”，与首版目标一致： [models/mod.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/models/mod.rs)。

### 实施方案（决策完成）

1. 前端在 AI 输入区新增“表选择器（多选+搜索）”。  
改造 [ChatComposer.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Sidebar/chat/ChatComposer.tsx)，在 provider 下拉旁增加 `Tables` 入口按钮；点击后打开 Popover + Command 搜索列表 + Checkbox 多选；显示已选数量；支持 `Clear` 和 `Select all`。

2. 前端发送请求时只传“所选表结构”。  
改造 [AISidebar.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Sidebar/AISidebar.tsx)：维护 `selectedTableKeys`；`handleSend` 前校验 `selectedTableKeys.length > 0`，否则 toast 阻止发送；构造 `request.schemaOverview.tables = effectiveSchemaOverview.tables.filter(selected)`。

3. 处理 `schemaOverview` 缺失场景，保证选择器有数据。  
在 [AISidebar.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Sidebar/AISidebar.tsx) 增加 `effectiveSchemaOverview`：优先用 `props.schemaOverview`，否则在 `connectionId` 存在时调用 [api.ts](/Users/father/per/lea/jspro/nextdb/DbPaw/src/services/api.ts) 的 `metadata.getSchemaOverview(connectionId, database)` 懒加载；加载失败时禁用发送并提示。

4. 后端修正表筛选策略，避免误删用户上下文。  
改造 [prompt.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/ai/prompt.rs)：  
`select_tables` 改为“先取 score>0 的前 N；若一个都没命中，则回退为前 N 张表（不是 1 张）”；等分时按 `schema.name` 再排序，保证稳定。  
这样即使用户选择的表名未出现在提问中，也不会被压成单表。

5. Prompt 文案只强调“当前已选表”。  
仍沿用轻量 schema summary（`schema.table: col:type`），但标题改成 `Selected schema context`，明确这是用户选择后的上下文，减少模型误解。

### 公开接口与类型变更
1. 前端组件接口新增（内部 UI API 变更）。  
在 [ChatComposer.tsx](/Users/father/per/lea/jspro/nextdb/DbPaw/src/components/business/Sidebar/chat/ChatComposer.tsx) 的 `ChatComposerProps` 增加：`tableOptions`、`selectedTableKeys`、`onSelectedTableKeysChange`、`schemaLoading`。  
2. 后端 Tauri 命令接口不变。  
[types.rs](/Users/father/per/lea/jspro/nextdb/DbPaw/src-tauri/src/ai/types.rs) 的 `AiChatRequest` 不新增字段，继续复用 `schemaOverview` 承载“已筛选后的表结构”。

### 测试与验收场景
1. UI 交互：可搜索并多选表，已选数量实时更新，切换连接后列表刷新。  
2. 发送校验：未选表时点击发送必须阻止并提示。  
3. 请求载荷：发送时 `schemaOverview.tables` 仅包含勾选表。  
4. 后端选表回退：输入与表名无关键词命中时，仍能保留前 N 张表而不是 1 张。  
5. 兼容性：`sql_generate` 现有流式事件链路不变（`ai.started/chunk/done/error`）。  
6. 回归：历史会话、provider 选择、新建会话、删除会话行为不回退。

### 假设与默认值
1. 首版不引入 DDL、nullable、PK/FK，严格使用“列名+类型”。  
2. 首版不做 AI 二次选表（LLM 预筛）和 RAG，仅做“用户显式选表 + 后端稳健兜底”。  
3. 不新增数据库迁移、不改 Tauri command 名称，确保低风险上线。  
4. Prompt 版本可从 `v1.0.0` 升到 `v1.1.0` 以便后续追踪效果。
