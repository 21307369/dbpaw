use crate::error::AppError;
use serde_json::Value;
use std::fs::File;
use std::io::{BufWriter, Write};
use std::time::Instant;

use super::{
    ElasticsearchBulkExportResult, ElasticsearchClient, ElasticsearchDocument,
    ElasticsearchSearchResponse, DEFAULT_BULK_BATCH_SIZE, EXPORT_SCROLL_TTL,
};

fn build_export_action_line(document_id: &str) -> Result<String, AppError> {
    serde_json::to_string(&serde_json::json!({ "index": { "_id": document_id } }))
        .map_err(|e| AppError::internal(format!("failed to encode bulk action: {e}")))
}

fn write_ndjson_pair(
    writer: &mut BufWriter<File>,
    action: &str,
    source: &Value,
) -> Result<(), AppError> {
    let source = serde_json::to_string(source)
        .map_err(|e| AppError::internal(format!("failed to encode document: {e}")))?;
    writer
        .write_all(action.as_bytes())
        .and_then(|_| writer.write_all(b"\n"))
        .and_then(|_| writer.write_all(source.as_bytes()))
        .and_then(|_| writer.write_all(b"\n"))
        .map_err(|e| AppError::internal(format!("write file failed: {e}")))
}

impl ElasticsearchClient {
    pub async fn search_documents(
        &self,
        index: String,
        query: Option<String>,
        dsl: Option<String>,
        from: i64,
        size: i64,
    ) -> Result<ElasticsearchSearchResponse, AppError> {
        let mut body = super::build_search_body(query, dsl)?;
        super::set_search_pagination(&mut body, Some(from), super::clamp_search_size(size))?;

        let started = Instant::now();
        let value = self
            .read_json(
                self.request(
                    reqwest::Method::POST,
                    &format!("/{}/_search", super::encode_path_segment(&index)),
                )
                .json(&body),
            )
            .await?;
        Ok(super::parse_search_response(
            value,
            started.elapsed().as_millis() as i64,
        ))
    }

    pub async fn get_document(
        &self,
        index: String,
        document_id: String,
    ) -> Result<ElasticsearchDocument, AppError> {
        let value = self
            .read_json(self.request(
                reqwest::Method::GET,
                &format!(
                    "/{}/_doc/{}",
                    super::encode_path_segment(&index),
                    super::encode_path_segment(&document_id)
                ),
            ))
            .await?;
        Ok(ElasticsearchDocument {
            index: value
                .get("_index")
                .and_then(Value::as_str)
                .unwrap_or(&index)
                .to_string(),
            id: value
                .get("_id")
                .and_then(Value::as_str)
                .unwrap_or(&document_id)
                .to_string(),
            found: value.get("found").and_then(Value::as_bool).unwrap_or(true),
            source: value.get("_source").cloned(),
            fields: value.get("fields").cloned(),
        })
    }

    pub async fn export_documents(
        &self,
        index: String,
        query: Option<String>,
        dsl: Option<String>,
        file_path: String,
        batch_size: Option<i64>,
    ) -> Result<ElasticsearchBulkExportResult, AppError> {
        let index = super::validate_index_name(&index)?;
        let output_path = super::bulk::validate_file_path(&file_path, "export")?;
        let batch_size = super::bulk::clamp_bulk_batch_size(
            batch_size.unwrap_or(DEFAULT_BULK_BATCH_SIZE),
        );
        let mut body = super::build_search_body(query, dsl)?;
        super::set_search_pagination(&mut body, None, batch_size)?;

        let file = File::create(&output_path).map_err(|e| AppError::internal(format!("{e}")))?;
        let mut writer = BufWriter::new(file);
        let started = Instant::now();
        let mut documents = 0i64;
        let mut batches = 0i64;
        let mut scroll_id: Option<String> = None;

        loop {
            let value = if let Some(id) = scroll_id.as_deref() {
                self.read_json(self.request(reqwest::Method::POST, "/_search/scroll").json(
                    &serde_json::json!({
                        "scroll": EXPORT_SCROLL_TTL,
                        "scroll_id": id
                    }),
                ))
                .await?
            } else {
                self.read_json(
                    self.request(
                        reqwest::Method::POST,
                        &format!(
                            "/{}/_search?scroll={}",
                            super::encode_path_segment(&index),
                            EXPORT_SCROLL_TTL
                        ),
                    )
                    .json(&body),
                )
                .await?
            };

            scroll_id = value
                .get("_scroll_id")
                .and_then(Value::as_str)
                .map(str::to_string);
            let hits = value
                .pointer("/hits/hits")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if hits.is_empty() {
                break;
            }

            batches += 1;
            for hit in hits {
                let document_id = hit
                    .get("_id")
                    .and_then(Value::as_str)
                    .ok_or_else(|| AppError::internal("Elasticsearch hit is missing _id"))?;
                let source = hit.get("_source").cloned().unwrap_or(Value::Null);
                let action = build_export_action_line(document_id)?;
                write_ndjson_pair(&mut writer, &action, &source)?;
                documents += 1;
            }
        }

        self.clear_scroll(scroll_id).await;
        writer
            .flush()
            .map_err(|e| AppError::internal(format!("{e}")))?;

        Ok(ElasticsearchBulkExportResult {
            file_path: output_path.to_string_lossy().to_string(),
            index,
            documents,
            batches,
            time_taken_ms: started.elapsed().as_millis() as i64,
        })
    }

    pub(crate) async fn clear_scroll(&self, scroll_id: Option<String>) {
        if let Some(id) = scroll_id {
            let _ = self
                .request(reqwest::Method::DELETE, "/_search/scroll")
                .json(&serde_json::json!({ "scroll_id": [id] }))
                .send()
                .await;
        }
    }
}
