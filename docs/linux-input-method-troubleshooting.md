# Linux 输入法问题排查指南

## 问题描述

在 Linux 系统（特别是 Hyprland + Wayland 环境）下使用 fcitx5 输入法框架时，AppImage 版本的应用可能无法在输入框中输入任何文字。

### 受影响环境

- **操作系统**: Linux (如 CachyOS, Arch Linux, Ubuntu 等)
- **桌面环境**: Hyprland, Sway 等 Wayland 合成器
- **输入法框架**: fcitx5
- **打包方式**: AppImage

## 问题原因

Tauri 应用在 Linux 上使用 WebKitGTK 作为渲染引擎，依赖 GTK 的输入法模块。在 Wayland 环境下，输入法的工作方式与传统 X11 不同：

| 因素 | 说明 |
|------|------|
| **Tauri Linux 后端** | 使用 WebKitGTK 作为渲染引擎，依赖 GTK 的输入法模块 |
| **Wayland 协议** | Wayland 合成器的输入法协议与传统 X11 不同 |
| **fcitx5** | 在 Wayland 下需要特殊配置才能与 GTK 应用兼容 |
| **AppImage 打包** | 不自动继承系统环境变量，需要单独配置 |

### 相关上游问题

- [Tauri Issue #8264](https://github.com/tauri-apps/tauri/issues/8264): Input Method does not work properly (仍为 Open 状态)

## 解决方案

### 方案一：命令行注入环境变量（临时测试）

启动 AppImage 时注入必要的环境变量：

```bash
env GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx ./DbPaw_x.x.x_amd64.AppImage
```

### 方案二：Hyprland 全局配置

在 Hyprland 配置文件中设置全局环境变量：

```bash
# 编辑 ~/.config/hypr/hyprland.conf
# 添加以下内容：

env = GTK_IM_MODULE,fcitx
env = QT_IM_MODULE,fcitx
env = XMODIFIERS,@im=fcitx
env = SDL_IM_MODULE,fcitx
```

修改后重启 Hyprland 或重新登录。

### 方案三：GTK 配置文件（推荐长期使用）

根据 fcitx5 官方文档，推荐使用配置文件而非环境变量：

```bash
# GTK3 配置
mkdir -p ~/.config/gtk-3.0
echo -e "[Settings]\ngtk-im-module=fcitx" >> ~/.config/gtk-3.0/settings.ini

# GTK4 配置
mkdir -p ~/.config/gtk-4.0
echo -e "[Settings]\ngtk-im-module=fcitx" >> ~/.config/gtk-4.0/settings.ini
```

### 方案四：创建桌面快捷方式

创建一个 .desktop 文件来正确启动应用：

```bash
# 创建本地应用目录
mkdir -p ~/.local/share/applications

# 创建 desktop 文件
cat > ~/.local/share/applications/dbpaw.desktop << 'EOF'
[Desktop Entry]
Name=DbPaw
Comment=Database Management Tool
Exec=env GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx /path/to/DbPaw_x.x.x_amd64.AppImage %U
Icon=dbpaw
Type=Application
Categories=Development;Database;
EOF
```

记得将 `/path/to/DbPaw_x.x.x_amd64.AppImage` 替换为实际的 AppImage 路径。

## 环境变量说明

| 变量 | 说明 |
|------|------|
| `GTK_IM_MODULE=fcitx` | 指定 GTK 应用使用的输入法模块 |
| `QT_IM_MODULE=fcitx` | 指定 Qt 应用使用的输入法模块 |
| `XMODIFIERS=@im=fcitx` | X11 输入法修饰符，XWayland 应用需要 |
| `SDL_IM_MODULE=fcitx` | SDL2 应用程序需要的输入法模块 |

## 不同桌面环境的配置

### KDE Plasma (推荐)

KDE Plasma 5.27+ 对 fcitx5 有最佳支持：

```bash
# 只需设置
XMODIFIERS=@im=fcitx

# 其他变量通过系统设置配置：
# 系统设置 → 虚拟键盘 → 选择 Fcitx 5
```

### GNOME

```bash
# 需要设置
XMODIFIERS=@im=fcitx
QT_IM_MODULE=fcitx

# 额外配置（使用 ibus 前端）
gsettings set org.gnome.settings-daemon.plugins.xsettings overrides "{'Gtk/IMModule':<'fcitx'>}"
```

### Sway

```bash
# 需要设置
XMODIFIERS=@im=fcitx
QT_IM_MODULE=fcitx
GTK_IM_MODULE=fcitx  # 可选
```

## 故障排查步骤

1. **检查 fcitx5 是否正常运行**
   ```bash
   ps aux | grep fcitx5
   ```

2. **检查环境变量**
   ```bash
   echo $GTK_IM_MODULE
   echo $QT_IM_MODULE
   echo $XMODIFIERS
   ```

3. **运行 fcitx5 诊断**
   ```bash
   fcitx5-diagnose
   ```

4. **测试简单 GTK 应用**
   ```bash
   env GTK_IM_MODULE=fcitx gedit
   ```
   如果 gedit 可以输入中文，说明 fcitx5 本身正常工作。

5. **查看应用日志**
   ```bash
   ./DbPaw_x.x.x_amd64.AppImage 2>&1 | tee dbpaw.log
   ```

## 问题二：输入文字后不显示，需调整窗口大小才出现

### 问题描述

设置环境变量后，输入法可以正常输入，但输入的文字不立即显示。每次输入后都需要调整窗口大小，文字才会出现。

### 问题原因

这是 **WebKitGTK 在 Wayland 下的渲染刷新问题**。fcitx5 通过 GTK 输入法模块向 WebKitGTK 提交文本后，WebKitGTK 没有正确触发 Web 内容的重绘。

**技术链分析**：
```
fcitx5 → GTK IM Module → WebKitGTK (Wayland backend) → 未触发 damage region 更新 → 文字不可见
```

调整窗口大小会强制 WebKit 重新渲染整个 surface，所以文字才显示出来。

### 相关上游问题

- [WebKit Bug #261795](https://bugs.webkit.org/show_bug.cgi?id=261795): IME input does not trigger repaint in Wayland
- [Tauri Issue #8264](https://github.com/tauri-apps/tauri/issues/8264): Input Method does not work properly

### 解决方案

#### 方案一：使用 XWayland 模式（推荐）

强制应用使用 X11 后端而非原生 Wayland：

```bash
env GDK_BACKEND=x11 GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx ./DbPaw_x.x.x_amd64.AppImage
```

#### 方案二：Hyprland 窗口规则

在 `~/.config/hypr/hyprland.conf` 中添加窗口规则，强制 DbPaw 使用 XWayland：

```bash
# 强制 DbPaw 使用 XWayland
windowrulev2 = xwaylandforce, class:^(DbPaw)$
```

或者通过标题匹配：

```bash
windowrulev2 = xwaylandforce, title:^(DbPaw)$
```

修改后重新加载配置：
```bash
hyprctl reload
```

#### 方案三：禁用 WebKit 合成模式

尝试禁用 WebKit 的合成模式（可能影响性能）：

```bash
env WEBKIT_DISABLE_COMPOSITING_MODE=1 GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx ./DbPaw_x.x.x_amd64.AppImage
```

#### 方案四：更新桌面快捷方式

更新 `.desktop` 文件使用 X11 后端：

```bash
cat > ~/.local/share/applications/dbpaw.desktop << 'EOF'
[Desktop Entry]
Name=DbPaw
Comment=Database Management Tool
Exec=env GDK_BACKEND=x11 GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx /path/to/DbPaw_x.x.x_amd64.AppImage %U
Icon=dbpaw
Type=Application
Categories=Development;Database;
EOF
```

### 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| `GDK_BACKEND=x11` | 完全解决问题，简单直接 | 使用 XWayland 而非原生 Wayland |
| Hyprland 窗口规则 | 一次配置永久生效 | 仅限 Hyprland 用户 |
| 禁用合成模式 | 保持 Wayland 原生 | 可能影响性能，不一定有效 |

**推荐**：使用 `GDK_BACKEND=x11` 方案，这是目前最可靠的解决方案。

## 参考资料

- [Fcitx5 官方文档 - Wayland 支持](https://fcitx-im.org/wiki/Using_Fcitx_5_on_Wayland/zh-cn)
- [ArchWiki - Fcitx5](https://wiki.archlinux.org.cn/title/Fcitx5)
- [Tauri Issue #8264](https://github.com/tauri-apps/tauri/issues/8264)
- [WebKit Bug #261795](https://bugs.webkit.org/show_bug.cgi?id=261795)
