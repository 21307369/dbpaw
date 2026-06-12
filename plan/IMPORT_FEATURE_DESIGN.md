# DbPaw 导入 INSERT SQL 文件功能设计文档

> 文档创建日期: 2026-02-27  
> 功能目标: 实现 INSERT SQL 文件的导入功能

---

## 目录

1. [功能概述](#一功能概述)
2. [整体架构](#二整体架构)
3. [数据流设计](#三数据流设计)
4. [核心模块设计](#四核心模块设计)
5. [API 设计](#五api-设计)
6. [技术实现细节](#六技术实现细节)
7. [实现步骤](#七实现步骤)
8. [风险评估](#八风险评估)

---

## 一、功能概述

### 1.1 核心目标

允许用户选择一个包含 INSERT 语句的 SQL 文件，将其中的数据导入到指定的数据库表中。

### 1.2 功能边界

| 支持功能 | 暂不考虑 |
|---------|---------|
| 标准 INSERT INTO ... VALUES ... 语句 | CREATE TABLE / DROP TABLE 等 DDL |
| 多行 VALUES (批量插入) | 存储过程、触发器等复杂 SQL |
| 不同数据库方言的语法差异 | 二进制数据导入 |
| 导入进度显示和错误处理 | 事务回滚（可选增强） |

### 1.3 用户场景

1. **数据迁移**: 从其他数据库导出 INSERT SQL，导入到当前数据库
2. **测试数据初始化**: 快速导入测试数据集
3. **数据恢复**: 从 SQL 备份文件恢复部分数据

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  1. 文件选择 (Tauri Dialog API)                                   │
│  2. 解析预览 (显示前 N 条语句预览)                                 │
│  3. 导入配置 (目标表映射、冲突处理策略)                            │
│  4. 执行导入 (调用 Rust 命令)                                     │
│  5. 进度展示 (实时显示导入进度、成功/失败统计)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend (Rust)                           │
├─────────────────────────────────────────────────────────────────┤
│  1. 文件读取 (流式读取大文件)                                     │
│  2. SQL 解析 (提取 INSERT 语句，分割批量 VALUES)                  │
│  3. 语句执行 (使用现有 driver.execute_query 或批量执行)           │
│  4. 事务管理 (可选：每 N 条提交一次，失败回滚)                     │
│  5. 进度上报 (通过 Tauri Event 发送到前端)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、数据流设计

```
用户选择 SQL 文件
    │
    ▼
┌─────────────────┐
│  预解析阶段      │  ← 读取文件前 100KB，分析表名、预估行数
│  (Parse Preview)│
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  确认配置        │  ← 选择目标 Schema/Table，冲突策略
│  (Config Dialog)│
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  执行导入        │  ← 流式读取，分批次执行
│  (Execute)      │
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  结果报告        │  ← 成功数、失败数、错误详情
│  (Report)       │
└─────────────────┘
```

### 3.1 状态流转

```
[空闲] → [选择文件] → [预解析中] → [配置确认]
                                  ↓
                              [导入中] → [暂停]
                                  ↓
                          [完成/失败]
```

---

## 四、核心模块设计

### 4.1 前端模块

| 模块 | 职责 | 建议文件 |
|------|------|----------|
| ImportButton | 触发导入流程的入口 | `components/business/Import/ImportButton.tsx` |
| ImportDialog | 导入配置和进度展示 | `components/business/Import/ImportDialog.tsx` |
| useImport | 管理导入状态 | `hooks/useImport.ts` |
| importService | API 调用封装 | `services/api.ts` (新增方法) |

### 4.2 后端模块

| 模块 | 职责 | 建议文件 |
|------|------|----------|
| import command | 接收前端请求，启动导入 | `src-tauri/src/commands/import.rs` (新增) |
| SQL Parser | 解析 INSERT 语句 | `src-tauri/src/utils/sql_parser.rs` |
| ImportExecutor | 执行导入逻辑 | `commands/import.rs` |
| ProgressEmitter | 进度上报 | 复用 `events.rs` |

---

## 五、API 设计

### 5.1 Rust Command

```rust
// src-tauri/src/commands/import.rs

use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};
use crate::state::AppState;

#[derive(Debug, Clone, Deserialize)]
pub struct ImportOptions {
    pub file_path: String,
    pub target_schema: Option<String>,
    pub target_table: Option<String>,  // 为空时从 SQL 解析
    pub batch_size: Option<usize>,     // 默认 100
    pub on_error: OnErrorStrategy,     // strict | continue | skip
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnErrorStrategy {
    Strict,          // 立即失败，回滚事务
    Continue,        // 记录错误继续执行
    SkipDuplicate,   // 跳过主键冲突错误
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub total_statements: i64,
    pub success_count: i64,
    pub failed_count: i64,
    pub errors: Vec<ImportError>,
    pub time_taken_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ImportError {
    pub line_number: i64,
    pub statement: String,
    pub error_message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub query_id: String,
    pub processed_count: i64,
    pub total_estimate: i64,
    pub current_batch: i64,
    pub total_batches: i64,
}

/// 预解析 SQL 文件，返回文件信息预览
#[tauri::command]
pub async fn preview_sql_file(file_path: String) -> Result<SqlPreview, String> {
    // 读取文件前 N 行，分析表名、预估行数
}

/// 执行 SQL 文件导入
#[tauri::command]
pub async fn import_sql_file(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    id: i64,
    database: Option<String>,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    // 实现导入逻辑
}
```

### 5.2 前端 TypeScript API

```typescript
// services/api.ts

export interface ImportOptions {
  filePath: string;
  targetSchema?: string;
  targetTable?: string;
  batchSize?: number;
  onError: 'strict' | 'continue' | 'skip_duplicate';
}

export interface ImportResult {
  totalStatements: number;
  successCount: number;
  failedCount: number;
  errors: Array<{
    lineNumber: number;
    statement: string;
    errorMessage: string;
  }>;
  timeTakenMs: number;
}

export interface SqlPreview {
  detectedTables: string[];
  estimatedRows: number;
  fileSize: number;
  sampleStatements: string[];
  encoding: string;
}

export const api = {
  // ... 现有方法
  
  import: {
    preview: (filePath: string) =>
      invoke<SqlPreview>("preview_sql_file", { filePath }),
      
    sqlFile: (id: number, database: string | undefined, options: ImportOptions) =>
      invoke<ImportResult>("import_sql_file", { id, database, options }),
  },
};
```

### 5.3 事件定义

```typescript
// 导入进度事件
interface ImportProgressEvent {
  queryId: string;
  processedCount: number;
  totalEstimate: number;
  currentBatch: number;
  totalBatches: number;
  status: 'running' | 'paused' | 'completed' | 'failed';
}

// 监听事件
listen('import.progress', (event) => {
  const progress = event.payload as ImportProgressEvent;
  // 更新 UI 进度
});
```

---

## 六、技术实现细节

### 6.1 SQL 文件解析策略

INSERT SQL 文件的常见格式：

```sql
-- 格式1: 单行单条
INSERT INTO users (id, name) VALUES (1, 'Alice');

-- 格式2: 单行多条 VALUES
INSERT INTO users (id, name) VALUES (1, 'Alice'), (2, 'Bob'), (3, 'Charlie');

-- 格式3: 多行格式化
INSERT INTO users (id, name) VALUES 
    (1, 'Alice'),
    (2, 'Bob');

-- 格式4: 包含注释和空行
-- This is a comment
INSERT INTO users (id, name) VALUES (1, 'Alice');

/* 
 * Multi-line comment
 */
INSERT INTO posts (id, title) VALUES (1, 'Hello');
```

**解析算法建议：**

```rust
pub struct SqlParser;

impl SqlParser {
    /// 流式解析 SQL 文件，返回 INSERT 语句迭代器
    pub fn parse_insert_statements<R: BufRead>(
        reader: R,
    ) -> impl Iterator<Item = Result<ParsedInsert, ParseError>> {
        // 1. 使用 BufReader 流式读取
        // 2. 按语句分割（以 ';' 为分隔符，但注意字符串内的分号）
        // 3. 跳过注释和空行
        // 4. 识别 INSERT 语句
        // 5. 提取表名、列名、VALUES
    }
    
    /// 提取 INSERT 语句中的表名
    pub fn extract_table_name(sql: &str) -> Option<String> {
        // 正则: INSERT\s+INTO\s+(?:(\w+)\.)?(\w+)
    }
    
    /// 批量合并 VALUES（性能优化）
    pub fn merge_values(statements: &[ParsedInsert]) -> Vec<String> {
        // 将多条单行 INSERT 合并为一条多 VALUES 的语句
    }
}
```

### 6.2 批量执行优化

```rust
// 方案对比

// 方案1: 单条执行（简单，但慢）
for statement in statements {
    driver.execute_query(statement).await?;
}

// 方案2: 批量合并（推荐，性能好）
// 将多条 INSERT 合并为一条多 VALUES 的语句
let merged = merge_insert_statements(&batch);
driver.execute_query(&merged).await?;

// 方案3: 使用数据库批量 API（最佳，但实现复杂）
// 使用 sqlx 的 execute_many 或各数据库专用批量接口
```

**合并算法示例：**

```rust
/// 合并多条 INSERT INTO table (cols) VALUES (...) 语句
fn merge_insert_statements(statements: &[&str]) -> Option<String> {
    if statements.is_empty() {
        return None;
    }
    
    // 提取第一条的头部: INSERT INTO table (cols) VALUES
    let first = statements[0];
    let header_end = first.find("VALUES")? + 6;
    let header = &first[..header_end];
    
    // 提取所有 VALUES 部分
    let values: Vec<&str> = statements
        .iter()
        .filter_map(|s| {
            s[header_end..].trim()
                .trim_end_matches(';')
                .strip_prefix('(')
                .map(|v| v.trim())
        })
        .collect();
    
    Some(format!("{} ({});", header, values.join("), (")))
}
```

### 6.3 错误处理策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| **Strict** | 任何错误立即终止，回滚已执行的部分 | 数据一致性要求高的场景 |
| **Continue** | 记录错误，继续执行后续语句，最后汇总报告 | 大批量导入，允许部分失败 |
| **SkipDuplicate** | 主键冲突时忽略，其他错误终止 | 幂等性导入 |

```rust
async fn execute_with_strategy(
    driver: &Box<dyn DatabaseDriver>,
    statements: &[String],
    strategy: OnErrorStrategy,
) -> Result<ImportResult, String> {
    let mut success_count = 0;
    let mut failed_count = 0;
    let mut errors = Vec::new();
    
    for (idx, stmt) in statements.iter().enumerate() {
        match driver.execute_query(stmt.clone()).await {
            Ok(_) => success_count += 1,
            Err(e) => {
                let should_continue = match (&strategy, is_duplicate_error(&e)) {
                    (OnErrorStrategy::Strict, _) => false,
                    (OnErrorStrategy::Continue, _) => {
                        errors.push(ImportError {
                            line_number: idx as i64 + 1,
                            statement: stmt.clone(),
                            error_message: e,
                        });
                        failed_count += 1;
                        true
                    }
                    (OnErrorStrategy::SkipDuplicate, true) => {
                        failed_count += 1; // 记录为跳过
                        true
                    }
                    (OnErrorStrategy::SkipDuplicate, false) => false,
                };
                
                if !should_continue {
                    return Err(e);
                }
            }
        }
    }
    
    Ok(ImportResult {
        total_statements: statements.len() as i64,
        success_count,
        failed_count,
        errors,
        time_taken_ms: 0,
    })
}
```

### 6.4 大文件处理

```rust
const CHUNK_SIZE: usize = 1024 * 1024; // 1MB 读取缓冲区
const BATCH_SIZE: usize = 100;          // 每批执行 100 条

pub async fn import_large_file(
    file_path: &str,
    driver: &Box<dyn DatabaseDriver>,
    emitter: &ProgressEmitter,
) -> Result<ImportResult, String> {
    let file = File::open(file_path).map_err(|e| format!("打开文件失败: {}", e))?;
    let reader = BufReader::with_capacity(CHUNK_SIZE, file);
    
    let mut buffer = String::new();
    let mut batch = Vec::with_capacity(BATCH_SIZE);
    let mut total_processed = 0;
    
    for line in reader.lines() {
        let line = line.map_err(|e| format!("读取行失败: {}", e))?;
        buffer.push_str(&line);
        buffer.push('\n');
        
        // 检查是否形成完整语句（以 ; 结尾）
        if line.trim_end().ends_with(';') && !is_in_string_literal(&buffer) {
            let statement = buffer.trim().to_string();
            buffer.clear();
            
            if is_insert_statement(&statement) {
                batch.push(statement);
                
                if batch.len() >= BATCH_SIZE {
                    execute_batch(driver, &batch).await?;
                    total_processed += batch.len();
                    emitter.emit_progress(total_processed).await;
                    batch.clear();
                }
            }
        }
    }
    
    // 执行剩余语句
    if !batch.is_empty() {
        execute_batch(driver, &batch).await?;
    }
    
    Ok(ImportResult { /* ... */ })
}
```

### 6.5 编码检测

```rust
use encoding_rs::{Encoding, UTF_8, GBK};

/// 尝试自动检测文件编码
fn detect_encoding(bytes: &[u8]) -> &'static Encoding {
    // 1. 检查 BOM
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return UTF_8;
    }
    
    // 2. 尝试 UTF-8
    if UTF_8.decode(bytes, true).1 {
        return UTF_8;
    }
    
    // 3. 默认返回 UTF-8，让调用方处理错误
    UTF_8
}
```

---

## 七、实现步骤

### Phase 1: 基础功能 (MVP)

| 任务 | 描述 | 预计工时 |
|------|------|----------|
| 1.1 | 创建 Rust import 模块 | 2h |
| 1.2 | 实现基础 SQL 解析器 | 3h |
| 1.3 | 实现 import_sql_file command | 3h |
| 1.4 | 前端 ImportDialog 组件 | 4h |
| 1.5 | API 封装和基础 UI 集成 | 2h |
| 1.6 | 测试和调试 | 3h |

**Phase 1 交付**: 基础导入功能可用，支持小文件（< 10MB）

### Phase 2: 增强体验

| 任务 | 描述 | 预计工时 |
|------|------|----------|
| 2.1 | 实现 preview_sql_file 命令 | 2h |
| 2.2 | 预解析预览 UI | 2h |
| 2.3 | 实时进度上报 | 3h |
| 2.4 | 批量执行优化 | 2h |
| 2.5 | 错误详情展示 | 2h |

**Phase 2 交付**: 支持大文件，有进度反馈，用户体验良好

### Phase 3: 高级功能

| 任务 | 描述 | 预计工时 |
|------|------|----------|
| 3.1 | 事务管理（分批提交） | 3h |
| 3.2 | 冲突处理策略 | 2h |
| 3.3 | 编码选择 | 1h |
| 3.4 | 导入历史记录 | 3h |

**Phase 3 交付**: 生产环境可用，支持各种复杂场景

---

## 八、风险评估

### 8.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| SQL 解析复杂度高 | 中 | 高 | 先实现基础解析，逐步支持复杂语法 |
| 大文件内存溢出 | 高 | 中 | 必须流式读取，分批执行 |
| 数据库连接超时 | 高 | 中 | 分批提交，保持连接活跃 |
| 编码问题导致乱码 | 中 | 中 | 提供编码选择，自动检测 |

### 8.2 性能基准

| 场景 | 目标性能 |
|------|----------|
| 1万条记录 (1MB) | < 5秒 |
| 10万条记录 (10MB) | < 30秒 |
| 100万条记录 (100MB) | < 5分钟 |

### 8.3 兼容性要求

- **PostgreSQL**: 支持标准 INSERT，注意处理 JSONB 等特殊类型
- **MySQL**: 支持 INSERT IGNORE, REPLACE 语法
- **SQLite**: 注意事务性能，默认单文件
- **ClickHouse**: 批量插入优化，注意异步特性

---

## 九、相关代码参考

### 9.1 现有导出功能参考

- 后端: `src-tauri/src/commands/transfer.rs`
- 前端: 导出相关的 UI 组件

### 9.2 现有查询执行参考

- 后端: `src-tauri/src/commands/query.rs`
- 前端: `src/services/api.ts` 中的 `query.execute`

### 9.3 事件系统参考

- 后端: `src-tauri/src/events.rs`
- 前端: `App.tsx` 中的事件监听示例

---

## 十、附录

### 10.1 SQL 方言差异对照

| 特性 | PostgreSQL | MySQL | SQLite | ClickHouse |
|------|-----------|-------|--------|-----------|
| 字符串引号 | 单引号 | 单引号 | 单引号 | 单引号 |
| 标识符引号 | 双引号 | 反引号 | 双引号/反引号 | 反引号 |
| 转义 | '' | '' | '' | '' |
| 布尔值 | TRUE/FALSE | 1/0 | 1/0 | 1/0 |
| 批量插入 | 标准 VALUES | 标准 VALUES | 标准 VALUES | 推荐用 INSERT INTO ... FORMAT Values |

### 10.2 文件命名规范

```
src-tauri/src/
├── commands/
│   ├── mod.rs          # 添加 import 模块导出
│   ├── import.rs       # 新增: 导入功能主模块
│   └── ...
├── utils/
│   ├── mod.rs
│   ├── sql_parser.rs   # 新增: SQL 解析工具
│   └── ...

src/
├── components/
│   └── business/
│       └── Import/
│           ├── ImportButton.tsx
│           ├── ImportDialog.tsx
│           └── ImportProgress.tsx
├── hooks/
│   └── useImport.ts
└── services/
    └── api.ts          # 添加 import API
```

---

**文档版本**: v1.0  
**最后更新**: 2026-02-27
