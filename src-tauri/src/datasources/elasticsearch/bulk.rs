use crate::error::AppError;
use reqwest::header::CONTENT_TYPE;
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::time::Instant;

use super::{
    BulkAction, BulkActionKind, BulkBatchResult, BulkImportAccumulator, ElasticsearchClient,
    ElasticsearchBulkImportResult, ElasticsearchMutationResult, DEFAULT_BULK_BATCH_SIZE,
    MAX_BULK_ERRORS,
};

pub(crate) fn validate_file_path(file_path: &str, operation: &str) -> Result<std::path::PathBuf, AppError> {
    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation(format!(
            "Elasticsearch bulk {operation} file path cannot be empty"
        )));
    }
    Ok(std::path::PathBuf::from(trimmed))
}

pub(crate) fn parse_bulk_action_line(line: &str, line_number: usize) -> Result<BulkAction, AppError> {
    let value = serde_json::from_str::<Value>(line.trim()).map_err(|e| {
        AppError::validation(format!(
            "invalid bulk action JSON at line {line_number}: {e}"
        ))
    })?;
    let obj = value.as_object().ok_or_else(|| {
        AppError::validation(format!(
            "bulk action at line {line_number} must be a JSON object"
        ))
    })?;
    if obj.len() != 1 {
        return Err(AppError::validation(format!(
            "bulk action at line {line_number} must contain exactly one action"
        )));
    }
    let (action, metadata) = obj.iter().next().expect("bulk action has one key");
    let kind = match action.as_str() {
        "index" => BulkActionKind::Index,
        "create" => BulkActionKind::Create,
        _ => {
            return Err(AppError::validation(format!(
                "unsupported bulk action '{action}' at line {line_number}; expected index or create"
            )))
        }
    };
    let metadata = metadata
        .as_object()
        .ok_or_else(|| {
            AppError::validation(format!(
                "bulk action metadata at line {line_number} must be an object"
            ))
        })?
        .clone();
    Ok(BulkAction { kind, metadata })
}

pub(crate) fn build_bulk_action_line(index: &str, action: &BulkAction) -> Result<String, AppError> {
    let mut metadata = action.metadata.clone();
    metadata.insert("_index".to_string(), Value::String(index.to_string()));
    let action_name = match action.kind {
        BulkActionKind::Index => "index",
        BulkActionKind::Create => "create",
    };
    serde_json::to_string(&serde_json::json!({ action_name: metadata }))
        .map_err(|e| AppError::internal(format!("failed to encode bulk action: {e}")))
}

impl ElasticsearchClient {
    pub async fn upsert_document(
        &self,
        index: String,
        document_id: Option<String>,
        source: Value,
        refresh: bool,
    ) -> Result<ElasticsearchMutationResult, AppError> {
        if !source.is_object() {
            return Err(AppError::validation(
                "document source must be a JSON object",
            ));
        }
        let refresh_query = if refresh { "?refresh=true" } else { "" };
        let (method, path) = match document_id.and_then(|v| {
            let trimmed = v.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }) {
            Some(id) => (
                reqwest::Method::PUT,
                format!(
                    "/{}/_doc/{}{}",
                    super::encode_path_segment(&index),
                    super::encode_path_segment(&id),
                    refresh_query
                ),
            ),
            None => (
                reqwest::Method::POST,
                format!("/{}/_doc{}", super::encode_path_segment(&index), refresh_query),
            ),
        };
        self.read_mutation(self.request(method, &path).json(&source))
            .await
    }

    pub async fn delete_document(
        &self,
        index: String,
        document_id: String,
        refresh: bool,
    ) -> Result<ElasticsearchMutationResult, AppError> {
        let id = document_id.trim();
        if id.is_empty() {
            return Err(AppError::validation("document id cannot be empty"));
        }
        let refresh_query = if refresh { "?refresh=true" } else { "" };
        self.read_mutation(self.request(
            reqwest::Method::DELETE,
            &format!(
                "/{}/_doc/{}{}",
                super::encode_path_segment(&index),
                super::encode_path_segment(id),
                refresh_query
            ),
        ))
        .await
    }

    pub async fn import_documents(
        &self,
        index: String,
        file_path: String,
        batch_size: Option<i64>,
        refresh: bool,
    ) -> Result<ElasticsearchBulkImportResult, AppError> {
        let index = super::validate_index_name(&index)?;
        let import_path = validate_file_path(&file_path, "import")?;
        if !import_path.exists() {
            return Err(AppError::internal(
                "Elasticsearch bulk import file does not exist",
            ));
        }
        let batch_size = super::clamp_bulk_batch_size(batch_size.unwrap_or(DEFAULT_BULK_BATCH_SIZE));
        let file = File::open(&import_path).map_err(|e| AppError::internal(format!("{e}")))?;
        let mut reader = BufReader::new(file);
        let started = Instant::now();
        let mut line_number = 0usize;
        let mut action_line = String::new();
        let mut source_line = String::new();
        let mut batch = String::new();
        let mut batch_actions = 0i64;
        let mut accumulator = BulkImportAccumulator::default();

        loop {
            action_line.clear();
            let read = reader
                .read_line(&mut action_line)
                .map_err(|e| AppError::internal(format!("{e}")))?;
            if read == 0 {
                break;
            }
            line_number += 1;
            if action_line.trim().is_empty() {
                continue;
            }
            let action = parse_bulk_action_line(&action_line, line_number)?;

            source_line.clear();
            let read = reader
                .read_line(&mut source_line)
                .map_err(|e| AppError::internal(format!("{e}")))?;
            if read == 0 {
                return Err(AppError::validation(format!(
                    "missing bulk source line after action at line {line_number}"
                )));
            }
            line_number += 1;
            let source = serde_json::from_str::<Value>(source_line.trim()).map_err(|e| {
                AppError::validation(format!(
                    "invalid bulk source JSON at line {line_number}: {e}"
                ))
                .to_string()
            })?;
            if !source.is_object() {
                return Err(AppError::validation(format!(
                    "bulk source at line {line_number} must be a JSON object"
                )));
            }

            batch.push_str(&build_bulk_action_line(&index, &action)?);
            batch.push('\n');
            batch.push_str(
                &serde_json::to_string(&source).map_err(|e| AppError::internal(format!("{e}")))?,
            );
            batch.push('\n');
            batch_actions += 1;

            if batch_actions >= batch_size {
                self.flush_bulk_batch(
                    &index,
                    &mut batch,
                    &mut batch_actions,
                    refresh,
                    &mut accumulator,
                )
                .await?;
            }
        }

        self.flush_bulk_batch(
            &index,
            &mut batch,
            &mut batch_actions,
            refresh,
            &mut accumulator,
        )
        .await?;

        if accumulator.total_actions == 0 {
            return Err(AppError::internal(
                "Elasticsearch bulk file does not contain actions",
            ));
        }

        Ok(ElasticsearchBulkImportResult {
            file_path: import_path.to_string_lossy().to_string(),
            index,
            total_actions: accumulator.total_actions,
            successful: accumulator.successful,
            failed: accumulator.failed,
            errors: accumulator.errors,
            time_taken_ms: started.elapsed().as_millis() as i64,
        })
    }

    async fn flush_bulk_batch(
        &self,
        index: &str,
        batch: &mut String,
        batch_actions: &mut i64,
        refresh: bool,
        accumulator: &mut BulkImportAccumulator,
    ) -> Result<(), AppError> {
        if *batch_actions == 0 {
            return Ok(());
        }
        let result = self.send_bulk_batch(index, batch.clone(), refresh).await?;
        accumulator.add_batch(result);
        batch.clear();
        *batch_actions = 0;
        Ok(())
    }

    async fn send_bulk_batch(
        &self,
        index: &str,
        body: String,
        refresh: bool,
    ) -> Result<BulkBatchResult, AppError> {
        let refresh_query = if refresh { "?refresh=true" } else { "" };
        let response = self
            .request(
                reqwest::Method::POST,
                &format!("/{}/_bulk{}", super::encode_path_segment(index), refresh_query),
            )
            .header(CONTENT_TYPE, "application/x-ndjson")
            .body(body)
            .send()
            .await
            .map_err(|e| AppError::internal(format!("{e}")))?;
        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| AppError::internal(format!("{e}")))?;
        if !status.is_success() {
            return Err(super::client::normalize_error(status, &text));
        }
        let value =
            serde_json::from_str::<Value>(&text).map_err(|e| AppError::internal(format!("{e}")))?;
        let items = value
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let total = items.len() as i64;
        let mut failed = 0i64;
        let mut errors = Vec::new();

        for item in items {
            let Some(action_obj) = item.as_object().and_then(|obj| obj.values().next()) else {
                continue;
            };
            let status = action_obj
                .get("status")
                .and_then(Value::as_i64)
                .unwrap_or(0);
            if status >= 300 || action_obj.get("error").is_some() {
                failed += 1;
                if errors.len() < MAX_BULK_ERRORS {
                    let id = action_obj
                        .get("_id")
                        .and_then(Value::as_str)
                        .unwrap_or("<unknown>");
                    let reason = action_obj
                        .pointer("/error/reason")
                        .and_then(Value::as_str)
                        .or_else(|| action_obj.pointer("/error/type").and_then(Value::as_str))
                        .unwrap_or("bulk item failed");
                    errors.push(format!("{id}: HTTP {status}: {reason}"));
                }
            }
        }
        Ok(BulkBatchResult {
            total,
            successful: total - failed,
            failed,
            errors,
        })
    }
}
