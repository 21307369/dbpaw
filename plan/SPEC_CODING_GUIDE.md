# Chat2DB Spec Coding 开发指南

本文档定义了一套与 AI Agent 协作开发的标准化工作流程。采用 **Spec-Driven Development** 模式，确保每个任务都有明确的输入、输出和验收标准。

> **重要**: 前后端接口定义请参考 [API_CONTRACT.md](./API_CONTRACT.md)

---

## 一、工作流程概览

```
┌─────────────────────────────────────────────────────────────────┐
│                    Spec Coding 工作流                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. 选择任务         2. 提交 Spec         3. AI 实现           │
│   ┌─────────┐        ┌─────────┐         ┌─────────┐          │
│   │ 从任务  │───────▶│ 复制任务 │────────▶│ AI 根据  │          │
│   │ 列表选择│        │ Spec给AI │        │ Spec编码 │          │
│   └─────────┘        └─────────┘         └─────────┘          │
│                                               │                 │
│                                               ▼                 │
│   6. 标记完成         5. 迭代修复         4. 验收检查           │
│   ┌─────────┐        ┌─────────┐         ┌─────────┐          │
│   │ 更新任务 │◀───────│ 根据反馈 │◀────────│ 按验收   │          │
│   │ 状态    │        │ 修正代码 │        │ 标准测试 │          │
│   └─────────┘        └─────────┘         └─────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、如何与 AI 交互

### 启动新任务的标准 Prompt 模板

```markdown
## 任务启动

我要开始执行任务 [TASK-ID]，请阅读以下 Spec 并实现：

---
[粘贴完整的任务 Spec]
---

请按以下步骤进行：
1. 首先确认你理解了任务要求，列出关键点
2. 如有任何不清楚的地方，先提问
3. 开始实现，每完成一个关键步骤后暂停让我验证
4. 实现完成后，帮我运行验收标准中的检查项
```

### 继续未完成任务的 Prompt

```markdown
## 继续任务

我要继续任务 [TASK-ID]，当前进度：[描述已完成的部分]

上次停在：[描述停止点]

请继续实现下一步。
```

### 问题修复的 Prompt

```markdown
## 问题修复

任务 [TASK-ID] 的实现遇到问题：

**现象**：[描述出现的问题]
**期望**：[描述期望的行为]
**相关代码位置**：[文件路径]

请诊断并修复。
```

---

## 三、任务 Spec 标准格式

每个任务都遵循以下格式：

```markdown
### TASK-[阶段]-[序号]: [任务名称]

**状态**: [ ] 未开始 / [~] 进行中 / [x] 已完成

**依赖**: TASK-X-X, TASK-X-X (如无依赖则写"无")

**预计耗时**: X 小时

---

#### 目标
一句话描述这个任务要达成什么。

#### 上下文
- 相关背景信息
- 需要了解的前置知识
- 参考的现有代码位置（如有）

#### 技术要求

**后端 (Rust)**:
- [ ] 具体实现点 1
- [ ] 具体实现点 2

**前端 (React/TypeScript)**:
- [ ] 具体实现点 1
- [ ] 具体实现点 2

#### 接口定义

```rust
// 后端命令签名
#[tauri::command]
async fn command_name(param1: Type1, param2: Type2) -> Result<ReturnType, String>
```

```typescript
// 前端调用方式
const result = await invoke<ReturnType>('command_name', { param1, param2 });
```

#### 验收标准
- [ ] 标准 1: 具体可验证的条件
- [ ] 标准 2: 具体可验证的条件
- [ ] 标准 3: 具体可验证的条件

#### 输出产物
- `path/to/file1.rs` - 描述
- `path/to/file2.tsx` - 描述
```

---

## 四、项目目录结构约定

```
chat2db-tauri/
├── src/                          # 前端源码
│   ├── assets/                   # 静态资源
│   │   └── icons/                # 图标资源
│   ├── components/               # React 组件
│   │   ├── ui/                   # 通用 UI 组件 (Button, Input, Modal)
│   │   ├── business/             # 业务组件
│   │   │   ├── Connection/       # 连接相关 (Form, List)
│   │   │   ├── Editor/           # SQL 编辑器封装 (Monaco)
│   │   │   ├── DataGrid/         # 结果表格
│   │   │   └── Sidebar/          # 侧边栏对象树
│   │   └── Layout/               # 布局组件 (MainLayout, AuthLayout)
│   ├── pages/                    # 页面组件
│   │   ├── Workspace.tsx         # 主工作区
│   │   ├── Settings.tsx          # 设置页
│   │   └── Welcome.tsx           # 欢迎页
│   ├── hooks/                    # 自定义 Hooks
│   ├── stores/                   # 状态管理 (Zustand)
│   │   ├── useTabStore.ts        # 多 Tab 页管理
│   │   └── useConnectionStore.ts # 连接列表管理
│   ├── services/                 # 前端服务层
│   │   └── tauri.ts              # Tauri invoke 封装
│   ├── utils/                    # 工具函数
│   ├── styles/                   # 全局样式
│   ├── types/                    # TypeScript 类型定义
│   └── App.tsx
├── src-tauri/                    # Rust 后端源码
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── commands/             # Tauri Commands
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs     # 数据库连接相关
│   │   │   ├── query.rs          # 查询执行相关
│   │   │   ├── metadata.rs       # 元数据获取相关
│   │   │   ├── config.rs         # 应用配置管理
│   │   │   └── storage.rs        # 本地存储相关
│   │   ├── db/                   # 数据库操作层
│   │   │   ├── mod.rs
│   │   │   ├── drivers/          # 数据库驱动抽象
│   │   │   │   ├── mod.rs
│   │   │   │   ├── mysql.rs
│   │   │   │   └── postgres.rs
│   │   │   ├── pool.rs           # 连接池管理
│   │   │   └── local.rs          # 本地 SQLite (配置/历史)
│   │   ├── error.rs              # 统一错误定义
│   │   ├── events.rs             # 后端事件定义
│   │   ├── utils/                # 后端工具 (加密/日志)
│   │   ├── models/               # 数据模型
│   │   └── state.rs              # 应用状态
│   ├── migrations/               # 本地数据库迁移脚本
│   ├── Cargo.toml
│   └── tauri.conf.json
└── package.json
```
