# DbPaw 多语言支持实现指南

> 文档版本: 1.0  
> 创建时间: 2026-02-27  
> 目标版本: v0.2.0+

---

## 目录

1. [概述](#概述)
2. [技术方案](#技术方案)
3. [项目结构](#项目结构)
4. [实现步骤](#实现步骤)
5. [代码迁移指南](#代码迁移指南)
6. [翻译文件规范](#翻译文件规范)
7. [最佳实践](#最佳实践)
8. [常见问题](#常见问题)

---

## 概述

### 目标

为 DbPaw 桌面应用添加完整的多语言支持，优先实现中英双语，架构上支持扩展更多语言。

### 范围

| 范围 | 说明 |
|------|------|
| ✅ 包含 | 所有前端 UI 文本、Toast 通知、错误消息、Settings 设置项 |
| ⚠️ 部分包含 | Tauri 后端返回的错误（通过错误码映射） |
| ❌ 不包含 | 数据库原生错误、日志输出、调试信息 |

### 语言列表

| 语言代码 | 语言 | 优先级 |
|----------|------|--------|
| `en` | 英语 (默认) | P0 - 必须 |
| `zh` | 简体中文 | P0 - 必须 |
| `zh-TW` | 繁体中文 | P2 - 可选 |
| `ja` | 日语 | P3 - 未来 |

---

## 技术方案

### 选型: react-i18next

```
依赖包:
- i18next: ^23.x
- react-i18next: ^14.x
- i18next-browser-languagedetector: ^7.x (可选，用于检测系统语言)
```

### 选择理由

1. **生态成熟**: React 社区标准方案，维护活跃
2. **TypeScript 支持**: 完整的类型推导和自动补全
3. **功能丰富**: 
   - 插值表达式: `"Hello {{name}}"`
   - 复数规则: `"{{count}} item" / "{{count}} items"`
   - 命名空间: 按模块拆分翻译文件
   - 嵌套 key: `t('settings.appearance.theme')`
4. **与 Tauri 兼容**: 可在桌面环境中正常工作

### 替代方案对比

| 方案 | 优点 | 缺点 | 结论 |
|------|------|------|------|
| react-i18next | 成熟、功能全、社区大 | 包体积 ~15KB | ✅ 采用 |
| LinguiJS | 编译时提取、体积小 | 生态较小 | 备选 |
| FormatJS | 官方、格式标准 | 配置复杂 | 不推荐 |

---

## 项目结构

### 新增文件结构

```
src/
├── lib/
│   └── i18n/
│       ├── index.ts              # i18n 初始化配置
│       ├── types.ts              # TypeScript 类型定义
│       ├── helpers.ts            # 辅助函数（语言切换等）
│       └── locales/              # 翻译文件目录
│           ├── index.ts          # 导出所有语言
│           ├── en.ts             # 英文翻译（源文件）
│           ├── zh.ts             # 中文翻译
│           └── schemas/          # 翻译文件 JSON Schema（可选）
├── components/
│   └── settings/
│       └── LanguageSelector.tsx  # 语言选择器组件
└── hooks/
    └── useLanguage.ts            # 语言相关 Hook
```

### 需要修改的文件

```
src/
├── main.tsx                      # 引入 i18n 配置
├── App.tsx                       # 替换硬编码文本
├── components/
│   ├── settings/SettingsDialog.tsx
│   ├── business/Sidebar/ConnectionList.tsx
│   ├── business/Sidebar/AISidebar.tsx
│   ├── business/Sidebar/SavedQueriesList.tsx
│   ├── business/Editor/SqlEditor.tsx
│   ├── business/Editor/SaveQueryDialog.tsx
│   └── business/DataGrid/TableView.tsx
└── services/store.ts             # 添加 language 存储项
```

---

## 实现步骤

### Phase 1: 基础设施搭建 (2-3 小时)

#### 1.1 安装依赖

```bash
cd /Users/father/per/lea/jspro/nextdb/DbPaw
npm install i18next react-i18next
# 可选: 语言检测器
npm install i18next-browser-languagedetector
```

#### 1.2 创建 i18n 配置

**文件**: `src/lib/i18n/index.ts`

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { getSetting, saveSetting } from '@/services/store';

import { en } from './locales/en';
import { zh } from './locales/zh';

// 资源定义
const resources = {
  en: { translation: en },
  zh: { translation: zh },
};

// 初始化 i18n
i18n
  .use(LanguageDetector) // 自动检测浏览器/系统语言
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',    // 默认回退语言
    debug: import.meta.env.DEV,
    
    interpolation: {
      escapeValue: false, // React 已经做了 XSS 防护
    },
    
    detection: {
      // 语言检测顺序
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'dbpaw-language',
      caches: ['localStorage'],
    },
  });

// 监听语言变化，同步到 Tauri Store（用于持久化）
i18n.on('languageChanged', async (lng) => {
  try {
    await saveSetting('language', lng);
  } catch (e) {
    console.error('Failed to save language preference:', e);
  }
});

// 从 Tauri Store 恢复语言设置（覆盖检测到的语言）
export async function initLanguageFromStore() {
  try {
    const savedLang = await getSetting<string | null>('language', null);
    if (savedLang && savedLang !== i18n.language) {
      await i18n.changeLanguage(savedLang);
    }
  } catch (e) {
    console.error('Failed to load language preference:', e);
  }
}

export default i18n;

// 辅助函数：获取当前语言
export const getCurrentLanguage = () => i18n.language;

// 辅助函数：切换语言
export const changeLanguage = (lng: string) => i18n.changeLanguage(lng);

// 支持的语言列表
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '简体中文' },
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number]['code'];
```

#### 1.3 创建 TypeScript 类型定义

**文件**: `src/lib/i18n/types.ts`

```typescript
// 类型定义，用于类型安全的翻译 key
import { en } from './locales/en';

// 递归提取所有 key 路径
type RecursiveKeyOf<TObj extends object> = {
  [TKey in keyof TObj & (string | number)]: TObj[TKey] extends object
    ? `${TKey}` | `${TKey}.${RecursiveKeyOf<TObj[TKey]>}`
    : `${TKey}`;
}[keyof TObj & (string | number)];

// 导出翻译 key 类型
export type TranslationKey = RecursiveKeyOf<typeof en>;

// 命名空间类型（如果使用命名空间）
export type Namespace = 'common' | 'connection' | 'query' | 'table' | 'settings' | 'ai';
```

#### 1.4 创建英文翻译文件（源文件）

**文件**: `src/lib/i18n/locales/en.ts`

```typescript
// 英文翻译 - 作为其他语言的基准
export const en = {
  // 通用
  common: {
    appName: 'DbPaw',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    close: 'Close',
    refresh: 'Refresh',
    loading: 'Loading...',
    search: 'Search',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    copy: 'Copy',
    export: 'Export',
    import: 'Import',
    settings: 'Settings',
    unknown: 'Unknown',
    error: 'Error',
    success: 'Success',
    warning: 'Warning',
    info: 'Info',
    untitled: 'Untitled',
    optional: 'Optional',
    required: 'Required',
  },

  // 连接管理
  connection: {
    title: 'Connections',
    newConnection: 'New Connection',
    editConnection: 'Edit Connection',
    testConnection: 'Test Connection',
    connect: 'Connect',
    disconnect: 'Disconnect',
    noConnections: 'No connections yet',
    
    form: {
      driver: 'Database Type',
      name: 'Connection Name',
      host: 'Host',
      port: 'Port',
      database: 'Database',
      schema: 'Schema',
      username: 'Username',
      password: 'Password',
      ssl: 'SSL',
      ssh: 'SSH Tunnel',
      sshHost: 'SSH Host',
      sshPort: 'SSH Port',
      sshUsername: 'SSH Username',
      sshPassword: 'SSH Password',
      sshKeyPath: 'SSH Key Path',
      filePath: 'File Path',
    },
    
    validation: {
      required: 'Please fill in required fields: {{fields}}',
      testFirst: 'Please test the connection first',
    },
    
    messages: {
      connected: 'Connected to {{name}}',
      disconnected: 'Disconnected from {{name}}',
      testSuccess: 'Connection successful ({{latency}}ms)',
      testFailed: 'Connection failed: {{message}}',
      saveSuccess: 'Connection saved',
      deleteConfirm: 'Are you sure you want to delete connection "{{name}}"?',
      loadDatabasesFailed: 'Failed to load databases: {{message}}',
    },
  },

  // 查询编辑器
  query: {
    title: 'Query',
    newQuery: 'New Query',
    saveQuery: 'Save Query',
    execute: 'Run SQL',
    cancel: 'Cancel Query',
    format: 'Format SQL',
    clear: 'Clear Editor',
    savedQueries: 'Saved Queries',
    noSavedQueries: 'No saved queries',
    
    placeholders: {
      queryName: 'My Query',
      queryDescription: 'What does this query do?',
    },
    
    shortcuts: {
      execute: 'Cmd/Ctrl+Enter',
      format: 'Shift+Alt+F',
      save: 'Cmd/Ctrl+S',
    },
    
    result: {
      success: 'Execution successful ({{count}} row)',
      success_plural: 'Execution successful ({{count}} rows)',
      failed: 'Execution failed',
      executionTime: '{{time}}ms',
      noResults: 'Query executed successfully, no results returned',
    },
    
    messages: {
      saveSuccess: 'Query saved',
      unsavedConfirm: 'You have unsaved changes. Save before closing?',
      selectConnection: 'Please select a connection first',
      exportNoConnection: 'Please run query with a saved connection to export',
    },
  },

  // 数据表格
  table: {
    title: 'Table Data',
    viewDdl: 'View DDL',
    refresh: 'Refresh',
    filter: 'Filter',
    page: 'Page',
    pageSize: 'Rows per page',
    of: 'of',
    showing: 'Showing {{from}}-{{to}} of {{total}}',
    
    actions: {
      copyCell: 'Copy Cell',
      copyRow: 'Copy Row',
      copyColumn: 'Copy Column',
      exportPage: 'Export Current Page',
      exportFiltered: 'Export Filtered Result',
      exportFull: 'Export Full Table',
    },
    
    edit: {
      save: 'Save Changes',
      discard: 'Discard Changes',
      unsavedWarning: 'You have unsaved changes. Refreshing may discard your editing context. Continue?',
      saveSuccess: '{{count}} row(s) updated',
      saveFailed: 'Failed to save changes',
      readOnly: 'This table is read-only',
    },
    
    export: {
      csv: 'CSV',
      json: 'JSON',
      sql: 'SQL',
      completed: 'Export completed ({{count}} rows)',
      failed: 'Export failed',
    },
  },

  // AI 助手
  ai: {
    title: 'AI Assistant',
    newChat: 'New Chat',
    send: 'Send',
    placeholder: 'Ask me anything about your database...',
    thinking: 'Thinking...',
    
    status: {
      sending: 'Sending request...',
      waiting: 'Request sent ({{model}}), waiting for first token...',
      receiving: 'Receiving response...',
      finalizing: 'Finalizing response...',
    },
    
    errors: {
      noProvider: 'Please configure and select an AI provider in Settings',
      requestFailed: 'AI request failed',
      sendFailed: 'Failed to send AI message',
      loadConversationFailed: 'Failed to load conversation',
      deleteFailed: 'Failed to delete conversation',
    },
  },

  // 设置
  settings: {
    title: 'Settings',
    general: 'General',
    appearance: 'Appearance',
    ai: 'AI',
    about: 'About',
    
    language: {
      title: 'Language',
      description: 'Choose your preferred language',
    },
    
    theme: {
      title: 'Theme Mode',
      description: 'Choose your interface style',
      light: '☀️ Light Mode',
      dark: '🌙 Dark Mode',
      system: '🖥️ System',
    },
    
    fontSize: {
      title: 'Font Size',
      description: 'Adjust global text size across the app (Range: {{min}}-{{max}}px)',
    },
    
    accentColor: {
      title: 'Accent Color',
    },
    
    updates: {
      title: 'Updates',
      autoUpdate: 'Auto Update',
      autoUpdateDesc: 'Check for updates automatically',
      checkNow: 'Check for updates now',
      checking: 'Checking...',
      latest: 'You are on the latest version',
      newVersion: 'New version {{version}} available!',
      downloading: 'Downloading update...',
      installed: 'Update installed, restarting...',
    },
    
    aiProviders: {
      title: 'AI Providers',
      baseUrl: 'Base URL (OpenAI-compatible)',
      model: 'Model',
      apiKey: 'API Key',
      save: 'Save Provider',
      configured: 'Configured providers: {{count}}',
      default: 'Default',
      noProviders: 'No providers configured yet',
    },
    
    about: {
      version: 'Version',
      github: 'GitHub',
      tech: 'Tech Stack',
      license: 'License',
      platforms: 'Platforms',
      description: 'A modern database management tool providing a smooth development experience.',
    },
  },

  // 标签页
  tabs: {
    newTab: 'New Tab',
    closeTab: 'Close Tab',
    closeOthers: 'Close Others',
    closeAll: 'Close All',
    unsavedIndicator: 'Unsaved changes',
  },

  // 错误消息
  errors: {
    generic: 'An error occurred',
    network: 'Network error, please check your connection',
    timeout: 'Request timeout',
    unknown: 'Unknown error',
  },
} as const;

// 导出类型
export type Translations = typeof en;
```

#### 1.5 创建中文翻译文件

**文件**: `src/lib/i18n/locales/zh.ts`

```typescript
import { Translations } from './en';

export const zh: Translations = {
  common: {
    appName: 'DbPaw',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    close: '关闭',
    refresh: '刷新',
    loading: '加载中...',
    search: '搜索',
    confirm: '确认',
    back: '返回',
    next: '下一步',
    done: '完成',
    copy: '复制',
    export: '导出',
    import: '导入',
    settings: '设置',
    unknown: '未知',
    error: '错误',
    success: '成功',
    warning: '警告',
    info: '提示',
    untitled: '未命名',
    optional: '可选',
    required: '必填',
  },

  connection: {
    title: '连接管理',
    newConnection: '新建连接',
    editConnection: '编辑连接',
    testConnection: '测试连接',
    connect: '连接',
    disconnect: '断开连接',
    noConnections: '暂无连接',
    
    form: {
      driver: '数据库类型',
      name: '连接名称',
      host: '主机',
      port: '端口',
      database: '数据库',
      schema: 'Schema',
      username: '用户名',
      password: '密码',
      ssl: 'SSL',
      ssh: 'SSH 隧道',
      sshHost: 'SSH 主机',
      sshPort: 'SSH 端口',
      sshUsername: 'SSH 用户名',
      sshPassword: 'SSH 密码',
      sshKeyPath: 'SSH 密钥路径',
      filePath: '文件路径',
    },
    
    validation: {
      required: '请填写必填字段：{{fields}}',
      testFirst: '请先测试连接',
    },
    
    messages: {
      connected: '已连接到 {{name}}',
      disconnected: '已断开与 {{name}} 的连接',
      testSuccess: '连接成功 ({{latency}}ms)',
      testFailed: '连接失败：{{message}}',
      saveSuccess: '连接已保存',
      deleteConfirm: '确定要删除连接 "{{name}}" 吗？',
      loadDatabasesFailed: '加载数据库失败：{{message}}',
    },
  },

  query: {
    title: '查询',
    newQuery: '新建查询',
    saveQuery: '保存查询',
    execute: '执行 SQL',
    cancel: '取消查询',
    format: '格式化 SQL',
    clear: '清空编辑器',
    savedQueries: '已保存的查询',
    noSavedQueries: '暂无保存的查询',
    
    placeholders: {
      queryName: '我的查询',
      queryDescription: '这个查询用来做什么？',
    },
    
    shortcuts: {
      execute: 'Cmd/Ctrl+Enter',
      format: 'Shift+Alt+F',
      save: 'Cmd/Ctrl+S',
    },
    
    result: {
      success: '执行成功 ({{count}} 行)',
      success_plural: '执行成功 ({{count}} 行)',
      failed: '执行失败',
      executionTime: '{{time}}ms',
      noResults: '查询执行成功，未返回结果',
    },
    
    messages: {
      saveSuccess: '查询已保存',
      unsavedConfirm: '有未保存的更改，关闭前是否保存？',
      selectConnection: '请先选择连接',
      exportNoConnection: '需要使用已保存的连接才能导出结果',
    },
  },

  table: {
    title: '表数据',
    viewDdl: '查看 DDL',
    refresh: '刷新',
    filter: '过滤',
    page: '页',
    pageSize: '每页行数',
    of: '/',
    showing: '显示 {{from}}-{{to}} 条，共 {{total}} 条',
    
    actions: {
      copyCell: '复制单元格',
      copyRow: '复制行',
      copyColumn: '复制列',
      exportPage: '导出当前页',
      exportFiltered: '导出筛选结果',
      exportFull: '导出完整表',
    },
    
    edit: {
      save: '保存更改',
      discard: '放弃更改',
      unsavedWarning: '有未保存的更改，刷新可能会丢失编辑内容。是否继续？',
      saveSuccess: '已更新 {{count}} 行',
      saveFailed: '保存失败',
      readOnly: '此表为只读',
    },
    
    export: {
      csv: 'CSV',
      json: 'JSON',
      sql: 'SQL',
      completed: '导出完成 ({{count}} 行)',
      failed: '导出失败',
    },
  },

  ai: {
    title: 'AI 助手',
    newChat: '新对话',
    send: '发送',
    placeholder: '询问关于数据库的任何问题...',
    thinking: '思考中...',
    
    status: {
      sending: '发送请求中...',
      waiting: '请求已发送 ({{model}})，等待响应...',
      receiving: '接收响应中...',
      finalizing: '完成响应...',
    },
    
    errors: {
      noProvider: '请在设置中配置并选择 AI 提供商',
      requestFailed: 'AI 请求失败',
      sendFailed: '发送 AI 消息失败',
      loadConversationFailed: '加载对话失败',
      deleteFailed: '删除对话失败',
    },
  },

  settings: {
    title: '设置',
    general: '通用',
    appearance: '外观',
    ai: 'AI',
    about: '关于',
    
    language: {
      title: '语言',
      description: '选择您偏好的语言',
    },
    
    theme: {
      title: '主题模式',
      description: '选择界面风格',
      light: '☀️ 浅色模式',
      dark: '🌙 深色模式',
      system: '🖥️ 跟随系统',
    },
    
    fontSize: {
      title: '字体大小',
      description: '调整应用全局文字大小 (范围: {{min}}-{{max}}px)',
    },
    
    accentColor: {
      title: '主题色',
    },
    
    updates: {
      title: '更新',
      autoUpdate: '自动更新',
      autoUpdateDesc: '自动检查更新',
      checkNow: '立即检查更新',
      checking: '检查中...',
      latest: '当前已是最新版本',
      newVersion: '新版本 {{version}} 可用！',
      downloading: '正在下载更新...',
      installed: '更新已安装，正在重启...',
    },
    
    aiProviders: {
      title: 'AI 提供商',
      baseUrl: '基础 URL (OpenAI 兼容)',
      model: '模型',
      apiKey: 'API 密钥',
      save: '保存提供商',
      configured: '已配置提供商：{{count}}',
      default: '默认',
      noProviders: '尚未配置提供商',
    },
    
    about: {
      version: '版本',
      github: 'GitHub',
      tech: '技术栈',
      license: '许可证',
      platforms: '支持平台',
      description: '一款现代化的数据库管理工具，提供流畅的开发体验。',
    },
  },

  tabs: {
    newTab: '新建标签',
    closeTab: '关闭标签',
    closeOthers: '关闭其他',
    closeAll: '关闭全部',
    unsavedIndicator: '未保存的更改',
  },

  errors: {
    generic: '发生错误',
    network: '网络错误，请检查连接',
    timeout: '请求超时',
    unknown: '未知错误',
  },
};
```

#### 1.6 创建语言选择器组件

**文件**: `src/components/settings/LanguageSelector.tsx`

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SUPPORTED_LANGUAGES, changeLanguage, getCurrentLanguage } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

export function LanguageSelector() {
  const { t } = useTranslation();
  const currentLang = getCurrentLanguage();

  return (
    <div className="grid grid-cols-2 gap-4 items-center">
      <div className="space-y-1">
        <Label className="text-base">{t('settings.language.title')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('settings.language.description')}
        </p>
      </div>
      <Select value={currentLang} onValueChange={changeLanguage}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              {lang.nativeName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

#### 1.7 修改入口文件

**文件**: `src/main.tsx`

```typescript
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';

// 引入 i18n 配置（副作用初始化）
import './lib/i18n';
import { initLanguageFromStore } from './lib/i18n';

// 异步初始化语言设置
initLanguageFromStore().catch(console.error);

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme="system">
    <App />
    <Toaster />
  </ThemeProvider>
);
```

---

### Phase 2: 组件迁移 (逐步进行)

#### 2.1 迁移示例: ConnectionList

**原代码风格**:
```tsx
<h2 className="font-semibold text-sm">Connections</h2>
<Button>Test Connection</Button>
toast.error("Failed to load databases", { description: message });
```

**迁移后**:
```tsx
import { useTranslation } from 'react-i18next';

export function ConnectionList() {
  const { t } = useTranslation();
  
  return (
    <>
      <h2 className="font-semibold text-sm">{t('connection.title')}</h2>
      <Button>{t('connection.testConnection')}</Button>
    </>
  );
}

// Toast 使用
import i18n from '@/lib/i18n';
toast.error(i18n.t('connection.messages.loadDatabasesFailed', { message }));
```

#### 2.2 迁移示例: 带插值的动态文本

**原代码**:
```tsx
title={`Query (${databaseName})`}
toast.success(`Export completed (${result.rowCount} rows)`);
```

**迁移后**:
```tsx
title={t('query.titleWithDatabase', { name: databaseName })}
// 翻译文件: "titleWithDatabase": "Query ({{name}})",

toast.success(t('table.export.completed', { count: result.rowCount }));
// 翻译文件使用复数: "completed": "Export completed ({{count}} row)", "completed_plural": "Export completed ({{count}} rows)"
// 或者中文直接: "completed": "导出完成 ({{count}} 行)"
```

#### 2.3 迁移示例: SettingsDialog

**添加语言选择器到 General 标签页**:

在 `SettingsDialog.tsx` 的 General section 中添加:

```tsx
import { LanguageSelector } from '../LanguageSelector';

// 在 General section 的 JSX 中:
<div className="space-y-6">
  {/* ... 其他设置项 ... */}
  
  <div className="grid grid-cols-2 gap-4 items-center">
    <LanguageSelector />
  </div>
  
  {/* 分隔线 */}
  <Separator />
  
  {/* Appearance section */}
</div>
```

---

## 翻译文件规范

### Key 命名规范

```
模块.子模块.具体含义

示例:
- connection.title              # 连接模块标题
- connection.form.host          # 连接表单的主机字段
- connection.messages.saveSuccess  # 连接保存成功消息
- settings.theme.dark           # 设置-主题-深色
```

### 插值变量命名

```typescript
// ✅ 推荐：简洁明确的变量名
"hello": "Hello {{name}}"
"exportCompleted": "Export completed ({{count}} rows)"
"validationRequired": "Please fill in: {{fields}}"

// ❌ 避免：过于简短或不明确的命名
"hello": "Hello {{n}}"
"exportCompleted": "Export completed ({{c}} rows)"
```

### 复数处理

```typescript
// 英文使用 _plural 后缀
{
  "result": "{{count}} row",
  "result_plural": "{{count}} rows"
}

// 中文不需要复数形式
{
  "result": "{{count}} 行",
  // 不需要 result_plural
}
```

### 嵌套结构示例

```typescript
{
  "settings": {
    "title": "Settings",
    "appearance": {
      "title": "Appearance",
      "theme": {
        "title": "Theme",
        "light": "Light",
        "dark": "Dark"
      }
    }
  }
}
```

---

## 代码迁移指南

### 迁移优先级

1. **P0 - 核心界面** (先做)
   - Settings 设置页面
   - ConnectionList 连接列表
   - 通用按钮 (Save/Cancel/Delete)

2. **P1 - 主要功能** (其次)
   - SqlEditor 编辑器
   - TableView 数据表
   - AISidebar AI 助手

3. **P2 - 辅助功能** (最后)
   - Toast 通知消息
   - Tooltip 提示
   - 错误消息

### 常见替换模式

| 原代码 | 替换为 | 说明 |
|--------|--------|------|
| `"Save"` | `t('common.save')` | 通用词汇使用 common 命名空间 |
| `"Query (${db})"` | `t('query.titleWithDb', {db})` | 插值 |
| `toast.success("Saved")` | `toast.success(t('common.save'))` | Toast 也需要翻译 |
| `aria-label="Close"` | `aria-label={t('common.close')}` | 无障碍属性 |
| `placeholder="Search"` | `placeholder={t('common.search')}` | 占位符 |

### 组件迁移检查清单

迁移每个组件时，检查以下位置：

- [ ] JSX 文本节点 `<div>Text</div>`
- [ ] Button 标签 `<Button>Save</Button>`
- [ ] Label 文本 `<Label>Host</Label>`
- [ ] Placeholder `<Input placeholder="..." />`
- [ ] Title 属性 `title="..."`
- [ ] Aria 标签 `aria-label="..."`
- [ ] Toast 消息 `toast.success/error/info("...")`
- [ ] Alert/Confirm 文本 `alert("...")`, `confirm("...")`
- [ ] 动态拼接的字符串 `\`${x} rows\``

---

## 最佳实践

### 1. 延迟加载翻译文件（未来优化）

当前所有语言打包在一起，未来可考虑按需加载：

```typescript
// 动态导入
const loadLocale = (lng: string) => {
  return import(`./locales/${lng}.ts`).then((module) => module.default);
};

i18n.use({
  type: 'backend',
  read: (language: string, namespace: string, callback: Function) => {
    loadLocale(language)
      .then((resources) => callback(null, resources))
      .catch((error) => callback(error, null));
  },
});
```

### 2. 开发时调试

```typescript
// 在 i18n init 配置中开启 debug
{
  debug: import.meta.env.DEV, // 开发环境显示缺失 key 的警告
}
```

### 3. 缺失 key 的处理

```typescript
// 添加缺失 key 的回退显示
const { t } = useTranslation();

// 如果 key 不存在，显示 key 名本身便于调试
t('some.missing.key'); // 输出: "some.missing.key"
```

### 4. 翻译文件验证

```typescript
// 可以添加简单的类型检查确保中英 key 一致
import { en } from './en';
import { zh } from './zh';

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// 验证中文包含所有英文 key
const _zhCheck: DeepPartial<typeof en> = zh;
```

---

## 常见问题

### Q1: 如何处理 Tauri 后端返回的错误？

**方案**: 错误码映射

```typescript
// src/lib/i18n/errorCodes.ts
const ERROR_CODES = {
  'CONN_TIMEOUT': 'errors.connectionTimeout',
  'AUTH_FAILED': 'errors.authenticationFailed',
  'DB_NOT_FOUND': 'errors.databaseNotFound',
} as const;

// 后端返回结构
interface ApiError {
  code: keyof typeof ERROR_CODES;
  message: string; // 原始英文，用于调试
}

// 前端显示
function showError(error: ApiError) {
  const key = ERROR_CODES[error.code] || 'errors.generic';
  toast.error(t(key));
}
```

### Q2: 日期、数字、货币格式化？

使用 `react-i18next` 配合 `Intl` API：

```typescript
const { i18n } = useTranslation();

// 日期
new Intl.DateTimeFormat(i18n.language).format(date);

// 数字
new Intl.NumberFormat(i18n.language).format(count);
```

### Q3: 如何添加新语言？

1. 在 `src/lib/i18n/locales/` 创建新文件 `ja.ts`
2. 复制 `en.ts` 结构并翻译
3. 在 `src/lib/i18n/index.ts` 的 `resources` 中添加
4. 在 `SUPPORTED_LANGUAGES` 中添加语言选项

### Q4: 切换语言后界面不更新？

确保：
1. 组件使用了 `useTranslation()` hook
2. 不是在组件外调用的 `t()` 函数
3. 对于 Toast 等外部调用，需要重新触发或手动刷新

---

## 附录

### 依赖版本

```json
{
  "i18next": "^23.15.0",
  "react-i18next": "^14.0.0",
  "i18next-browser-languagedetector": "^7.2.0"
}
```

### 相关链接

- [react-i18next 文档](https://react.i18next.com/)
- [i18next 官方文档](https://www.i18next.com/)
- [i18next 复数规则](https://www.i18next.com/translation-function/plurals)
- [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

---

## 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| 1.0 | 2026-02-27 | 初始版本，完成基础设施设计和示例代码 |

