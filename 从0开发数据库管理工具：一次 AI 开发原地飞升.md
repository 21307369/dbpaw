# 从0开发数据库管理工具：一次 AI 开发原地飞升

![01-overview-black-bak.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/fd4fca5c-02c4-43b8-a6e9-ec0b1a30a800.png)

# 一、起因：为什么要自己写数据库工具

日常开发中，数据库管理工具几乎是每个后端工程师每天都会用到的东西。

我之前一直使用 **DBeaver**，但使用时间长了之后，逐渐感觉到几个明显的问题：

*   **丑:** 非常丑,像工业软件,像开飞机一样,毫无美感
    
*   **太重**：启动慢，占用资源高
    
*   **UI体验一般**：很多操作路径复杂
    
*   **卡顿明显**：数据量稍大时体验不好
    
*   **功能堆叠**：很多功能用不到，
    

于是开始思考：有没有更好的替代品？

我陆续换过几个主流工具：

*   **Navicat**
    
*   **datagrip**
    
*   **TablePlus / LazySQL**
    
*   一些新兴的数据库客户端(dbcooper,chat2db)
    

结果是：

*   收费,没有免费版本
    
*   跨平台能力差(很难在windows,macos,linux有一样的体验)
    
*   electron套壳,打开内存占用就1个G
    

但是我的编辑器这些年变化非常快：

*   LazyVim
    
*   Helix(rust)
    
*   VSCode
    
*   Cursor
    
*   Zed(rust)
    

API工具:

postman,apipost,apifox,yaak(rust)

![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/3ab0803d-00b1-4bb7-923e-ce747470c7ef.png)

但是 **数据库工具却几乎没有发生革命性变化**。

于是一个想法冒出来：

**痛,太痛了,寻寻觅觅几年还是找不到想要的**

**所以还是自己写一个吧.**

目标很简单：

> 做一个符合自己操作习惯的数据库工具.

> 快,启动快,操作快,

> 好看,非常好看,配色好看,多主题

> 小,极致小,不要浏览器套壳的,不要带虚拟机的(java),

---

# 二、技术选型：Rust、Go 还是 Flutter？

在真正开始之前，先思考技术栈。

最初考虑过几个方向：

### 方案一：Flutter

优点：

*   UI开发快
    
*   跨平台能力强
    

缺点：

*   生态更偏移动端
    
*   桌面端数据库工具生态弱
    

---

### 方案二：Go

优点：

*   开发速度快
    
*   自己熟悉
    

缺点：

*   UI生态比较差
    

---

### 方案三：Rust + React

优点：

*   Rust 做 backend / core
    
*   React 做 UI
    
*   性能好
    
*   生态成熟
    

最终决定：

**Rust + React**

类似很多现代桌面应用的结构。(markflowy,yaak等工具)

---

# 三、幻想：能不能一行代码不写？

在真正开始开发之前，我其实还有一个更大胆的想法。

既然现在 AI 已经这么强了，那有没有可能：

> **一行代码都不写，直接让 AI 把整个项目生成出来？**

理论上来说，现在的大模型：

*   能写代码
    
*   能生成 UI
    
*   能写后端逻辑
    

那是不是只需要 **写好 Prompt** 就可以完成整个项目？

而且这里还有一个非常关键的背景：

**我其实不会 React，也不会 Rust。**

所以当时的想法很简单：

> 既然 AI 会，那我为什么还要学？

于是我开始疯狂尝试：

*   让 AI 生成 React UI
    
*   让 AI 写 Rust backend
    
*   让 AI 设计数据库连接模块
    
*   甚至让 AI 设计整个项目结构
    

刚开始看起来效果还不错。

AI 确实能很快生成一堆代码。

但是当项目开始变复杂的时候，问题就出现了。

### 第一个问题：没有架构

AI 每次生成的代码都是 **局部正确** 的。

比如：

*   一个页面能跑
    
*   一个组件能用
    
*   一个函数能执行
    

但是整体项目却越来越混乱：

*   文件结构不一致
    
*   状态管理混乱
    
*   组件之间耦合严重
    
*   Rust 和前端的接口设计反复变化
    

换句话说：

> **AI 可以写代码，但不会替你做系统架构。**

---

### 第二个问题：Prompt越来越复杂

一开始我以为问题出在 Prompt。

于是开始疯狂优化 Prompt：

*   增加更多限制
    
*   指定目录结构
    
*   指定编码规范
    
*   指定接口定义
    

结果发现一个新的问题：

**Prompt 的复杂度越来越高。**

甚至有时候：

*   写 Prompt 的时间
    
*   比写代码还长
    

而且每次生成的代码仍然可能不符合预期。

---

### 第三个问题：调试成本极高

还有一个很现实的问题：

**调试非常困难。**

比如：

AI 写的代码运行报错。

这时候你有几个选择：

1️⃣ 手动修代码  
2️⃣ 继续让 AI 改

如果继续让 AI 改，就会进入一个循环：

```plaintext
报错
↓
贴错误日志
↓
AI修改代码
↓
出现新的错误
↓
继续修改
```

很快就会发现：

*   token 消耗巨大
    
*   时间消耗巨大
    
*   项目结构越来越混乱
    

最后只得到一堆 **半成品代码**。

![胎死腹中.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/b2dc7596-a908-4bc7-bf3f-28c8d3be33af.png)

---

### 一个重要的结论

经历了这些尝试之后，我意识到一件事情：

> **AI 可以替代写代码，但不能替代思考。**

如果没有：

*   清晰的架构
    
*   明确的模块划分
    
*   明确的开发计划
    

AI 最终只能生成：

**很多看起来正确，但无法维护的代码。**

---

### 开始改变开发方式

于是我决定换一种方式：

不是让 AI **直接写项目**，

而是：

```plaintext
我负责设计
AI负责实现
```

也就是：

1.  先思考系统架构
    
2.  再让 AI 写模块代码
    
3.  人工 review
    
4.  再逐步迭代
    

从这个阶段开始，开发效率才真正提升起来。

而且一个意外的收获是：

为了能看懂 AI 写的代码，

我反而 **快速学会了 Rust 和 React 的基础。**

**(rust很值得学一下,生命周期,**所有权,作用域**)**

---

# 四、反思：AI时代的开发方式

对比传统开发和 AI 开发，我总结出一个结论：

**AI时代更需要架构能力。**

以前的流程：

```plaintext
需求
↓
设计
↓
编码
↓
测试
```

AI时代：

```plaintext
需求
↓
架构设计
↓
AI生成代码
↓
人工Review
↓
自动测试
```

核心变化：

**人从写代码 → 变成设计系统 + 审核代码。**

于是我开始重新设计开发流程。

---

# 五、开发流程重构

我给自己定了几个规则。

---

## 1. 使用 Figma 先设计 UI

在写代码之前，我先用 **Figma** 设计 UI。

效果非常好。

优点：

*   可以快速看到最终产品
    
*   交互更清晰
    
*   减少反复修改
    

AI 生成 UI 代码时也更准确。

![figma输出2.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/43124e62-dcf9-4216-a7c8-a81f66bb48c0.png)

但问题是：

AI 生成的代码 **非常乱**。

所以必须：

**人工整理代码结构。**

---

# 六、项目架构设计

在正式开发之前，我先做了一件事：

**先定架构。**

主要做了三件事：

### 1 项目拆分

把系统拆成几个模块：

```plaintext
```
/Users/father/per/lea/jspro/nextdb/DbPaw/
├── .vscode/
│   └── extensions.json
├── guidelines/
│   └── Guidelines.md
├── public/
│   ├── product-icon.png
│   ├── tauri.svg
│   └── vite.svg
├── src/
│   ├── components/
│   │   ├── business/
│   │   │   ├── DataGrid/
│   │   │   │   └── TableView.tsx
│   │   │   ├── Editor/
│   │   │   │   └── SqlEditor.tsx
│   │   │   ├── Metadata/
│   │   │   │   └── TableMetadataView.tsx
│   │   │   └── Sidebar/
│   │   │       ├── AISidebar.tsx
│   │   │       └── DatabaseSidebar.tsx
│   │   ├── settings/
│   │   │   └── SettingsDialog.tsx
│   │   ├── ui/
│   │   │   ├── accordion.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── aspect-ratio.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── breadcrumb.tsx
│   │   │   ├── button.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── card.tsx
│   │   │   ├── carousel.tsx
│   │   │   ├── chart.tsx
│   │   │   ├── checkbox.tsx
│   │   │   ├── collapsible.tsx
│   │   │   ├── command.tsx
│   │   │   ├── context-menu.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── drawer.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── hover-card.tsx
│   │   │   ├── input-otp.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── menubar.tsx
│   │   │   ├── navigation-menu.tsx
│   │   │   ├── pagination.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── progress.tsx
│   │   │   ├── radio-group.tsx
│   │   │   ├── resizable.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── sidebar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── slider.tsx
│   │   │   ├── sonner.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toggle-group.tsx
│   │   │   ├── toggle.tsx
│   │   │   ├── tooltip.tsx
│   │   │   ├── use-mobile.ts
│   │   │   └── utils.ts
│   │   └── theme-provider.tsx
│   ├── services/
│   │   ├── api.ts
│   │   └── store.ts
│   ├── styles/
│   │   ├── fonts.css
│   │   ├── index.css
│   │   ├── tailwind.css
│   │   └── theme.css
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/
│   ├── capabilities/
│   │   └── default.json
│   ├── icons/
│   │   ├── 128x128.png
│   │   └── StoreLogo.png
│   ├── migrations/
│   │   └── 001_initial.sql
│   ├── src/
│   │   ├── commands/
│   │   │   ├── config.rs
│   │   │   ├── connection.rs
│   │   │   ├── metadata.rs
│   │   │   ├── mod.rs
│   │   │   ├── query.rs
│   │   │   └── storage.rs
│   │   ├── db/
│   │   │   ├── drivers/
│   │   │   │   ├── mod.rs
│   │   │   │   ├── mysql.rs
│   │   │   │   └── postgres.rs
│   │   │   ├── local.rs
│   │   │   ├── mod.rs
│   │   │   └── pool.rs
│   │   ├── models/
│   │   │   └── mod.rs
│   │   ├── utils/
│   │   │   └── mod.rs
│   │   ├── error.rs
│   │   ├── events.rs
│   │   ├── lib.rs
│   │   ├── main.rs
│   │   └── state.rs
│   ├── tests/
│   │   └── mysql_integration.rs
│   ├── .gitignore
│   ├── build.rs
│   ├── Cargo.lock
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .gitignore
├── bun.lock
├── index.html
├── package-lock.json
├── package.json
├── README.md
├── tsconfig.json
├── tsconfig.node.json
└── vite.config.ts
```

```

这样 AI 写代码时更容易控制。

---

### 2 技术规范

给 AI 定规则，例如：

*   使用 TypeScript
    
*   组件必须拆分
    
*   状态统一管理
    
*   每个模块必须有单测
    

这样生成的代码质量会好很多。

---

### 3 强制使用 Plan 模式

开发时，我基本遵循一个原则：

**先写计划，再写代码。**

例如：

```plaintext
实现数据库连接模块
```

先让 AI 输出：

*   架构设计
    
*   数据结构
    
*   API设计
    
*   文件结构
    

确认没问题再生成代码。

好处：

*   代码更稳定
    
*   减少返工
    
*   全面思考问题
    

---

# 七、多 Agent 开发

在开发过程中，我尝试了一种比较有意思的方法：

**多 Agent 开发。**

每个 Agent 负责不同模块：

例如：

```plaintext
agent1: UI
agent2: database driver
agent3: query engine
agent4: testing
```

为了避免代码冲突，我使用了：

**git worktree**

![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/c61cf4b5-91ec-4d7d-8fbf-e72c76fa1cb1.png)

*   是什么：为同一个仓库创建多个“工作区”（工作副本），每个工作区可检出不同分支/提交，同时开发互不干扰。
    
*   核心约束：同一分支同一时刻只能在一个 [worktree](https://zhida.zhihu.com/search?content_id=261557484&content_type=Article&match_order=1&q=worktree&zhida_source=entity) 被检出；要并行就用不同分支或 `--detach`。
    
*   典型场景：并行开发与热修、跨版本回溯与验证、长分支隔离、大仓多版本并行编译、评审验证临时环境。
    
*   相对切分支/多仓 clone 的优势：切换成本低、索引/对象共享省磁盘、避免频繁 `stash`、误操作风险更小。
    

```go
# 主分支：核心架构
git worktree add ../agent-core core

# Agent A：前端页面开发
git worktree add ../agent-frontend frontend-dev

# Agent B：后端 API 开发  
git worktree add ../agent-backend backend-dev

# Agent C：测试与文档
git worktree add ../agent-qa qa-docs
```
---

# 八、收获

开发过程中有几个经验非常重要。

## 多写 Plan

![image.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/8fd7959b-117e-4c1b-bd9c-cd24ebbe76ff.png)

AI 很容易：

*   写错代码
    
*   写重复逻辑
    
*   架构混乱
    

所以必须：

**让 AI 先输出大量 plan 文档。opus 4.6,codex 5.3输出计划,让便宜的模型来执行**

例如：

*   架构文档
    
*   API设计
    
*   数据结构
    
*   任务列表
    

然后再按照优先级开发。

---

## 强迫自己 Review 代码

AI 写的代码：

*   80%能用
    
*   20%有坑
    

所以必须：

**每个 PR 都 review。**

---

## 写大量单测

AI 写测试其实非常快。

所以我增加了很多 **单元测试**。

好处：

*   减少人工测试
    
*   防止回归 bug
    

## 开发流程：先跑通，再完美

```plain
粗糙但可用 → 快速验证 → 迭代完善 → 最终交付
```

---

# 九、独立开发技术栈

在整个项目中，我最终选择了一个比较轻量的技术栈。

### 前端

```plaintext
React
TypeScript
TailwindCSS
Shadcn/ui
```

优点：

*   UI组件成熟
    
*   开发效率高
    
*   AI生成代码质量高最大
    

---

### 后端 / 服务

一些辅助服务我使用：

**Supabase**

优点：

*   自带数据库
    
*   Auth
    
*   Storage
    
*   免费额度足够
    

---

### 部署

前端部署：

**Cloudflare Pages**

优点：

*   免费
    
*   CDN
    
*   全球加速
    

对个人项目来说：

**完全够用。**

---

# 十、产品与增长

## 宣传到位

开发完之后，接下来就是产品问题。

一个小技巧：

**宣传图可以用 AI 生成。**

比如：

*   产品截图: [https://postspark.app/](https://postspark.app/)
    
*   产品图标: nano banan 
    
*   Landing Page: astro
    
*   图标: lucide-react,simple-icons
    
*   发版的changelog: git cliff
    

前期通过 **GitHub Traffic** 查看项目数据：

可以帮助判断项目受欢迎程度。

## 找到产品差异点

| 类型 | 说明 | 我的案例 |
| --- | --- | --- |
| **性能差异** | 同样功能，更快/更轻 | Tauri 替代 Electron，内存 1/10 |
| **体验差异** | 同样功能，更顺手 | 键盘优先，秒开秒查 |
| **模式差异** | 同样功能，更便宜/更开放 | 开源核心，云服务增值 |
| **场景差异** | 切分细分场景，做深做透 | 只做"查询分析"，不做"数据库管理" |
| **技术差异** | 新技术带来新可能 | AI 原生集成，不是外挂 |

传统工具的思路：**"数据库工具 = 连接 + 查询 + 管理 + 设计 + 备份 + ..."**

我的思路：**"开发者 90% 时间只在查询，只专注于核心的能力上面"**

## 快速验证

**"一周验证，不行就撤"**

**找潜在用户聊聊,看是否是自嗨**

| 阶段 | 动作 | 标准 |
| --- | --- | --- |
| Day 1-2 | 用纸笔/ Figma 画交互，给 3 个同事看 | 他们眼睛亮了吗？ |
| Day 3-5 | 做一个只能查数据的 MVP，自己用 | 我愿意每天用吗？ |
| Day 6-7 | 给 2-3 个目标用户试用 | 他们主动问"什么时候正式发布"吗？ |

---

# 十一、新时代软件的默认基因

如果想让项目更容易获得关注：

可以往 **AI方向靠一点**。

像现在的openclaw,picoclaw.....各种虾

**AI离钱更近。**

![AI支持.png](https://alidocs.oss-cn-zhangjiakou.aliyuncs.com/res/r4mlQ5bvK5MaZlxo/img/8f1c820e-ec4d-4836-9430-c6dd1eafffa4.png)

---

# 十二、最终收获

这个项目带来的收获其实很多。

### 1 一个真正顺手的工具

最直接的收获：

> 做出了一个符合自己使用习惯的数据库工具。

---

### 2 AI开发方法论

现在能够小声说,我全栈了

我逐渐形成了一套自己的 AI 开发流程：

```plaintext
需求
↓
架构设计
↓
AI plan
↓
AI coding
↓
人工 review
↓
自动测试
```
---

### 3 技术能力提升

通过这个项目：

*   学习了 **Rust**
    
*   学习了 **React**
    
*   学会了 **AI协作开发**
    

---

### 4 意外收获

**Trae先锋奖: 200元京东卡。**

# 参考文档

[https://github.com/codeErrorSleep/dbpaw: https://github.com/codeErrorSleep/dbpaw](https://github.com/codeErrorSleep/dbpaw)

[独立开发技术栈](https://guangzhengli.com/blog/zh/indie-hacker-tech-stack-2024#supabase-database)