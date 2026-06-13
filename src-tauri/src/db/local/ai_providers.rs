use super::LocalDb;
use crate::error::AppError;
use crate::models::{AiProvider, AiProviderForm, AiProviderPublic};

impl LocalDb {
    pub async fn list_ai_providers(&self) -> Result<Vec<AiProvider>, AppError> {
        sqlx::query_as::<_, AiProvider>(
            "SELECT id, name, provider_type, base_url, model, api_key, is_default, enabled, extra_json, created_at, updated_at FROM ai_providers ORDER BY is_default DESC, updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[LIST_AI_PROVIDERS_ERROR] {e}")))
    }

    pub async fn list_ai_providers_public(&self) -> Result<Vec<AiProviderPublic>, AppError> {
        sqlx::query_as::<_, AiProviderPublic>(
            "SELECT id, name, provider_type, base_url, model, CASE WHEN api_key LIKE 'enc:v1:%' THEN 1 ELSE 0 END AS has_api_key, is_default, enabled, extra_json, created_at, updated_at FROM ai_providers ORDER BY is_default DESC, updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[LIST_AI_PROVIDERS_PUBLIC_ERROR] {e}")))
    }

    pub async fn get_ai_provider_public_by_id(
        &self,
        id: i64,
    ) -> Result<AiProviderPublic, AppError> {
        sqlx::query_as::<_, AiProviderPublic>(
            "SELECT id, name, provider_type, base_url, model, CASE WHEN api_key LIKE 'enc:v1:%' THEN 1 ELSE 0 END AS has_api_key, is_default, enabled, extra_json, created_at, updated_at FROM ai_providers WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[GET_AI_PROVIDER_PUBLIC_ERROR] {e}")))
    }

    pub async fn clear_ai_provider_api_key(&self, provider_type: &str) -> Result<(), AppError> {
        sqlx::query("UPDATE ai_providers SET api_key = '', updated_at = datetime('now') WHERE provider_type = ?")
            .bind(provider_type)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::internal(format!("[CLEAR_AI_PROVIDER_API_KEY_ERROR] {e}")))?;
        Ok(())
    }

    pub async fn get_ai_provider_by_id(&self, id: i64) -> Result<AiProvider, AppError> {
        sqlx::query_as::<_, AiProvider>(
            "SELECT id, name, provider_type, base_url, model, api_key, is_default, enabled, extra_json, created_at, updated_at FROM ai_providers WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[GET_AI_PROVIDER_ERROR] {e}")))
    }

    pub async fn get_default_ai_provider(&self) -> Result<AiProvider, AppError> {
        let provider = sqlx::query_as::<_, AiProvider>(
            "SELECT id, name, provider_type, base_url, model, api_key, is_default, enabled, extra_json, created_at, updated_at FROM ai_providers WHERE enabled = 1 ORDER BY is_default DESC, updated_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[GET_DEFAULT_AI_PROVIDER_ERROR] {e}")))?;

        provider.ok_or_else(|| {
            AppError::validation(
                "No enabled AI provider is configured. Please enable one in AI Provider settings.",
            )
        })
    }

    pub async fn create_ai_provider(&self, form: AiProviderForm) -> Result<AiProvider, AppError> {
        let provider_type = form.provider_type.unwrap_or_else(|| "openai".to_string());
        let api_key_plain = form.api_key.as_deref().unwrap_or("").trim();
        if api_key_plain.is_empty() {
            return Err(AppError::validation("apiKey is required"));
        }
        let api_key = self.encrypt_ai_api_key(api_key_plain)?;
        let has_default_provider: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM ai_providers WHERE is_default = 1 AND enabled = 1)",
        )
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[CREATE_AI_PROVIDER_DEFAULT_CHECK_ERROR] {e}")))?;
        let enabled = form.enabled.unwrap_or(true);

        let existing_id = sqlx::query_scalar::<_, i64>(
            "SELECT id FROM ai_providers WHERE provider_type = ? LIMIT 1",
        )
        .bind(&provider_type)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[CREATE_AI_PROVIDER_FIND_EXISTING_ERROR] {e}")))?;

        match existing_id {
            Some(id) => {
                let existing = self.get_ai_provider_by_id(id).await?;
                let is_default = form.is_default.unwrap_or(
                    (existing.is_default && enabled) || (!has_default_provider && enabled),
                );
                if is_default {
                    sqlx::query("UPDATE ai_providers SET is_default = 0")
                        .execute(&self.pool)
                        .await
                        .map_err(|e| {
                            AppError::internal(format!(
                                "[CREATE_AI_PROVIDER_DEFAULT_RESET_ERROR] {e}"
                            ))
                        })?;
                }
                sqlx::query(
                    "UPDATE ai_providers SET name = ?, base_url = ?, model = ?, api_key = ?, is_default = ?, enabled = ?, extra_json = ?, updated_at = datetime('now') WHERE id = ?",
                )
                .bind(form.name)
                .bind(form.base_url)
                .bind(form.model)
                .bind(api_key)
                .bind(is_default)
                .bind(enabled)
                .bind(form.extra_json)
                .bind(id)
                .execute(&self.pool)
                .await
                .map_err(|e| AppError::internal(format!("[CREATE_AI_PROVIDER_UPSERT_UPDATE_ERROR] {e}")))?;

                self.get_ai_provider_by_id(id).await
            }
            None => {
                let is_default = form.is_default.unwrap_or(!has_default_provider && enabled);
                if is_default {
                    sqlx::query("UPDATE ai_providers SET is_default = 0")
                        .execute(&self.pool)
                        .await
                        .map_err(|e| {
                            AppError::internal(format!(
                                "[CREATE_AI_PROVIDER_DEFAULT_RESET_ERROR] {e}"
                            ))
                        })?;
                }
                let id = sqlx::query_scalar::<_, i64>(
                    "INSERT INTO ai_providers (name, provider_type, base_url, model, api_key, is_default, enabled, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                )
                .bind(form.name)
                .bind(provider_type)
                .bind(form.base_url)
                .bind(form.model)
                .bind(api_key)
                .bind(is_default)
                .bind(enabled)
                .bind(form.extra_json)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| AppError::internal(format!("[CREATE_AI_PROVIDER_INSERT_ERROR] {e}")))?;

                self.get_ai_provider_by_id(id).await
            }
        }
    }

    pub async fn update_ai_provider(
        &self,
        id: i64,
        form: AiProviderForm,
    ) -> Result<AiProvider, AppError> {
        let existing = self.get_ai_provider_by_id(id).await?;
        let provider_type = form
            .provider_type
            .clone()
            .unwrap_or(existing.provider_type.clone());
        let api_key = match form.api_key.as_deref().map(str::trim) {
            Some(v) if !v.is_empty() => self.encrypt_ai_api_key(v)?,
            _ => existing.api_key.clone(),
        };
        let is_default = form.is_default.unwrap_or(existing.is_default);
        let enabled = form.enabled.unwrap_or(existing.enabled);
        let extra_json = form.extra_json.clone().or(existing.extra_json.clone());

        if is_default {
            sqlx::query("UPDATE ai_providers SET is_default = 0")
                .execute(&self.pool)
                .await
                .map_err(|e| {
                    AppError::internal(format!("[UPDATE_AI_PROVIDER_DEFAULT_RESET_ERROR] {e}"))
                })?;
        }

        sqlx::query(
            "UPDATE ai_providers SET name = ?, provider_type = ?, base_url = ?, model = ?, api_key = ?, is_default = ?, enabled = ?, extra_json = ?, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(form.name)
        .bind(provider_type)
        .bind(form.base_url)
        .bind(form.model)
        .bind(api_key)
        .bind(is_default)
        .bind(enabled)
        .bind(extra_json)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[UPDATE_AI_PROVIDER_ERROR] {e}")))?;

        self.get_ai_provider_by_id(id).await
    }

    pub async fn delete_ai_provider(&self, id: i64) -> Result<(), AppError> {
        sqlx::query("DELETE FROM ai_providers WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::internal(format!("[DELETE_AI_PROVIDER_ERROR] {e}")))?;
        Ok(())
    }

    pub async fn set_default_ai_provider(&self, id: i64) -> Result<(), AppError> {
        let target_enabled =
            sqlx::query_scalar::<_, bool>("SELECT enabled FROM ai_providers WHERE id = ?")
                .bind(id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| {
                    AppError::internal(format!("[SET_DEFAULT_AI_PROVIDER_LOOKUP_ERROR] {e}"))
                })?;

        let Some(enabled) = target_enabled else {
            return Err(AppError::not_found("Provider not found"));
        };
        if !enabled {
            return Err(AppError::validation(
                "Disabled provider cannot be set as default",
            ));
        }

        sqlx::query("UPDATE ai_providers SET is_default = 0")
            .execute(&self.pool)
            .await
            .map_err(|e| {
                AppError::internal(format!("[SET_DEFAULT_AI_PROVIDER_RESET_ERROR] {e}"))
            })?;
        sqlx::query(
            "UPDATE ai_providers SET is_default = 1, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::internal(format!("[SET_DEFAULT_AI_PROVIDER_ERROR] {e}")))?;
        Ok(())
    }
}
