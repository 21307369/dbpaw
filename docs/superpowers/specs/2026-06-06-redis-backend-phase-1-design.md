# Redis Backend Phase 1 Refactor Design

## Context

`src-tauri/src/datasources/redis.rs` is over 3,600 lines and mixes connection
setup, Redis command execution, key scanning, typed key operations, stream
logic, sorted set helpers, geo helpers, server metadata, raw console execution,
DTOs, and string-based error handling. `src-tauri/src/commands/redis.rs` is over
1,200 lines and mixes Tauri command boundaries with connection cache/retry
logic and command log handling.

Existing Rust integration tests import `dbpaw_lib::datasources::redis::*`
directly. The frontend calls fixed Tauri command names through
`src/services/api.ts`. Phase 1 must therefore keep public behavior and public
paths stable while reducing backend module size and stopping further Redis
string-error growth.

## Goals

- Keep all Tauri command names, signatures, and frontend TypeScript wrappers
  unchanged.
- Keep `dbpaw_lib::datasources::redis::*` usable for existing integration tests.
- Split Redis datasource internals by responsibility.
- Introduce Redis-specific error conversion so new and moved datasource code can
  use structured errors internally.
- Convert Redis errors to `String` only at the command boundary.
- Preserve current Redis runtime behavior, including standalone, cluster, and
  sentinel connection behavior.

## Non-Goals

- Do not redesign the Redis UI or TypeScript service API.
- Do not rename existing Tauri commands.
- Do not change Redis integration test semantics.
- Do not introduce a new Redis driver trait or broader datasource abstraction.
- Do not fully rewrite command registration in `src-tauri/src/lib.rs`.

## Architecture

`src-tauri/src/datasources/redis.rs` remains the public facade module. It will
declare private or crate-visible submodules under `src-tauri/src/datasources/redis/`
and re-export the same public types and functions currently used by tests and
commands.

Planned datasource modules:

- `connection.rs`: `RedisConnection`, connection cache handle types, standalone,
  cluster, and sentinel connection construction, database selection, host parsing,
  timeout handling, and low-level query helpers.
- `error.rs`: `RedisError`, `RedisResult<T>`, conversion from
  `redis::RedisError`, validation failures, scan cursor failures, unsupported
  cluster routing, and conversion into `AppError` or final command-boundary text.
- `models.rs`: DTOs, payloads, enums, and result structs.
- `scan.rs`: standalone scan, cluster scan, cursor encoding/decoding, cluster
  master discovery, node address parsing, wildcard guard, and key metadata lookup.
- `key_value.rs`: key validation, get/set/page/patch/delete/rename/ttl, bitmap,
  HyperLogLog, set/list helpers, and batch mget/mset/key operations.
- `stream.rs`: stream entry parsing, stream view/range, groups, ack, pending,
  claim, trim, and readgroup operations.
- `zset.rs`: sorted set score, rank, range by score, range by lex, lex count,
  pop min, and pop max operations.
- `geo.rs`: geo add, position, distance, and search operations.
- `server.rs`: server info, config, slowlog, and cluster info parsing.
- `raw.rs`: raw command tokenization, Redis value formatting, and raw execution.

The facade should make call sites continue to look like:

```rust
use dbpaw_lib::datasources::redis;

let mut conn = redis::connect(&form, None).await?;
let value = redis::get_key(&mut conn, key).await?;
```

## Command Boundary

`src-tauri/src/commands/redis.rs` keeps all existing `#[tauri::command]`
functions and return shapes. The command file may get a small private submodule
or helper extraction for cache/retry logic, but Phase 1 does not split commands
into multiple public command modules.

The command layer remains responsible for:

- Loading a `ConnectionForm` from `AppState`.
- Acquiring or creating cached Redis connections.
- Retrying once after Redis IO-style connection failures.
- Converting datasource errors into `String` for Tauri.
- Appending raw console command logs.

## Error Handling

New datasource internals should return `RedisResult<T>` instead of
`Result<T, String>`. `RedisError` should cover at least:

- Redis server/client errors from `redis::RedisError`.
- Validation errors such as empty keys or invalid write payloads.
- Invalid database selection.
- Invalid scan cursor.
- Unsupported routing or command behavior for cluster mode.
- Parse/format errors that are internal to Redis response handling.

`RedisError` converts into `AppError` using existing categories:

- Connection and IO failures map to `AppError::ConnectionFailed` or timeout/auth
  variants when the source clearly indicates that class.
- Redis command failures map to `AppError::query_failed`.
- User input and cursor validation failures map to `AppError::validation`.
- Unsupported cluster/command behavior maps to `AppError::unsupported`.
- Unexpected parse/state failures map to `AppError::internal`.

The command boundary converts `RedisError` to `String` via `AppError`, matching
the project rule that structured errors cross the backend from the inside out.
During Phase 1, legacy helper functions may temporarily retain `Result<T, String>`
behind the facade where required to keep the refactor mechanical, but newly
moved code should not add new string tags such as `[REDIS_ERROR]` or
`[REDIS_SCAN_ERROR]`.

IO retry detection should move away from parsing `[REDIS_ERROR]` prefixes and
toward a Redis-specific predicate on `RedisError`. Existing retry unit tests
should be updated to assert the typed predicate.

## Testing

Minimum verification after Rust changes:

- Run targeted Redis command/helper tests if present.
- Run `cargo check` from `src-tauri` before declaring completion.

Additional verification when local dependencies allow it:

- Run Redis integration tests that use `src-tauri/tests/redis_integration.rs`.
- Use `IT_REUSE_LOCAL_DB=1` when iterating against an already-running Redis
  instance.

Because Redis integration tests may require Docker or local Redis services,
failure to run them should be reported explicitly rather than hidden.

## Migration Strategy

1. Add `src-tauri/src/datasources/redis/` modules and move types/functions in
   small responsibility groups.
2. Keep `src-tauri/src/datasources/redis.rs` as the facade and re-export
   existing public API.
3. Add `RedisError` and migrate the connection/query helpers first, because most
   other modules depend on them.
4. Migrate scan, key/value, stream, zset, geo, server, and raw modules one group
   at a time.
5. Update `commands/redis.rs` helpers to consume typed Redis errors internally
   while returning `String` from Tauri commands.
6. Run formatting and Rust verification after each meaningful group or at least
   before final completion.

## Risks

- Moving many functions can accidentally change visibility. The facade should
  re-export deliberately and tests should continue importing through the old
  path.
- Redis cluster and sentinel behavior is more fragile than standalone behavior.
  Connection code should be moved before behavior is changed, and cluster-specific
  helpers should remain covered by existing integration tests where available.
- Full error migration may be too large for one mechanical pass. The acceptable
  Phase 1 fallback is to introduce the typed error path at core connection/query
  boundaries and prevent new string-tag protocols while leaving isolated legacy
  conversions for later cleanup.
