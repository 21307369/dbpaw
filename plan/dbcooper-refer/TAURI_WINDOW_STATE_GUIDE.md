# Tauri 窗口状态保存指南

使用官方 `tauri-plugin-window-state` 插件自动保存和恢复窗口大小、位置、最大化状态等。

## 功能特性

- ✅ 自动保存窗口大小和位置
- ✅ 保存最大化/全屏状态
- ✅ 多窗口支持（每个窗口独立保存）
- ✅ 跨平台支持（Windows、macOS、Linux）
- ✅ 零配置开箱即用
- ✅ 可排除特定状态的保存

## 安装步骤

### 1. 添加 Rust 依赖

```bash
cd src-tauri
cargo add tauri-plugin-window-state
```

或手动在 `Cargo.toml` 中添加：

```toml
[dependencies]
tauri-plugin-window-state = "2"
```

### 2. 注册插件

在 `src-tauri/src/lib.rs` 中注册插件：

```rust
.use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        // 添加窗口状态插件
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            // ... 现有代码
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ... 现有 handlers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. 前端 API（可选）

如果需要在前端手动控制窗口状态，安装 JS/TS API：

```bash
npm install @tauri-apps/plugin-window-state
# 或
yarn add @tauri-apps/plugin-window-state
# 或
bun add @tauri-apps/plugin-window-state
```

## 基础使用

### 自动保存（推荐）

插件注册后，窗口状态会自动保存到：

- **Windows**: `%APPDATA%/<app-identifier>/window-state.json`
- **macOS**: `~/Library/Application Support/<app-identifier>/window-state.json`
- **Linux**: `~/.config/<app-identifier>/window-state.json`

下次启动应用时，窗口会自动恢复到上次关闭时的位置和大小。

### 手动控制

如果需要在前端手动操作：

```typescript
import { saveWindowState, restoreState } from '@tauri-apps/plugin-window-state';

// 手动保存当前窗口状态
await saveWindowState();

// 手动恢复窗口状态
await restoreState();
```

## 高级配置

### 排除特定状态的保存

如果某些窗口状态不需要保存：

```rust
.plugin(
    tauri_plugin_window_state::Builder::default()
        .with_state_flags(
            StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
            // 不保存全屏状态
        )
        .build()
)
```

可用的状态标志：
- `StateFlags::SIZE` - 窗口大小
- `StateFlags::POSITION` - 窗口位置
- `StateFlags::MAXIMIZED` - 最大化状态
- `StateFlags::VISIBLE` - 可见性
- `StateFlags::DECORATIONS` - 装饰（边框）
- `StateFlags::FULLSCREEN` - 全屏状态
- `StateFlags::ALL` - 所有状态

### 多窗口支持

插件会自动为每个窗口标签（label）保存独立的状态文件。

```rust
// 在主窗口
tauri::WindowBuilder::new(
    &app,
    "main", // label
    tauri::WindowUrl::App("index.html".into())
)
.build()?;

// 在设置窗口
tauri::WindowBuilder::new(
    &app,
    "settings", // label
    tauri::WindowUrl::App("settings.html".into())
)
.build()?;
```

每个窗口会分别保存为 `window-state-main.json` 和 `window-state-settings.json`。

### 自定义保存路径

默认保存在应用数据目录，可以自定义：

```rust
use std::path::PathBuf;

.plugin(
    tauri_plugin_window_state::Builder::default()
        .with_state_save_path(|app| {
            // 自定义路径
            PathBuf::from("/custom/path/window-state.json")
        })
        .build()
)
```

## 与现有设置系统整合

如果你已经有一个设置系统（如 dbcooper 的 SQLite 设置表），可以选择：

### 方案 1：继续使用插件（推荐）

插件专门处理窗口状态，你的设置系统处理业务配置，两者并行不冲突。

### 方案 2：禁用自动保存，手动控制

```rust
.plugin(
    tauri_plugin_window_state::Builder::default()
        .with_auto_save(false) // 禁用自动保存
        .build()
)
```

然后在应用关闭时手动保存到你的数据库：

```rust
// 在应用退出时
.app_handle()
.run(|_app_handle, event| match event {
    tauri::RunEvent::ExitRequested { .. } => {
        // 获取窗口状态并保存到数据库
        let window = app_handle.get_webview_window("main").unwrap();
        let size = window.inner_size().unwrap();
        let position = window.inner_position().unwrap();
        
        // 保存到 SQLite
        // ...
    }
    _ => {}
});
```

## 迁移现有项目

如果你已经有硬编码的窗口大小，逐步迁移：

1. **保留 tauri.conf.json 中的默认值**作为首次启动的fallback：
```json
{
  "windows": [{
    "width": 1280,
    "height": 800
  }]
}
```

2. **插件会在首次启动后创建状态文件**

3. **后续启动优先使用状态文件中的值**

## 故障排除

### 窗口没有恢复

1. 检查插件是否正确注册
2. 查看应用数据目录是否有 `window-state.json` 文件
3. 确保窗口 label 一致（默认是 "main"）

### 多显示器问题

如果窗口上次在副显示器关闭，而该显示器现在不可用：

```rust
.plugin(
    tauri_plugin_window_state::Builder::default()
        .skip_initial_state_restore_on_displays_change(true)
        .build()
)
```

### 清除保存的状态

删除状态文件即可重置：

```bash
# macOS
rm ~/Library/Application Support/com.yourapp.identifier/window-state.json

# Windows
rd /s /q "%APPDATA%\YourApp\window-state.json"

# Linux
rm ~/.config/your-app/window-state.json
```

## 最佳实践

1. **首次启动使用合理的默认值** - 在 tauri.conf.json 中设置
2. **允许用户重置窗口** - 提供"重置窗口位置"菜单项
3. **考虑多显示器场景** - 使用 `skip_initial_state_restore_on_displays_change`
4. **不要和手动 resize 冲突** - 选择自动或手动，不要混用

## 示例代码

完整的 `lib.rs` 示例：

```rust
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        // 窗口状态插件 - 自动保存大小、位置、最大化状态
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
                )
                .build()
        )
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            // 初始化数据库
            let rt = tokio::runtime::Runtime::new()
                .expect("Failed to create Tokio runtime");
            let pool = rt
                .block_on(db::init_pool())
                .expect("Failed to initialize database");
            app.manage(pool);

            // 初始化连接池管理器
            app.manage(PoolManager::new());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // ... 你的 handlers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 参考

- [官方文档](https://tauri.app/plugin/window-state/)
- [GitHub 仓库](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/window-state)
- [API 文档](https://docs.rs/tauri-plugin-window-state/latest/tauri_plugin_window_state/)
