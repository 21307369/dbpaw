# Changelog

## v0.5.4 (2026-06-14)

### 🚀 New Features

- **Driver Capabilities System**: Added `DriverCapabilities` bitflags and capability sub-traits for dynamic feature detection
- **useDriverCapabilities Hook**: New hook with module-level cache for querying driver capabilities
- **get_driver_capabilities API**: New Tauri command and frontend wrapper for fetching driver capabilities
- **Redis ZSet Viewer**: Complete rewrite with modular hooks and components (`useZSetRangeQuery`, `useZSetEditing`, `useZSetRankScore`, `useZSetLexRange`, `useZSetPop`)
- **Structured Logging**: Replaced `println`/`eprintln` with `tracing` for structured logging across the application
- **AppError Variants**: Added `AlreadyExists` and `PermissionDenied` error variants

### 🔧 Refactoring

- **Database Driver Modularization**: Split monolithic driver files into modular structures:
  - ClickHouse: `connection.rs`, `metadata.rs`, `query.rs`, `table_data.rs`, `helpers.rs`
  - DuckDB: Split into modular structure
  - DB2: Split into modular structure
  - SQLite: Split into modular structure
  - PostgreSQL: Split into `connection/`, `metadata/`, `query/`, `table_data/` modules
  - MySQL: Split into `connection/metadata/query/table_data` modules
  - MSSQL: Split into `mssql/` module directory
  - Elasticsearch: Split into `client.rs`, `search.rs`, `index.rs`, `bulk.rs`

- **Frontend Component Decomposition**:
  - SqlEditor: Extracted hooks (`useSqlResults`, `useSqlEditorForm`, `useSqlEditorApi`, `useSqlEditorActions`) and components (`SqlToolbar`, `SqlResultsPanel`)
  - ConnectionDialog: Extracted components (`ConnectionTypeStep`, `ConnectionSummaryHeader`, `ConnectionBasicFields`, `ConnectionNetworkFields`, `ConnectionSecurityFields`, `ConnectionDialogFooter`)
  - RedisBrowserView: Extracted hooks (`useRedisSelection`, `useRedisKeyScan`, `useRedisBatchOps`, `useRedisDialogs`) and components (`KeySearchPanel`, `KeyListPanel`, `BatchOperationsToolbar`, `DetailPanel`, `RedisBrowserDialogs`)

- **API Layer**: Split `api.ts` into domain-specific modules under `services/api/`
- **Command Registration**: Modularized with per-module macros (`connection_commands!`, `metadata_commands!`, `query_commands!`, etc.)
- **Error Handling Migration**: Migrated all database drivers from string-based errors to structured `AppError`:
  - PostgreSQL, MySQL, MSSQL, Oracle, DB2, SQLite, DuckDB, MongoDB, Cassandra, ClickHouse, Elasticsearch, Redis
  - Removed legacy error string tags
  - `conn_failed_error` now returns `AppError` directly
  - Deprecated `From<String>` for `AppError`

### 🐛 Bug Fixes

- Fixed Cmd+S shortcut not working on macOS in SQL editor
- Fixed compilation errors from deduplication refactor
- Fixed Elasticsearch compilation errors
- Fixed TypeScript type errors in refactored components
- Fixed `useRedisSelection` code quality issues
- Removed dead `msetLoading` state from `useRedisDialogs` hook
- Fixed write lock release before closing connections in cleanup

### 🧪 Testing

- Added behavior tests for high-risk modules: `SqlEditor`, `ConnectionDialog`, `TabContentRenderer`, `useTabFactory`
- Added behavior tests for `useTableClipboard` and `useTableHotkeys` hooks
- Added comprehensive tests for shortcut recorder and match modules
- Added hook and view tests for Redis components
- Migrated integration test error assertions to new error codes
- Migrated AppError assertions in tests

### 📚 Documentation

- Added ClickHouse driver modularization design spec and implementation plan
- Added local migration system design spec and implementation plan
- Added command/direct deduplication design spec and implementation plan
- Added SqlEditor decomposition design spec and implementation plan
- Added component behavior tests design spec
- Added command registry modularization design spec and implementation plan
- Added error migration remaining work summary
- Updated AGENTS.md to reflect api.ts split into api/ directory
- Removed Japanese translation references from documentation
- 精简 DatabaseDriver Trait 设计文档

### 🌐 Internationalization

- Replaced hardcoded English strings in 4 components with i18n keys
- Removed unused Japanese locale file

### 📦 Dependencies

- Added `bitflags` for driver capability flags

---

## v0.5.3 (Previous Release)

See [GitHub Releases](https://github.com/codeErrorSleep/dbpaw/releases) for previous versions.
