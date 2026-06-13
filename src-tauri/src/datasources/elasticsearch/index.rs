use crate::error::AppError;
use serde_json::Value;

use super::{
    ElasticsearchClient, ElasticsearchIndexInfo, ElasticsearchIndexOperationResult,
};

fn parse_docs_count(raw: Option<&str>) -> Option<i64> {
    raw.and_then(|v| v.parse::<i64>().ok())
}

impl ElasticsearchClient {
    pub async fn list_indices(&self) -> Result<Vec<ElasticsearchIndexInfo>, AppError> {
        let value = self
            .read_json(self.request(
                reqwest::Method::GET,
                "/_cat/indices?format=json&h=health,status,index,uuid,pri,rep,docs.count,store.size&s=index",
            ))
            .await?;
        let rows = value.as_array().cloned().unwrap_or_default();
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let name = row.get("index").and_then(Value::as_str)?.to_string();
                Some(ElasticsearchIndexInfo {
                    is_system: name.starts_with('.'),
                    name,
                    health: row
                        .get("health")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    status: row
                        .get("status")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    uuid: row.get("uuid").and_then(Value::as_str).map(str::to_string),
                    primary_shards: row.get("pri").and_then(Value::as_str).map(str::to_string),
                    replica_shards: row.get("rep").and_then(Value::as_str).map(str::to_string),
                    docs_count: parse_docs_count(row.get("docs.count").and_then(Value::as_str)),
                    store_size: row
                        .get("store.size")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                })
            })
            .collect())
    }

    pub async fn get_index_mapping(&self, index: String) -> Result<Value, AppError> {
        self.read_json(self.request(
            reqwest::Method::GET,
            &format!("/{}/_mapping", super::encode_path_segment(&index)),
        ))
        .await
    }

    pub async fn create_index(
        &self,
        index: String,
        body: Option<Value>,
    ) -> Result<ElasticsearchIndexOperationResult, AppError> {
        let index = super::validate_index_name(&index)?;
        let body = body.unwrap_or_else(|| serde_json::json!({}));
        if !body.is_object() {
            return Err(AppError::validation("index body must be a JSON object"));
        }
        self.read_index_operation(
            self.request(
                reqwest::Method::PUT,
                &format!("/{}", super::encode_path_segment(&index)),
            )
            .json(&body),
            Some(index),
        )
        .await
    }

    pub async fn delete_index(
        &self,
        index: String,
    ) -> Result<ElasticsearchIndexOperationResult, AppError> {
        let index = super::validate_index_name(&index)?;
        self.read_index_operation(
            self.request(
                reqwest::Method::DELETE,
                &format!("/{}", super::encode_path_segment(&index)),
            ),
            Some(index),
        )
        .await
    }

    pub async fn refresh_index(
        &self,
        index: String,
    ) -> Result<ElasticsearchIndexOperationResult, AppError> {
        let index = super::validate_index_name(&index)?;
        self.read_index_operation(
            self.request(
                reqwest::Method::POST,
                &format!("/{}/_refresh", super::encode_path_segment(&index)),
            ),
            Some(index),
        )
        .await
    }

    pub async fn open_index(
        &self,
        index: String,
    ) -> Result<ElasticsearchIndexOperationResult, AppError> {
        let index = super::validate_index_name(&index)?;
        self.read_index_operation(
            self.request(
                reqwest::Method::POST,
                &format!("/{}/_open", super::encode_path_segment(&index)),
            ),
            Some(index),
        )
        .await
    }

    pub async fn close_index(
        &self,
        index: String,
    ) -> Result<ElasticsearchIndexOperationResult, AppError> {
        let index = super::validate_index_name(&index)?;
        self.read_index_operation(
            self.request(
                reqwest::Method::POST,
                &format!("/{}/_close", super::encode_path_segment(&index)),
            ),
            Some(index),
        )
        .await
    }
}
