# Mock 模式使用指南

## 快速开始

### 启动前端独立开发模式

使用 Mock 数据启动前端，无需启动完整的 Tauri 应用：

```bash
bun dev:mock
```

或使用环境变量：

```bash
VITE_USE_MOCK=true bun dev
```

### 启动完整的 Tauri 应用

与真实后端通信：

```bash
bun tauri dev
```

## 工作原理

### 环境检测流程

```
API 调用
  ↓
是否在 Tauri 环境？
  ├─ 是 → 使用 Tauri invoke 调用真实后端
  └─ 否 → 检查 VITE_USE_MOCK 环境变量
         ├─ true  → 返回 Mock 数据
         └─ false → 抛出错误
```

## 核心文件

### 1. `src/services/mocks.ts`
包含所有 Mock 数据和处理逻辑：
- `mockConnections` - 模拟数据库连接列表
- `mockTables` - 模拟表列表
- `mockTableMetadata` - 模拟表元数据
- `mockSchemaOverview` - 模拟 Schema 概览
- `mockTableData` - 模拟表数据
- `invokeMock()` - 根据命令名调用对应的 Mock 处理函数

### 2. `src/services/api.ts`
API 调用层，包含环境检测逻辑：
- `isTauri()` - 检测是否在 Tauri 环境
- `useMockMode()` - 检测是否启用 Mock 模式
- `invoke()` - 根据环境选择调用方式

### 3. `.env.mock`
Mock 模式的环境变量配置：
```
VITE_USE_MOCK=true
```

## 测试 Mock 数据

### 方式 1：浏览器控制台

启动 Mock 模式后，在浏览器控制台执行：

```javascript
// 运行所有测试
testMockAPI.runAllTests()

// 运行单个测试
testMockAPI.testQuery()
testMockAPI.testMetadata()
testMockAPI.testTableData()
testMockAPI.testConnections()
```

### 方式 2：代码中调用

```typescript
import { api } from "@/services/api";

const users = await api.tableData.get({
  id: 1,
  schema: "public",
  table: "users",
  page: 1,
  limit: 10,
});
```

## 支持的 API 命令

### Query
- `execute_query` - 执行查询
- `cancel_query` - 取消查询
- `execute_by_conn` - 通过连接执行查询

### Metadata
- `list_tables` - 列出表
- `get_table_structure` - 获取表结构
- `get_table_ddl` - 获取表 DDL
- `get_table_metadata` - 获取表元数据
- `list_tables_by_conn` - 通过连接列出表
- `list_databases` - 列出数据库
- `list_databases_by_id` - 通过 ID 列出数据库
- `get_schema_overview` - 获取 Schema 概览

### TableData
- `get_table_data` - 获取表数据
- `get_table_data_by_conn` - 通过连接获取表数据

### Connections
- `get_connections` - 获取连接列表
- `create_connection` - 创建连接
- `test_connection_ephemeral` - 测试临时连接

## 自定义 Mock 数据

### 修改 Mock 数据

编辑 `src/services/mocks.ts`，修改对应的 Mock 数据：

```typescript
export const mockTables = [
  { schema: "public", name: "my_table", type: "table" },
  // ... 更多表
];
```

### 添加新的 Mock 处理函数

如果后端添加了新的命令，需要在 `src/services/mocks.ts` 中添加对应的 Mock 处理函数：

```typescript
export async function mockNewCommand(args: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50)); // 模拟延迟
  return { /* Mock 数据 */ };
}

// 在 invokeMock 函数中添加 case
export async function invokeMock<T>(cmd: string, args?: any): Promise<T> {
  switch (cmd) {
    // ... 其他 case
    case "new_command":
      return mockNewCommand(args) as Promise<T>;
    // ...
  }
}
```

## 性能考虑

### 优势
- ✅ 零依赖 - 不需要额外的库
- ✅ 秒启动 - 前端秒启动，无需等待后端
- ✅ 即时 HMR - 代码改动立即生效
- ✅ 类型安全 - Mock 和真实数据共用 TypeScript 类型

### 延迟模拟
所有 Mock 处理函数都模拟了网络延迟（50-200ms），以测试加载状态。如果需要禁用延迟，修改 `src/services/mocks.ts` 中对应的 `setTimeout` 即可。

## 常见问题

### Q: Mock 数据与真实后端数据不一致怎么办？
A: 编辑 `src/services/mocks.ts`，更新对应的 Mock 数据结构。

### Q: 如何在 Mock 模式和真实模式间快速切换？
A: 使用 `bun dev:mock` 启动 Mock 模式，使用 `bun tauri dev` 启动完整应用。

### Q: 能否为不同的 API 端点返回不同的 Mock 数据？
A: 可以，编辑 `src/services/mocks.ts` 中对应的 Mock 数据或处理函数。

### Q: Mock 数据会被提交到 Git 吗？
A: 会，Mock 数据是项目的一部分，用于支持前端独立开发。`mocks.ts` 应该被提交。

## 调试技巧

### 查看 Mock 调用日志
所有 Mock 调用都会在浏览器控制台打印 `[Mock] command_name` 日志，便于追踪。

### 模拟不同场景
在 `src/services/mocks.ts` 中修改 Mock 处理函数，返回不同的数据以测试各种场景：

```typescript
export async function mockExecuteQuery(...) {
  // 模拟查询失败
  return {
    data: [],
    rowCount: 0,
    columns: [],
    timeTakenMs: 100,
    success: false,
    error: "Query execution failed",
  };
}
```

## 更新 Mock 数据

当后端 API 响应格式变化时，及时更新 `src/services/mocks.ts` 中的 Mock 数据，保证前端开发体验一致。
