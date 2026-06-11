use crate::error::AppError;
use sqlx::{Pool, Sqlite};
use std::collections::HashSet;

const MIGRATIONS: &[(i64, &str)] = &[
    (1, include_str!("../../migrations/001_initial.sql")),
    (2, include_str!("../../migrations/002_saved_queries.sql")),
    (
        3,
        include_str!("../../migrations/003_add_database_to_saved_queries.sql"),
    ),
    (4, include_str!("../../migrations/004_add_ssh_fields.sql")),
    (5, include_str!("../../migrations/005_ai_providers.sql")),
    (6, include_str!("../../migrations/006_ai_conversations.sql")),
    (7, include_str!("../../migrations/007_ai_messages.sql")),
    (
        8,
        include_str!("../../migrations/008_ai_provider_vendor_unique.sql"),
    ),
    (
        9,
        include_str!("../../migrations/009_ai_provider_type_relaxed.sql"),
    ),
    (
        10,
        include_str!("../../migrations/010_sql_execution_logs.sql"),
    ),
    (11, include_str!("../../migrations/011_add_ssl_fields.sql")),
    (
        12,
        include_str!("../../migrations/012_add_redis_connection_options.sql"),
    ),
    (
        13,
        include_str!("../../migrations/013_add_elasticsearch_connection_options.sql"),
    ),
    (
        14,
        include_str!("../../migrations/014_add_sentinel_fields.sql"),
    ),
    (
        15,
        include_str!("../../migrations/015_add_mongodb_auth_source.sql"),
    ),
    (
        16,
        include_str!("../../migrations/016_redis_command_logs.sql"),
    ),
];

pub async fn run_migrations(pool: &Pool<Sqlite>) -> Result<(), AppError> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| AppError::internal(format!("创建 schema_migrations 表失败: {e}")))?;

    let applied: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM schema_migrations ORDER BY version")
            .fetch_all(pool)
            .await
            .map_err(|e| AppError::internal(format!("查询已执行迁移失败: {e}")))?;

    if applied.is_empty() {
        let has_connections_table: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='connections')",
        )
        .fetch_one(pool)
        .await
        .map_err(|e| AppError::internal(format!("检测旧数据库失败: {e}")))?;

        if has_connections_table {
            for &(version, _) in MIGRATIONS {
                sqlx::query("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)")
                    .bind(version)
                    .execute(pool)
                    .await
                    .map_err(|e| AppError::internal(format!("记录迁移版本 {version} 失败: {e}")))?;
            }
            return Ok(());
        }
    }

    let applied_set: HashSet<i64> = applied.into_iter().collect();

    for &(version, sql) in MIGRATIONS {
        if applied_set.contains(&version) {
            continue;
        }
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| AppError::internal(format!("迁移 {version:03} 执行失败: {e}")))?;

        sqlx::query("INSERT INTO schema_migrations (version) VALUES (?)")
            .bind(version)
            .execute(pool)
            .await
            .map_err(|e| AppError::internal(format!("记录迁移版本 {version} 失败: {e}")))?;
    }

    Ok(())
}
