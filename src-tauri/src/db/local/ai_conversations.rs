use super::LocalDb;
use crate::error::AppError;
use crate::models::{AiConversation, AiMessage};

impl LocalDb {
    pub async fn create_ai_conversation(
        &self,
        title: String,
        scenario: String,
        connection_id: Option<i64>,
        database: Option<String>,
    ) -> Result<AiConversation, AppError> {
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO ai_conversations (title, scenario, connection_id, database) VALUES (?, ?, ?, ?) RETURNING id",
        )
        .bind(title)
        .bind(scenario)
        .bind(connection_id)
        .bind(database)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[CREATE_AI_CONVERSATION_ERROR] {e}")))?;
        self.get_ai_conversation(id).await
    }

    pub async fn list_ai_conversations(
        &self,
        connection_id: Option<i64>,
        database: Option<String>,
    ) -> Result<Vec<AiConversation>, AppError> {
        let mut query = "SELECT id, title, scenario, connection_id, database, created_at, updated_at FROM ai_conversations".to_string();
        let mut has_where = false;
        if connection_id.is_some() {
            query.push_str(" WHERE connection_id = ?");
            has_where = true;
        }
        if database.is_some() {
            if has_where {
                query.push_str(" AND database = ?");
            } else {
                query.push_str(" WHERE database = ?");
            }
        }
        query.push_str(" ORDER BY updated_at DESC");

        let mut q = sqlx::query_as::<_, AiConversation>(&query);
        if let Some(id) = connection_id {
            q = q.bind(id);
        }
        if let Some(db) = database {
            q = q.bind(db);
        }
        q.fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::internal(format!("[LIST_AI_CONVERSATIONS_ERROR] {e}")))
    }

    pub async fn get_ai_conversation(&self, id: i64) -> Result<AiConversation, AppError> {
        sqlx::query_as::<_, AiConversation>(
            "SELECT id, title, scenario, connection_id, database, created_at, updated_at FROM ai_conversations WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[GET_AI_CONVERSATION_ERROR] {e}")))
    }

    pub async fn delete_ai_conversation(&self, id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM ai_messages WHERE conversation_id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| {
                AppError::internal(format!("[DELETE_AI_CONVERSATION_MESSAGES_ERROR] {e}"))
            })?;
        sqlx::query("DELETE FROM ai_conversations WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::internal(format!("[DELETE_AI_CONVERSATION_ERROR] {e}")))?;
        Ok(())
    }

    pub async fn touch_ai_conversation(&self, id: i64) -> Result<(), AppError> {
        sqlx::query("UPDATE ai_conversations SET updated_at = datetime('now') WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::internal(format!("[TOUCH_AI_CONVERSATION_ERROR] {e}")))?;
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn create_ai_message(
        &self,
        conversation_id: i64,
        role: String,
        content: String,
        prompt_version: Option<String>,
        model: Option<String>,
        token_in: Option<i64>,
        token_out: Option<i64>,
        latency_ms: Option<i64>,
    ) -> Result<AiMessage, AppError> {
        let id = sqlx::query_scalar::<_, i64>(
            "INSERT INTO ai_messages (conversation_id, role, content, prompt_version, model, token_in, token_out, latency_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
        )
        .bind(conversation_id)
        .bind(role)
        .bind(content)
        .bind(prompt_version)
        .bind(model)
        .bind(token_in)
        .bind(token_out)
        .bind(latency_ms)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[CREATE_AI_MESSAGE_ERROR] {e}")))?;

        self.get_ai_message(id).await
    }

    pub async fn get_ai_message(&self, id: i64) -> Result<AiMessage, AppError> {
        sqlx::query_as::<_, AiMessage>(
            "SELECT id, conversation_id, role, content, prompt_version, model, token_in, token_out, latency_ms, created_at FROM ai_messages WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[GET_AI_MESSAGE_ERROR] {e}")))
    }

    pub async fn list_ai_messages(&self, conversation_id: i64) -> Result<Vec<AiMessage>, AppError> {
        sqlx::query_as::<_, AiMessage>(
            "SELECT id, conversation_id, role, content, prompt_version, model, token_in, token_out, latency_ms, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        )
        .bind(conversation_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[LIST_AI_MESSAGES_ERROR] {e}")))
    }
}
