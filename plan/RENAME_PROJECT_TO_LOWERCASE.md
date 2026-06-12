# DbPaw → dbpaw 项目改名方案

> 文档创建时间：2026-02-24  
> 状态：待执行 / 仅供参考

---

## 1. 现状分析

当前项目处于**混合命名状态**：

| 场景 | 当前命名 | 说明 |
|------|----------|------|
| 显示名称（应用标题、菜单栏） | `DbPaw` | Tauri 的 `productName` 和 `title` |
| npm 包名 | `dbpaw` | 已经是小写 |
| Cargo 包名 | `dbpaw` | 已经是小写 |
| GitHub 仓库 | `DbPaw` | 需要决定是否修改 |

### 1.1 命名规范对照

- ✅ **JavaScript/npm 生态**：包名必须小写，`dbpaw` 符合规范
- ✅ **Rust/Cargo 生态**：包名建议使用小写下划线，`dbpaw` 符合规范
- ⚠️ **Tauri 桌面应用**：`productName` 是用户可见的显示名称，通常首字母大写
- ⚠️ **GitHub 仓库名**：大小写不敏感，但 URL 会保留你设定的大小写

---

## 2. 改名利弊分析

### 2.1 保持 `DbPaw`（现状）

| 优点 | 缺点 |
|------|------|
| 品牌识别度高，"Db"+"Paw"语义清晰 | GitHub URL 包含大写字母，不够规范 |
| 桌面应用菜单栏显示更专业 | 与内部包名不一致 |
| 无需任何改动 | 用户在命令行 clone 时可能输入不一致 |

### 2.2 改为全小写 `dbpaw`

| 优点 | 缺点 |
|------|------|
| 完全符合开源项目命名惯例 | 牺牲品牌辨识度 |
| 仓库名、包名、命令行完全一致 | 应用显示名称变平淡（`dbpaw` vs `DbPaw`）|
| 终端输入更方便（无需 Shift）| 需要一次性修改多处代码 |
| | 可能影响已发布版本的自动更新 |

---

## 3. 需要改动的文件清单

如果决定将 GitHub 仓库名改为 `dbpaw`，以下文件**必须**同步修改：

### 3.1 🔴 关键文件（影响功能）

| 文件路径 | 当前内容 | 说明 |
|----------|----------|------|
| `src-tauri/tauri.conf.json` | `https://github.com/codeErrorSleep/DbPaw/releases/...` | ⚠️ **自动更新功能依赖此 URL** |

### 3.2 🟡 文档文件（影响用户体验）

| 文件路径 | 处数 | 内容示例 |
|----------|------|----------|
| `README.md` | 4 处 | Badge 链接、Release 链接、clone 命令 |
| `README_CN.md` | 4 处 | 同上（中文文档）|

### 3.3 🟢 可选文件（显示名称）

| 文件路径 | 当前内容 | 说明 |
|----------|----------|------|
| `src-tauri/tauri.conf.json` | `"productName": "DbPaw"` | 应用显示名称（菜单栏、Dock）|
| `src-tauri/tauri.conf.json` | `"title": "DbPaw"` | 窗口标题 |
| `index.html` | `<title>DbPaw</title>` | 浏览器标签页标题 |
| `src/App.tsx` | `alt="DbPaw"`、`DbPaw` 文字 | Logo 和侧边栏显示 |
| `src/components/settings/SettingsDialog.tsx` | `DbPaw` | 设置页面的应用名称 |

### 3.4 📊 统计

- **必须修改**：1 个文件（1 处）
- **建议修改**：2 个文件（8 处）
- **可选修改**：4 个文件（5 处）
- **总计**：7 个文件，约 14 处改动

---

## 4. 操作步骤

### 4.1 完整改名方案（推荐）

```bash
# 步骤 1：确保本地工作目录干净
git status

# 步骤 2：创建改名分支（可选但推荐）
git checkout -b rename/dbpaw-lowercase

# 步骤 3：修改代码文件（详见第 5 节文件清单）
# ... 手动或使用替换工具 ...

# 步骤 4：提交修改
git add .
git commit -m "chore: rename project to lowercase dbpaw

- Update GitHub URLs in README files
- Update updater endpoint in tauri.conf.json
- Update display names to lowercase"

# 步骤 5：推送分支
git push origin rename/dbpaw-lowercase

# 步骤 6：在 GitHub 网页上修改仓库名
# Settings → General → Repository name → dbpaw → Rename

# 步骤 7：更新本地 remote URL
git remote set-url origin https://github.com/codeErrorSleep/dbpaw.git

# 步骤 8：验证
git remote -v
```

### 4.2 最小改动方案（快速修复）

如果只想修复自动更新功能，同时让仓库名规范化：

```bash
# 只做步骤 6 和步骤 7（GitHub 仓库改名 + 更新 remote）
# 然后只修改最关键的文件：
```

**只改 1 个文件**：`src-tauri/tauri.conf.json`

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/codeErrorSleep/dbpaw/releases/latest/download/latest.json"
      ]
    }
  }
}
```

> 注：README 中的链接因为有 GitHub 自动重定向，可以暂时不改。

---

## 5. 详细文件修改内容

### 5.1 src-tauri/tauri.conf.json

```diff
{
  "$schema": "https://schema.tauri.app/config/2",
- "productName": "DbPaw",
+ "productName": "dbpaw",
  "version": "0.1.0",
  "identifier": "com.father.dbpaw",
  ...
  "plugins": {
    "updater": {
      "endpoints": [
-       "https://github.com/codeErrorSleep/DbPaw/releases/latest/download/latest.json"
+       "https://github.com/codeErrorSleep/dbpaw/releases/latest/download/latest.json"
      ]
    }
  },
  "app": {
    "windows": [
      {
-       "title": "DbPaw",
+       "title": "dbpaw",
        ...
      }
    ]
  }
}
```

### 5.2 README.md（示例）

```diff
- # DbPaw
+ # dbpaw

- ![DbPaw Logo](public/product-icon.png)
+ ![dbpaw Logo](public/product-icon.png)

- [![Release](https://img.shields.io/github/v/release/username/DbPaw?style=flat-square)](https://github.com/username/DbPaw/releases)
+ [![Release](https://img.shields.io/github/v/release/codeErrorSleep/dbpaw?style=flat-square)](https://github.com/codeErrorSleep/dbpaw/releases)

- **DbPaw** is a lightweight...
+ **dbpaw** is a lightweight...

- Go to the [Releases](https://github.com/username/DbPaw/releases) page...
+ Go to the [Releases](https://github.com/codeErrorSleep/dbpaw/releases) page...

- git clone https://github.com/username/DbPaw.git
- cd DbPaw
+ git clone https://github.com/codeErrorSleep/dbpaw.git
+ cd dbpaw

- If you encounter a "DbPaw is damaged"...
+ If you encounter a "dbpaw is damaged"...

- sudo xattr -d com.apple.quarantine /Applications/DbPaw.app
+ sudo xattr -d com.apple.quarantine /Applications/dbpaw.app
```

> 注：`README_CN.md` 修改内容类似。

### 5.3 index.html

```diff
- <title>DbPaw</title>
+ <title>dbpaw</title>
```

### 5.4 src/App.tsx

```diff
- alt="DbPaw"
+ alt="dbpaw"

- <span className="font-semibold text-sm">DbPaw</span>
+ <span className="font-semibold text-sm">dbpaw</span>
```

### 5.5 src/components/settings/SettingsDialog.tsx

```diff
- <span className="font-medium">DbPaw</span>
+ <span className="font-medium">dbpaw</span>
```

---

## 6. 风险评估

### 6.1 GitHub 自动重定向

GitHub 在仓库改名后会提供**临时自动重定向**：

- ✅ `github.com/codeErrorSleep/DbPaw` → `github.com/codeErrorSleep/dbpaw`
- ✅ git clone/pull/push 仍然可用
- ⏳ 重定向有效期：不确定，建议尽快更新所有链接

### 6.2 自动更新功能

| 场景 | 影响 |
|------|------|
| 旧版本用户检查更新 | 如果 `tauri.conf.json` 未改，更新检查会失败 |
| 已安装应用 | 应用数据存储路径依赖 `identifier`（`com.father.dbpaw`），不受影响 |
| 新安装应用 | 正常 |

### 6.3 已发布 Release

- GitHub Release 页面链接会随仓库名改变
- 旧链接通过重定向可访问
- Badge（版本标签）可能需要刷新缓存

---

## 7. 决策建议

### 7.1 如果决定改名

**推荐执行顺序：**

1. 先修改代码（创建 PR）
2. 合并 PR 后，再修改 GitHub 仓库名
3. 更新本地 remote URL
4. 发布新版本验证自动更新

### 7.2 如果暂时不改名

至少修复 `tauri.conf.json` 中的 GitHub 用户名：

```json
"endpoints": [
  "https://github.com/codeErrorSleep/DbPaw/releases/latest/download/latest.json"
]
```

> 当前 README 里写的是 `username/DbPaw`，而 tauri.conf.json 写的是 `codeErrorSleep/DbPaw`，两者不一致应该修复。

---

## 8. 附录

### 8.1 快速检查清单

改名前确认：

- [ ] 已备份重要分支
- [ ] 本地没有未提交的改动
- [ ] 已通知团队成员（如有）
- [ ] 已准备好发布新版本（用于验证自动更新）

改名后验证：

- [ ] `git remote -v` 显示新地址
- [ ] 可以正常 push/pull
- [ ] GitHub Release 页面可访问
- [ ] Badge 显示正常
- [ ] 应用自动更新功能正常

### 8.2 相关链接

- [GitHub 文档：重命名仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
- [Tauri 自动更新文档](https://tauri.app/plugin/updater/)
- [Cargo 包命名规范](https://doc.rust-lang.org/cargo/reference/manifest.html#the-name-field)
- [npm 包命名规范](https://docs.npmjs.com/cli/v10/configuring-npm/package-json#name)

---

*本文档由 AI 助手生成，请根据实际情况调整。*
