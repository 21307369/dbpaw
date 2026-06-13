use super::LocalDb;
use crate::error::AppError;
use crate::models::SavedQuery;

impl LocalDb {
    pub async fn create_saved_query(
        &self,
        name: String,
        query: String,
        description: Option<String>,
        connection_id: Option<i64>,
        database: Option<String>,
    ) -> Result<SavedQuery, AppError> {
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO saved_queries (name, query, description, connection_id, database) VALUES (?, ?, ?, ?, ?) RETURNING id"
        )
        .bind(&name)
        .bind(&query)
        .bind(description)
        .bind(connection_id)
        .bind(database)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[CREATE_QUERY_ERROR] {e}")))?;

        self.get_saved_query_by_id(id).await
    }

    pub async fn update_saved_query(
        &self,
        id: i64,
        name: String,
        query: String,
        description: Option<String>,
        connection_id: Option<i64>,
        database: Option<String>,
    ) -> Result<SavedQuery, AppError> {
        sqlx::query(
            "UPDATE saved_queries SET name = ?, query = ?, description = ?, connection_id = ?, database = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .bind(&name)
        .bind(&query)
        .bind(description)
        .bind(connection_id)
        .bind(database)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[UPDATE_QUERY_ERROR] {e}")))?;

        self.get_saved_query_by_id(id).await
    }

    pub async fn delete_saved_query(&self, id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM saved_queries WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::internal(format!("[DELETE_QUERY_ERROR] {e}")))?;
        Ok(())
    }

    pub async fn list_saved_queries(&self) -> Result<Vec<SavedQuery>, AppError> {
        let rows = sqlx::query_as::<_, SavedQuery>(
            "SELECT id, name, query, description, connection_id, database, created_at, updated_at FROM saved_queries ORDER BY updated_at DESC"
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[LIST_QUERIES_ERROR] {e}")))?;
        Ok(rows)
    }

    pub async fn get_saved_query_by_id(&self, id: i64) -> Result<SavedQuery, AppError> {
        sqlx::query_as::<_, SavedQuery>(
            "SELECT id, name, query, description, connection_id, database, created_at, updated_at FROM saved_queries WHERE id = ?"
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[GET_QUERY_ERROR] {e}")))
    }
}
