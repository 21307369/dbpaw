use super::LocalDb;
use crate::error::AppError;
use crate::models::{RedisCommandLog, SqlExecutionLog};

impl LocalDb {
    pub async fn insert_sql_execution_log(
        &self,
        sql: String,
        source: Option<String>,
        connection_id: Option<i64>,
        database: Option<String>,
        success: bool,
        error: Option<String>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO sql_execution_logs (sql, source, connection_id, database, success, error) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(sql)
        .bind(source)
        .bind(connection_id)
        .bind(database)
        .bind(success)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[INSERT_SQL_EXECUTION_LOG_ERROR] {e}")))?;

        sqlx::query(
            "DELETE FROM sql_execution_logs WHERE id NOT IN (SELECT id FROM sql_execution_logs ORDER BY id DESC LIMIT 100)",
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[PRUNE_SQL_EXECUTION_LOGS_ERROR] {e}")))?;

        Ok(())
    }

    pub async fn list_sql_execution_logs(
        &self,
        limit: i64,
    ) -> Result<Vec<SqlExecutionLog>, AppError> {
        sqlx::query_as::<_, SqlExecutionLog>(
            "SELECT id, sql, source, connection_id, database, success, error, executed_at FROM sql_execution_logs ORDER BY id DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[LIST_SQL_EXECUTION_LOGS_ERROR] {e}")))
    }

    pub async fn insert_redis_command_log(
        &self,
        command: String,
        connection_id: Option<i64>,
        database: Option<String>,
        success: bool,
        error: Option<String>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO redis_command_logs (command, connection_id, database, success, error) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(command)
        .bind(connection_id)
        .bind(database)
        .bind(success)
        .bind(error)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[INSERT_REDIS_COMMAND_LOG_ERROR] {e}")))?;

        sqlx::query(
            "DELETE FROM redis_command_logs WHERE id NOT IN (SELECT id FROM redis_command_logs ORDER BY id DESC LIMIT 100)",
        )
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[PRUNE_REDIS_COMMAND_LOGS_ERROR] {e}")))?;

        Ok(())
    }

    pub async fn list_redis_command_logs(
        &self,
        limit: i64,
    ) -> Result<Vec<RedisCommandLog>, AppError> {
        sqlx::query_as::<_, RedisCommandLog>(
            "SELECT id, command, connection_id, database, success, error, executed_at FROM redis_command_logs ORDER BY id DESC LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[LIST_REDIS_COMMAND_LOGS_ERROR] {e}")))
    }
}
