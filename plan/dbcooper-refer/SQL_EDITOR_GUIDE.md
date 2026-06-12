# SQL编辑器实现详解文档

本文档详细讲解如何实现一个功能完整的SQL编辑器，包括流式AI生成、智能自动补全等核心功能。

## 📋 目录

1. [架构总览](#架构总览)
2. [技术栈](#技术栈)
3. [前端实现](#前端实现)
4. [后端实现](#后端实现)
5. [后台交互流程](#后台交互流程)
6. [自动补全机制](#自动补全机制)
7. [完整代码示例](#完整代码示例)

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (React)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  SqlEditor   │  │ useAIGeneration│  │   API Layer      │  │
│  │   组件       │  │    Hook       │  │   (tauri.ts)     │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │                 │                   │
          │ invoke          │ listen            │
          ▼                 ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   Rust后端 (Tauri)                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    Commands                          │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  │  │
│  │  │generate_sql │  │execute_query │  │list_tables  │  │  │
│  │  └──────┬──────┘  └──────────────┘  └─────────────┘  │  │
│  │         │                                            │  │
│  │         ▼ emit                                       │  │
│  │  ┌─────────────┐                                     │  │
│  │  │Event System │ (ai-chunk, ai-done, ai-error)      │  │
│  │  └─────────────┘                                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                         │                                   │
│                         ▼ HTTP POST                         │
│              ┌─────────────────────┐                        │
│              │   OpenAI API        │                        │
│              │   (Stream/SSE)      │                        │
│              └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 技术栈

### 前端
- **React 19** + TypeScript
- **@uiw/react-codemirror** - CodeMirror的React封装
- **@codemirror/lang-sql** - SQL语言支持
- **@tauri-apps/api** - 与Rust后端通信

### 后端
- **Rust** + **Tauri v2**
- **sqlx** - SQLite本地存储
- **reqwest** - HTTP客户端
- **futures-util** - 流式处理

### AI服务
- **OpenAI API** (兼容任何OpenAI格式的API)
- **SSE (Server-Sent Events)** - 流式响应

---

## 前端实现

### 1. SQL编辑器组件

```typescript
// components/SqlEditor.tsx
import { useMemo, useEffect, useState, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, type SQLConfig } from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";

interface TableSchema {
  schema: string;
  name: string;
  columns?: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRunQuery?: () => void;
  disabled?: boolean;
  height?: string;
  tables?: TableSchema[];
  onGenerateSQL?: (instruction: string, existingSQL: string) => void;
  generating?: boolean;
  aiConfigured?: boolean | null;
  onCursorActivity?: (line: number, char: number) => void;
  cursorWarning?: string | null;
}

export function SqlEditor({
  value,
  onChange,
  onRunQuery,
  height = "300px",
  tables = [],
  onGenerateSQL,
  generating = false,
  aiConfigured = null,
  onCursorActivity,
  cursorWarning = null,
  disabled = false,
}: SqlEditorProps) {
  const [instruction, setInstruction] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // ========== 1. 快捷键配置 ==========
  const runQueryKeymap = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",  // Cmd+Enter (Mac) / Ctrl+Enter (Windows)
            run: () => {
              if (onRunQuery && !disabled && value.trim()) {
                onRunQuery();
                return true;
              }
              return false;
            },
          },
        ])
      ),
    [onRunQuery, disabled, value]
  );

  // ========== 2. 光标位置监听 ==========
  const cursorExtension = useMemo(
    () =>
      EditorView.updateListener.of((update) => {
        if (update.selectionSet && onCursorActivity) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          onCursorActivity(line.number - 1, pos - line.from);
        }
      }),
    [onCursorActivity]
  );

  // ========== 3. Schema转换（关键！） ==========
  const sqlSchema = useMemo(() => {
    const schema: SQLConfig["schema"] = {};
    
    for (const table of tables) {
      const fullName = `${table.schema}.${table.name}`;
      const columns = table.columns?.map((col) => col.name) ?? [];
      
      // 注册两种访问方式
      schema[fullName] = columns;    // "public.users"
      schema[table.name] = columns;  // "users"
    }
    
    return schema;
  }, [tables]);

  // ========== 4. SQL语言配置 ==========
  const sqlExtension = useMemo(
    () =>
      sql({
        upperCaseKeywords: true,  // 关键字大写
        schema: sqlSchema,        // 表结构配置
      }),
    [sqlSchema]
  );

  // ========== 5. 扩展组合 ==========
  const extensions = useMemo(
    () => [
      runQueryKeymap,
      sqlExtension,
      EditorView.lineWrapping,
      cursorExtension,
    ],
    [runQueryKeymap, sqlExtension, cursorExtension]
  );

  // ========== 6. AI生成处理 ==========
  const handleGenerate = () => {
    if (instruction.trim() && onGenerateSQL) {
      onGenerateSQL(instruction, value);
    }
  };

  return (
    <div className="space-y-2">
      {/* AI输入区域 */}
      {onGenerateSQL && tables.length > 0 && (
        <div className="flex gap-2">
          <input
            placeholder="Describe the SQL you want to generate"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !generating) {
                handleGenerate();
              }
            }}
            disabled={generating || aiConfigured === false}
          />
          <button
            onClick={handleGenerate}
            disabled={!instruction.trim() || generating || aiConfigured === false}
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      )}

      {/* 编辑器区域 */}
      <div ref={containerRef} className="border rounded-md overflow-hidden">
        {/* 警告提示 */}
        {cursorWarning && (
          <div className="absolute top-2 right-2">
            <span title={cursorWarning}>⚠️</span>
          </div>
        )}
        
        <CodeMirror
          value={value}
          height={height}
          extensions={extensions}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,  // 启用自动补全
          }}
        />
      </div>
    </div>
  );
}
```

### 2. SQL解析器

```typescript
// lib/sqlParser.ts

export interface SqlStatement {
  text: string;
  startLine: number;    // 0-indexed
  endLine: number;
  startOffset: number;  // 字符偏移量
  endOffset: number;
}

/**
 * 解析SQL文本，分离多个语句
 * 正确处理：字符串内的分号、注释、引号
 */
export function parseStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  const lines = sql.split("\n");
  
  let currentStatement = "";
  let statementStartLine = 0;
  let statementStartOffset = 0;
  let currentOffset = 0;
  
  // 状态跟踪
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    inLineComment = false;  // 每行重置行注释状态

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      const prevChar = line[i - 1];

      // 处理块注释开始 /*
      if (!inSingleQuote && !inDoubleQuote && !inLineComment && !inBlockComment) {
        if (char === "/" && nextChar === "*") {
          inBlockComment = true;
          currentStatement += char;
          currentOffset++;
          continue;
        }
        // 处理行注释开始 --
        if (char === "-" && nextChar === "-") {
          inLineComment = true;
          currentStatement += char;
          currentOffset++;
          continue;
        }
      }

      // 处理块注释结束 */
      if (inBlockComment && char === "*" && nextChar === "/") {
        inBlockComment = false;
        currentStatement += char;
        currentOffset++;
        continue;
      }

      // 处理字符串引号（不在注释中）
      if (!inLineComment && !inBlockComment) {
        if (char === "'" && prevChar !== "\\" && !inDoubleQuote) {
          inSingleQuote = !inSingleQuote;
        } else if (char === '"' && prevChar !== "\\" && !inSingleQuote) {
          inDoubleQuote = !inDoubleQuote;
        }
      }

      // 处理分号（语句结束）
      if (
        char === ";" &&
        !inSingleQuote &&
        !inDoubleQuote &&
        !inLineComment &&
        !inBlockComment
      ) {
        currentStatement += char;
        const trimmed = currentStatement.trim();
        
        if (trimmed.length > 0) {
          statements.push({
            text: trimmed,
            startLine: statementStartLine,
            endLine: lineNum,
            startOffset: statementStartOffset,
            endOffset: currentOffset,
          });
        }
        
        currentOffset++;
        currentStatement = "";
        statementStartLine = lineNum;
        statementStartOffset = currentOffset + 1;
        continue;
      }

      // 新语句开始（第一个非空白字符）
      if (currentStatement.trim() === "" && char.trim() !== "") {
        statementStartLine = lineNum;
        statementStartOffset = currentOffset;
      }

      currentStatement += char;
      currentOffset++;
    }

    // 添加换行符到当前语句
    currentStatement += "\n";
    currentOffset++;
  }

  // 处理最后一条语句（可能没有分号）
  const trimmed = currentStatement.trim();
  if (trimmed.length > 0) {
    statements.push({
      text: trimmed,
      startLine: statementStartLine,
      endLine: lines.length - 1,
      startOffset: statementStartOffset,
      endOffset: currentOffset - 1,
    });
  }

  return statements;
}

/**
 * 获取光标所在位置的语句
 */
export function getStatementAtCursor(
  sql: string,
  cursorLine: number,
  _cursorChar: number
): SqlStatement | null {
  const statements = parseStatements(sql);
  
  if (statements.length === 0) return null;
  if (statements.length === 1) return statements[0];
  
  for (const statement of statements) {
    if (cursorLine >= statement.startLine && cursorLine <= statement.endLine) {
      return statement;
    }
  }
  
  return null;
}

export function hasMultipleStatements(sql: string): boolean {
  return parseStatements(sql).length > 1;
}
```

### 3. AI生成Hook

```typescript
// hooks/useAIGeneration.ts
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

interface TableSchema {
  schema: string;
  name: string;
  columns?: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

interface AiChunkPayload {
  chunk: string;
  session_id: string;
}

interface AiDonePayload {
  session_id: string;
  full_response: string;
}

interface AiErrorPayload {
  session_id: string;
  error: string;
}

// 全局监听器（防止React Strict Mode重复注册）
let globalUnlistenChunk: UnlistenFn | null = null;
let globalUnlistenDone: UnlistenFn | null = null;
let globalUnlistenError: UnlistenFn | null = null;
let listenerSessionId: string | null = null;
let listenerOnStream: ((chunk: string) => void) | null = null;
let listenerResolve: (() => void) | null = null;
let listenerReject: ((error: Error) => void) | null = null;
let listenersSetup = false;

async function setupGlobalListeners() {
  if (listenersSetup) return;
  listenersSetup = true;

  // 监听流式数据块
  globalUnlistenChunk = await listen<AiChunkPayload>("ai-chunk", (event) => {
    if (event.payload.session_id === listenerSessionId && listenerOnStream) {
      listenerOnStream(event.payload.chunk);
    }
  });

  // 监听完成事件
  globalUnlistenDone = await listen<AiDonePayload>("ai-done", (event) => {
    if (event.payload.session_id === listenerSessionId) {
      listenerSessionId = null;
      if (listenerResolve) {
        listenerResolve();
        listenerResolve = null;
      }
    }
  });

  // 监听错误事件
  globalUnlistenError = await listen<AiErrorPayload>("ai-error", (event) => {
    if (event.payload.session_id === listenerSessionId) {
      listenerSessionId = null;
      if (listenerReject) {
        listenerReject(new Error(event.payload.error));
        listenerReject = null;
      }
    }
  });
}

export function useAIGeneration() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  // 检查AI配置
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const settings = await api.settings.getAll();
        const hasKey = !!settings.openai_api_key;
        setIsConfigured(hasKey);
      } catch {
        setIsConfigured(false);
      }
    };
    checkConfig();
  }, []);

  useEffect(() => {
    setupGlobalListeners();
  }, []);

  const generateSQL = useCallback(async (
    dbType: string,
    instruction: string,      // 用户指令
    existingSQL: string,      // 现有SQL（用于修改）
    tables: TableSchema[],    // 表结构上下文
    onStream: (chunk: string) => void  // 流式回调
  ) => {
    setGenerating(true);
    setError(null);

    // 生成唯一会话ID
    const sessionId = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 设置当前监听器上下文
    listenerSessionId = sessionId;
    listenerOnStream = onStream;

    return new Promise<void>((resolve, reject) => {
      listenerResolve = () => {
        setGenerating(false);
        resolve();
      };
      listenerReject = (err) => {
        setGenerating(false);
        setError(err.message);
        reject(err);
      };

      // 调用Rust命令
      invoke("generate_sql", {
        sessionId,
        dbType,
        instruction,
        existingSql: existingSQL,
        tables,
      }).catch((err) => {
        setGenerating(false);
        setError(err instanceof Error ? err.message : String(err));
        reject(err);
      });
    });
  }, []);

  return { generateSQL, generating, error, isConfigured };
}
```

---

## 后端实现

### Rust Tauri命令

```rust
// src-tauri/src/commands/ai.rs

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use sqlx::SqlitePool;
use std::collections::HashMap;

// ========== 数据结构定义 ==========

#[derive(Debug, Serialize, Deserialize)]
pub struct TableSchema {
    pub schema: String,
    pub name: String,
    pub columns: Option<Vec<ColumnSchema>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnSchema {
    pub name: String,
    #[serde(rename = "type")]
    pub column_type: String,
    pub nullable: bool,
}

#[derive(Debug, Serialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<ChatMessage>,
    temperature: f32,
    stream: bool,  // 启用流式响应
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
struct StreamResponse {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: StreamDelta,
}

#[derive(Debug, Deserialize)]
struct StreamDelta {
    content: Option<String>,
}

// 事件Payload
#[derive(Clone, Serialize)]
struct AiChunkPayload {
    chunk: String,
    session_id: String,
}

#[derive(Clone, Serialize)]
struct AiDonePayload {
    session_id: String,
    full_response: String,
}

#[derive(Clone, Serialize)]
struct AiErrorPayload {
    session_id: String,
    error: String,
}

// ========== 核心命令 ==========

#[tauri::command]
pub async fn generate_sql(
    app: AppHandle,
    pool: State<'_, SqlitePool>,
    session_id: String,
    db_type: String,
    instruction: String,
    existing_sql: String,
    tables: Vec<TableSchema>,
) -> Result<(), String> {
    println!("[AI] Starting SQL generation for session: {}", session_id);

    // 1. 从数据库读取设置
    let settings: Vec<Setting> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    let settings_map: HashMap<String, String> =
        settings.into_iter().map(|s| (s.key, s.value)).collect();

    let api_key = settings_map
        .get("openai_api_key")
        .filter(|k| !k.is_empty())
        .ok_or_else(|| "OpenAI API key not configured".to_string())?
        .clone();

    let endpoint = settings_map
        .get("openai_endpoint")
        .filter(|e| !e.is_empty())
        .cloned()
        .unwrap_or_else(|| "https://api.openai.com/v1".to_string());

    let model = settings_map
        .get("openai_model")
        .filter(|m| !m.is_empty())
        .cloned()
        .unwrap_or_else(|| "gpt-4.1".to_string());

    // 2. 构建schema描述
    let schema_description = tables
        .iter()
        .map(|t| {
            let cols = t.columns.as_ref().map_or(String::new(), |columns| {
                let col_desc: Vec<String> = columns
                    .iter()
                    .map(|c| {
                        format!(
                            "{} ({}{})",
                            c.name,
                            c.column_type,
                            if c.nullable { ", nullable" } else { "" }
                        )
                    })
                    .collect();
                format!("\n  Columns: {}", col_desc.join(", "))
            });
            format!("{}.{}{}", t.schema, t.name, cols)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    // 3. 根据数据库类型定制提示
    let (db_name, syntax_note) = match db_type.to_lowercase().as_str() {
        "sqlite" | "sqlite3" => ("SQLite", "Use SQLite syntax"),
        "mysql" => ("MySQL", "Use MySQL syntax"),
        "redis" => ("Redis", "Generate Redis commands"),
        _ => ("PostgreSQL", "Use PostgreSQL syntax"),
    };

    let system_prompt = format!(
        r#"You are a {} SQL expert. Generate SQL queries based on user instructions.

Available tables and schemas:
{}

Rules:
- Return ONLY the raw SQL query, no markdown formatting, no code blocks, no explanations
- {}
- Consider the existing SQL if provided as context"#,
        db_name, schema_description, syntax_note
    );

    let user_prompt = if existing_sql.is_empty() {
        format!("Generate SQL query: {}", instruction)
    } else {
        format!(
            "Modify this SQL query:\n```sql\n{}\n```\n\nInstruction: {}",
            existing_sql, instruction
        )
    };

    // 4. 构建请求
    let request = OpenAIRequest {
        model,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt,
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt,
            },
        ],
        temperature: 0.3,
        stream: true,  // 启用流式
    };

    // 5. 发送HTTP请求
    let client = reqwest::Client::new();
    let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to call OpenAI API: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        let error_msg = if let Ok(error) = serde_json::from_str::<OpenAIError>(&error_text) {
            error.error.message
        } else {
            format!("API error: {}", error_text)
        };
        
        let _ = app.emit(
            "ai-error",
            AiErrorPayload {
                session_id,
                error: error_msg.clone(),
            },
        );
        return Err(error_msg);
    }

    // 6. 流式处理响应
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut full_response = String::new();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // 处理完整行
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.starts_with("data: ") {
                let data = &line[6..];
                if data == "[DONE]" {
                    continue;
                }

                // 解析SSE数据
                if let Ok(parsed) = serde_json::from_str::<StreamResponse>(data) {
                    if let Some(choice) = parsed.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            full_response.push_str(content);
                            
                            // 🔥 关键：emit事件到前端
                            let _ = app.emit(
                                "ai-chunk",
                                AiChunkPayload {
                                    chunk: content.clone(),
                                    session_id: session_id.clone(),
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    // 7. 清理响应并发送完成事件
    let cleaned = full_response
        .trim()
        .trim_start_matches("```sql")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
        .to_string();

    let _ = app.emit(
        "ai-done",
        AiDonePayload {
            session_id,
            full_response: cleaned,
        },
    );

    Ok(())
}
```

### 注册命令

```rust
// src-tauri/src/lib.rs
use commands::ai::{generate_sql, select_tables_for_query};

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            generate_sql,
            select_tables_for_query,
            // ... 其他命令
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 后台交互流程

### 时序图

```
前端                                                      后端                    OpenAI
 │                                                        │                        │
 │  invoke("generate_sql")                                │                        │
 │────────────────────────────────────────────────────────>│                        │
 │                                                        │                        │
 │                              返回Ok(())                │                        │
 │<────────────────────────────────────────────────────────│                        │
 │                                                        │                        │
 │                                                        │  POST /chat/completions│
 │                                                        │────────────────────────>│
 │                                                        │                        │
 │                                                        │<─Stream──Stream───────│
 │                                                        │    (SSE格式)            │
 │                                                        │                        │
 │  emit("ai-chunk")                                      │                        │
 │<────────────────────────────────────────────────────────│                        │
 │  onStream("SELECT")                                    │                        │
 │  更新编辑器                                            │                        │
 │                                                        │                        │
 │  emit("ai-chunk")                                      │                        │
 │<────────────────────────────────────────────────────────│                        │
 │  onStream(" *")                                        │                        │
 │  更新编辑器                                            │                        │
 │                                                        │                        │
 │  ...更多chunks...                                      │                        │
 │<────────────────────────────────────────────────────────│                        │
 │                                                        │                        │
 │  emit("ai-done")                                       │                        │
 │<────────────────────────────────────────────────────────│                        │
 │  生成完成                                              │                        │
 │                                                        │                        │
```

### SSE流式数据格式

```
// OpenAI SSE响应示例
data: {"choices":[{"delta":{"content":"SELECT"}}]}

data: {"choices":[{"delta":{"content":" *"}}]}

data: {"choices":[{"delta":{"content":" FROM"}}]}

data: {"choices":[{"delta":{"content":" users"}}]}

data: [DONE]
```

---

## 自动补全机制

### 1. Schema数据结构

```typescript
// CodeMirror期望的schema格式
const schema = {
  // 表名映射列数组
  "users": ["id", "email", "created_at"],
  "orders": ["id", "user_id", "amount"],
  
  // 支持schema.table格式
  "public.users": ["id", "email", "created_at"],
  "public.orders": ["id", "user_id", "amount"],
};
```

### 2. 转换函数

```typescript
// 将TableSchema[]转换为CodeMirror schema
function buildSchema(tables: TableSchema[]): SQLConfig["schema"] {
  const schema: SQLConfig["schema"] = {};
  
  for (const table of tables) {
    const columns = table.columns?.map(col => col.name) ?? [];
    
    // 注册短名
    schema[table.name] = columns;
    
    // 注册全名
    if (table.schema) {
      schema[`${table.schema}.${table.name}`] = columns;
    }
  }
  
  return schema;
}
```

### 3. 补全触发逻辑

```typescript
// CodeMirror内部自动处理

// 场景1：输入关键字
输入: "SEL"
触发补全列表: ["SELECT", "SET", "SERIAL", ...]

// 场景2：输入表名
输入: "SELECT * FROM u"
触发补全列表: ["users", "user_profiles", "user_groups", ...]
类型: "type": "type" (表名)

// 场景3：点号后补全列名（最重要！）
输入: "SELECT * FROM users."
触发补全列表: ["id", "email", "created_at", ...]
类型: "type": "property" (列名)

// 场景4：schema前缀
输入: "SELECT * FROM public."
触发补全列表: ["users", "orders", "products", ...]
```

### 4. 自定义补全源

```typescript
import { autocompletion, CompletionContext, CompletionSource } from "@codemirror/autocomplete";
import { schemaCompletionSource } from "@codemirror/lang-sql";

// 组合多个补全源
const extensions = [
  sql({ schema: sqlSchema }),
  autocompletion({
    override: [
      // 1. 表结构补全（内置）
      schemaCompletionSource({ schema: sqlSchema }),
      
      // 2. 自定义关键字补全
      customKeywordCompletion(),
      
      // 3. 自定义上下文补全
      contextAwareCompletion(),
    ],
    // 补全配置
    defaultKeymap: true,
    closeOnBlur: true,
  }),
];

// 自定义关键字补全
function customKeywordCompletion(): CompletionSource {
  return (context: CompletionContext) => {
    const word = context.matchBefore(/\w*/);
    if (!word || word.from === word.to) return null;
    
    const keywords = ["CUSTOM_FUNC", "MY_KEYWORD"];
    
    return {
      from: word.from,
      options: keywords.map(k => ({
        label: k,
        type: "keyword",
        boost: 99,  // 排序优先级
      })),
    };
  };
}

// 上下文感知补全
function contextAwareCompletion(): CompletionSource {
  return (context: CompletionContext) => {
    // 检查是否在WHERE子句
    const whereMatch = context.matchBefore(/WHERE\s+([\w_]*)$/);
    if (whereMatch) {
      // 提供列名建议
      return {
        from: whereMatch.from,
        options: columnNames.map(col => ({
          label: col,
          type: "property",
        })),
      };
    }
    return null;
  };
}
```

---

## 完整代码示例

### 页面使用示例

```typescript
// pages/QueryPage.tsx
import { useState, useEffect } from "react";
import { SqlEditor } from "@/components/SqlEditor";
import { useAIGeneration } from "@/hooks/useAIGeneration";
import { parseStatements, getStatementAtCursor } from "@/lib/sqlParser";
import { api } from "@/lib/tauri";

interface QueryTab {
  query: string;
  results: Record<string, unknown>[] | null;
  executionTime: number | null;
}

export function QueryPage({ connectionUuid }: { connectionUuid: string }) {
  const [tab, setTab] = useState<QueryTab>({
    query: "",
    results: null,
    executionTime: null,
  });
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [cursorLine, setCursorLine] = useState(0);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  
  const { generateSQL, isConfigured } = useAIGeneration();

  // 加载表结构
  useEffect(() => {
    const loadTables = async () => {
      const tableList = await api.pool.listTables(connectionUuid);
      
      // 获取每个表的列信息
      const tablesWithColumns = await Promise.all(
        tableList.map(async (t) => {
          const structure = await api.pool.getTableStructure(
            connectionUuid,
            t.schema,
            t.name
          );
          return {
            schema: t.schema,
            name: t.name,
            columns: structure.columns.map(c => ({
              name: c.name,
              type: c.type,
              nullable: c.nullable,
            })),
          };
        })
      );
      
      setTables(tablesWithColumns);
    };
    
    loadTables();
  }, [connectionUuid]);

  // 执行查询
  const handleRunQuery = async () => {
    if (!tab.query.trim()) return;

    const startTime = performance.now();
    
    // 获取光标处的语句
    const currentStatement = getStatementAtCursor(tab.query, cursorLine, 0);
    const queryToExecute = currentStatement?.text || tab.query;
    
    try {
      const result = await api.pool.executeQuery(connectionUuid, queryToExecute);
      
      setTab(prev => ({
        ...prev,
        results: result.data,
        executionTime: Math.round(performance.now() - startTime),
      }));
    } catch (error) {
      console.error("Query failed:", error);
    }
  };

  // AI生成SQL
  const handleGenerateSQL = async (instruction: string, existingSQL: string) => {
    setIsAiGenerating(true);
    let accumulatedSQL = "";
    
    try {
      await generateSQL(
        "postgres",
        instruction,
        existingSQL,
        tables,
        (chunk) => {
          accumulatedSQL += chunk;
          setTab(prev => ({ ...prev, query: accumulatedSQL }));
        }
      );
    } catch (error) {
      console.error("AI generation failed:", error);
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="p-4">
      <SqlEditor
        value={tab.query}
        onChange={(value) => setTab(prev => ({ ...prev, query: value }))}
        onRunQuery={handleRunQuery}
        height="400px"
        tables={tables}
        onGenerateSQL={handleGenerateSQL}
        generating={isAiGenerating}
        aiConfigured={isConfigured}
        onCursorActivity={(line, char) => setCursorLine(line)}
        cursorWarning={hasMultipleStatements(tab.query) ? "Multiple statements detected" : null}
      />
      
      {/* 查询结果展示 */}
      {tab.results && (
        <div className="mt-4">
          <p>Execution time: {tab.executionTime}ms</p>
          <table>
            {/* 渲染结果 */}
          </table>
        </div>
      )}
    </div>
  );
}
```

---

## 关键要点总结

### 1. 核心依赖
```json
{
  "@uiw/react-codemirror": "^4.x",
  "@codemirror/lang-sql": "^6.x",
  "@codemirror/view": "^6.x",
  "@codemirror/state": "^6.x"
}
```

### 2. Schema格式转换
```typescript
// 输入
[{ schema: "public", name: "users", columns: [{ name: "id" }] }]

// 输出
{
  "users": ["id"],
  "public.users": ["id"]
}
```

### 3. 流式通信要点
- 使用Tauri的`invoke`发送请求
- 使用`listen`接收流式事件
- 全局监听器防止React Strict Mode重复注册
- 使用session ID匹配请求和响应

### 4. 自动补全触发条件
- **225ms** 无输入后自动触发
- **点号(.)** 后触发列名补全
- **关键字** 前几个字母触发关键字补全

### 5. 性能优化
- 使用`useMemo`缓存schema转换
- 全局单一监听器避免重复
- 表结构按需加载并缓存
- SQL解析使用状态机避免正则回溯

---

## 故障排查

### 问题1：自动补全不工作
- 检查schema格式是否正确
- 确保`autocompletion: true`在basicSetup中
- 验证tables数据是否传递到组件

### 问题2：AI生成无响应
- 检查API key是否正确配置
- 查看Rust控制台日志
- 确认事件监听器是否正确注册

### 问题3：流式更新卡顿
- 使用requestAnimationFrame批量更新
- 考虑使用防抖减少渲染频率
- 检查是否有大量状态更新

---

**文档版本**: 1.0  
**最后更新**: 2024
