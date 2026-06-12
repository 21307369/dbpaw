# 数据库连接管理机制分析报告

本报告基于 `src-tauri` 后端代码，详细梳理了当前项目的数据库连接管理、保持、断开与重连机制。

## 1. 核心架构概述

后端采用了 **双层数据库管理** 策略：
1.  **应用内部数据库 (`src/db`)**: 使用全局唯一的 `SqlitePool`，用于存储应用设置、连接配置和查询历史。
2.  **用户数据库连接 (`src/database`)**: 使用 `PoolManager` 动态管理用户添加的多个数据库连接（SQLite, Postgres, MySQL 等）。

用户主要关心的部分是 **用户数据库连接管理**。

## 2. 连接管理机制 (`PoolManager`)

### 2.1 连接池管理器
代码位置: `src-tauri/src/database/pool_manager.rs`

`PoolManager` 是一个全局状态（State），它维护了一个内存中的哈希表来存储活跃的连接驱动：

```rust
pub struct PoolManager {
    // 存储活跃连接，Key 为连接 UUID
    pools: RwLock<HashMap<String, PoolEntry>>,
    // 连接锁，防止对同一 UUID 并发发起连接
    connect_locks: RwLock<HashMap<String, Arc<Mutex<()>>>>,
}
```

每个 `PoolEntry` 包含：
- `driver`: 实现了 `DatabaseDriver` trait 的具体驱动实例（如 `SqliteDriver`, `PostgresDriver`）。
- `status`: 连接状态 (`Connected`, `Disconnected`, `Reconnecting`)。
- `last_used`: 最后使用时间。

### 2.2 驱动实现的差异 (`Driver`)

不同数据库的驱动实现方式不同，这直接影响了“连接保持”的方式：

*   **SQLite (`src/database/sqlite.rs`)**:
    *   **机制**: **无持久连接 (Stateless)**。
    *   **实现**: `SqliteDriver` 仅存储配置路径。每次执行操作（如查询、列出表）时，它都会创建一个新的 `SqlitePool` (max_connections=1)，执行完立即关闭 (`pool.close()`)。
    *   **优点**: 避免了文件锁问题，适合本地文件数据库。
    *   **缺点**: 高频操作下开销略大，但对桌面应用通常可接受。

*   **PostgreSQL (`src/database/postgres.rs`)**:
    *   **机制**: **持久连接池 (Stateful)**。
    *   **实现**: `PostgresDriver` 内部持有一个 `Arc<RwLock<Option<sqlx::PgPool>>>`。连接建立后会一直保持，直到显式断开或出错。
    *   **配置**: 默认最大连接数 5，空闲超时 600秒。

## 3. 连接保持与重连策略

关于用户关心的“怎么保证连接、断开重连”部分，后端采用了 **懒加载 (Lazy Loading)** 和 **自动重试 (Auto-Retry)** 机制。

### 3.1 懒加载与连接保证
代码位置: `src-tauri/src/commands/pool.rs` -> `ensure_connection`

在执行任何数据库操作（如 `pool_execute_query`）之前，都会调用 `ensure_connection`：
1.  检查 `PoolManager` 中是否有该 UUID 的活跃驱动。
2.  如果有，直接使用。
3.  如果没有（首次使用或已断开），从内部数据库读取配置，调用 `pool_manager.connect` 建立新连接。

### 3.2 自动重连与错误恢复
代码位置: `src-tauri/src/commands/pool.rs` -> 各个命令函数

后端在 **Command 层** 实现了自动重连逻辑。以 `pool_execute_query` 为例：

```rust
match pool_manager.execute_query(&uuid, &query).await {
    Ok(result) => Ok(result), // 成功
    Err(e) => {
        // 失败：打印日志，尝试重连
        println!("[Pool] execute_query failed: {}, retrying...", e);
        
        // 1. 强制断开旧连接
        // 2. 重新读取配置并建立新连接
        reconnect(&pool_manager, sqlite_pool.inner(), &uuid).await?;
        
        // 3. 使用新连接重试一次操作
        pool_manager.execute_query(&uuid, &query).await
    }
}
```

**机制总结**:
1.  **乐观执行**: 假设连接是好的，直接执行。
2.  **捕获失败**: 如果执行报错（网络中断、Server 关闭连接等）。
3.  **自动重连**: 销毁旧驱动，重新建立连接。
4.  **重试**: 再次执行操作。如果这次还失败，则向前端返回错误。

### 3.3 健康检查 (Health Check)
代码位置: `src-tauri/src/database/pool_manager.rs` -> `health_check`

前端可以主动调用 `health_check` 命令。
- 它会调用驱动的 `test_connection()` 方法（通常是执行 `SELECT 1`）。
- 根据结果更新 `PoolManager` 中的状态为 `Connected` 或 `Disconnected`。

## 4. 总结

| 功能 | 实现机制 | 备注 |
| :--- | :--- | :--- |
| **连接存储** | `HashMap` in Memory | 应用重启后连接需重新建立 |
| **SQLite 连接** | 按需创建 (Connect-on-demand) | 每次查询都是新连接，无长连接 |
| **Postgres 连接** | 长连接池 (Persistent Pool) | 保持 TCP 连接，支持复用 |
| **连接保证** | `ensure_connection` | 操作前检查，不存在则自动连接 |
| **断开重连** | Command 层自动重试 | 操作失败 -> 重连 -> 重试 (1次) |

这种设计既保证了灵活性（支持多种数据库），又具备较好的容错性（自动重连），非常适合 Tauri 这种桌面应用架构。
