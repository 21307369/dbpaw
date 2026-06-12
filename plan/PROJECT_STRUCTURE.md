# DbPaw 项目文件结构

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
│   │   ├── 128x128@2x.png
│   │   ├── 32x32.png
│   │   ├── icon.icns
│   │   ├── icon.ico
│   │   ├── icon.png
│   │   ├── Square107x107Logo.png
│   │   ├── Square142x142Logo.png
│   │   ├── Square150x150Logo.png
│   │   ├── Square284x284Logo.png
│   │   ├── Square30x30Logo.png
│   │   ├── Square310x310Logo.png
│   │   ├── Square44x44Logo.png
│   │   ├── Square71x71Logo.png
│   │   ├── Square89x89Logo.png
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

## 项目概述

**DbPaw** 是一个基于 **Tauri + React + TypeScript** 构建的数据库管理工具。

### 技术栈

- **前端**: React 18 + TypeScript + Vite + Tailwind CSS
- **后端**: Rust (Tauri 框架)
- **UI 组件**: shadcn/ui
- **状态管理**: Zustand (store.ts)
- **构建工具**: Vite + Cargo

### 目录说明

- `src/` - 前端 React 应用代码
  - `components/business/` - 业务组件（数据表格、编辑器、侧边栏等）
  - `components/ui/` - shadcn/ui 基础组件库
  - `services/` - API 服务和状态管理
  - `styles/` - CSS 样式文件
- `src-tauri/` - 后端 Rust 代码
  - `src/commands/` - Tauri 命令处理
  - `src/db/` - 数据库驱动和连接池
  - `src/models/` - 数据模型定义
- `public/` - 静态资源文件
