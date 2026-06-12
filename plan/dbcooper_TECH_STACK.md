# DBcooper 技术栈

本文档概述了 DBcooper 项目使用的核心技术和框架。

### **整体架构**

- **桌面应用框架 (Desktop App Framework):** **Tauri v2**
  - 使用 Rust 作为后端，并利用 Web 技术（React）构建用户界面，实现了高性能和跨平台的原生应用体验。

### **后端 (Backend)**

- **语言 (Language):** **Rust**
- **核心库 (Core Libraries):**
    - **异步运行时 (Async Runtime):** **Tokio**，用于处理并发和异步I/O操作。
    - **数据库交互 (Database Interaction):** **SQLx**，一个现代的、类型安全的异步 Rust SQL 工具包。
    - **本地数据库 (Local Database):** **SQLite**，用于存储应用配置、连接信息和保存的查询。
    - **数据库驱动 (Database Drivers):** 通过 `sqlx` 和其他专用库支持以下数据库：
        - PostgreSQL
        - SQLite
        - Redis
        - ClickHouse (通过 `reqwest` HTTP 客户端)
    - **SSH 隧道 (SSH Tunneling):** 使用 `async-ssh2-lite` 库实现通过 SSH 安全隧道连接到远程数据库。

### **前端 (Frontend)**

- **语言 (Language):** **TypeScript**
- **框架 (Framework):** **React** (v19)
- **构建和打包工具 (Build & Bundling):** **Vite**，并集成了 SWC (Speedy Web Compiler) 以实现极速编译和热模块替换 (HMR)。
- **包管理器 (Package Manager):** **Bun**
- **核心库 (Core Libraries):**
    - **UI 组件 (UI Components):** **shadcn/ui**，一套基于 Radix UI 和 Tailwind CSS 的可组合、可访问的组件。
    - **样式 (Styling):** **Tailwind CSS**，一个功能优先的 CSS 框架。
    - **代码编辑器 (Code Editor):** **CodeMirror**，为 SQL 查询编辑器提供语法高亮、自动完成等高级功能。
    - **图表/可视化 (Diagrams/Visualization):** **React Flow** (`@xyflow/react`)，用于实现交互式的实体关系图（ERD）或模式可视化。
    - **路由 (Routing):** **React Router**，用于处理应用内的页面导航。

### **AI 功能**

- **SQL 生成 (SQL Generation):** 集成了 **OpenAI API**，允许用户通过自然语言指令生成 SQL 查询。默认使用 `gpt-4.1` 模型，并支持在设置中自定义。

### **开发与构建 (DevOps)**

- **代码检查与格式化 (Linting & Formatting):** **Biome**，一个集成的工具链，用于代码格式化和静态分析。
- **持续集成/持续部署 (CI/CD):** **GitHub Actions**，用于自动化测试、版本标记和构建发布流程。
- **容器化 (Containerization):** 使用 `docker-compose.yml` 文件为本地开发环境提供 PostgreSQL, Redis, 和 ClickHouse 的容器化服务。
