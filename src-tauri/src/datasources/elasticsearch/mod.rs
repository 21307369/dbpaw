mod bulk;
mod client;
mod index;
mod search;

use crate::error::AppError;
use crate::models::ConnectionForm;
use reqwest::header::CONTENT_TYPE;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::time::Instant;

pub use client::build_base_url;
pub use search::search_documents;
pub use index::list_indices;
pub use bulk::import_documents;

pub(crate) const DEFAULT_ELASTICSEARCH_PORT: i64 = 9200;
pub(crate) const DEFAULT_CONNECT_TIMEOUT_MS: i64 = 5000;
const MAX_SEARCH_SIZE: i64 = 500;
const DEFAULT_BULK_BATCH_SIZE: i64 = 1000;
const MAX_BULK_BATCH_SIZE: i64 = 5000;
const MAX_BULK_ERRORS: usize = 20;
const EXPORT_SCROLL_TTL: &str = "1m";

#[derive(Clone)]
pub struct ElasticsearchClient {
    client: reqwest::Client,
    base_url: String,
    auth: ElasticsearchAuth,
    /// Held to keep the SSH tunnel alive for the lifetime of this client.
    #[allow(dead_code)]
    ssh_tunnel: Option<crate::ssh::SshTunnel>,
}

#[derive(Clone)]
enum ElasticsearchAuth {
    None,
    Basic {
        username: String,
        password: Option<String>,
    },
    ApiKey(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchConnectionInfo {
    pub cluster_name: Option<String>,
    pub cluster_uuid: Option<String>,
    pub version: Option<String>,
    pub tagline: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchIndexInfo {
    pub name: String,
    pub health: Option<String>,
    pub status: Option<String>,
    pub uuid: Option<String>,
    pub primary_shards: Option<String>,
    pub replica_shards: Option<String>,
    pub docs_count: Option<i64>,
    pub store_size: Option<String>,
    pub is_system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchSearchHit {
    pub index: String,
    pub id: String,
    pub score: Option<f64>,
    pub source: Value,
    pub fields: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchSearchResponse {
    pub hits: Vec<ElasticsearchSearchHit>,
    pub total: i64,
    pub took_ms: i64,
    pub aggregations: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchDocument {
    pub index: String,
    pub id: String,
    pub found: bool,
    pub source: Option<Value>,
    pub fields: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchMutationResult {
    pub index: Option<String>,
    pub id: Option<String>,
    pub result: Option<String>,
    pub status: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchIndexOperationResult {
    pub index: Option<String>,
    pub acknowledged: Option<bool>,
    pub shards_acknowledged: Option<bool>,
    pub status: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchRawResponse {
    pub status: u16,
    pub body: String,
    pub json: Option<Value>,
    pub took_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchBulkExportResult {
    pub file_path: String,
    pub index: String,
    pub documents: i64,
    pub batches: i64,
    pub time_taken_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElasticsearchBulkImportResult {
    pub file_path: String,
    pub index: String,
    pub total_actions: i64,
    pub successful: i64,
    pub failed: i64,
    pub errors: Vec<String>,
    pub time_taken_ms: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum BulkActionKind {
    Index,
    Create,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct BulkAction {
    kind: BulkActionKind,
    metadata: serde_json::Map<String, Value>,
}

#[derive(Debug, Default)]
struct BulkBatchResult {
    total: i64,
    successful: i64,
    failed: i64,
    errors: Vec<String>,
}

#[derive(Debug, Default)]
struct BulkImportAccumulator {
    total_actions: i64,
    successful: i64,
    failed: i64,
    errors: Vec<String>,
}

impl BulkImportAccumulator {
    fn add_batch(&mut self, batch: BulkBatchResult) {
        self.total_actions += batch.total;
        self.successful += batch.successful;
        self.failed += batch.failed;
        for error in batch.errors {
            if self.errors.len() < MAX_BULK_ERRORS {
                self.errors.push(error);
            }
        }
    }
}

pub(crate) fn clamp_search_size(size: i64) -> i64 {
    size.clamp(1, MAX_SEARCH_SIZE)
}

pub(crate) fn clamp_bulk_batch_size(size: i64) -> i64 {
    size.clamp(1, MAX_BULK_BATCH_SIZE)
}

pub(crate) fn validate_index_name(index: &str) -> Result<String, AppError> {
    let trimmed = index.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("index name cannot be empty"));
    }
    Ok(trimmed.to_string())
}

pub(crate) fn validate_raw_path(path: &str) -> Result<String, AppError> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(AppError::validation("request path cannot be empty"));
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Err(AppError::validation(
            "raw requests must use a path, not a full URL",
        ));
    }
    let path = if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    };
    if path.contains("..") {
        return Err(AppError::validation("request path cannot contain '..'"));
    }
    Ok(path)
}

pub(crate) fn encode_path_segment(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

pub(crate) fn build_search_body(
    query: Option<String>,
    dsl: Option<String>,
) -> Result<Value, AppError> {
    if let Some(raw) = dsl.and_then(|v| {
        let trimmed = v.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    }) {
        return serde_json::from_str::<Value>(&raw)
            .map_err(|e| AppError::validation(format!("invalid Elasticsearch DSL JSON: {e}")));
    }
    if let Some(q) = query.and_then(|v| {
        let trimmed = v.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    }) {
        return Ok(serde_json::json!({ "query": { "query_string": { "query": q } } }));
    }
    Ok(serde_json::json!({ "query": { "match_all": {} } }))
}

pub(crate) fn set_search_pagination(
    body: &mut Value,
    from: Option<i64>,
    size: i64,
) -> Result<(), AppError> {
    let obj = body
        .as_object_mut()
        .ok_or_else(|| AppError::validation("Elasticsearch DSL must be a JSON object"))?;
    if let Some(from) = from {
        obj.insert("from".to_string(), Value::from(from.max(0)));
    } else {
        obj.remove("from");
    }
    obj.insert("size".to_string(), Value::from(size));
    Ok(())
}

pub(crate) fn parse_search_response(
    value: Value,
    elapsed_ms: i64,
) -> ElasticsearchSearchResponse {
    let took_ms = value
        .get("took")
        .and_then(Value::as_i64)
        .unwrap_or(elapsed_ms);
    let total = match value.pointer("/hits/total") {
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0),
        Some(Value::Object(obj)) => obj.get("value").and_then(Value::as_i64).unwrap_or(0),
        _ => 0,
    };
    let hits = value
        .pointer("/hits/hits")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|hit| {
            Some(ElasticsearchSearchHit {
                index: hit.get("_index")?.as_str()?.to_string(),
                id: hit.get("_id")?.as_str()?.to_string(),
                score: hit.get("_score").and_then(Value::as_f64),
                source: hit.get("_source").cloned().unwrap_or(Value::Null),
                fields: hit.get("fields").cloned(),
            })
        })
        .collect();
    ElasticsearchSearchResponse {
        hits,
        total,
        took_ms,
        aggregations: value.get("aggregations").cloned(),
    }
}

impl ElasticsearchClient {
    pub async fn execute_raw(
        &self,
        method: String,
        path: String,
        body: Option<String>,
    ) -> Result<ElasticsearchRawResponse, AppError> {
        let method = match method.trim().to_ascii_uppercase().as_str() {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "PUT" => reqwest::Method::PUT,
            "DELETE" => reqwest::Method::DELETE,
            "PATCH" => reqwest::Method::PATCH,
            _ => {
                return Err(AppError::validation(
                    "method must be one of GET, POST, PUT, DELETE, PATCH",
                ))
            }
        };
        let path = validate_raw_path(&path)?;
        let mut req = self.request(method, &path);
        if let Some(raw) = body.and_then(|v| {
            let trimmed = v.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        }) {
            let json = serde_json::from_str::<Value>(&raw)
                .map_err(|e| AppError::validation(format!("invalid JSON body: {e}")))?;
            req = req.json(&json);
        }

        let started = Instant::now();
        let response = req
            .send()
            .await
            .map_err(|e| AppError::internal(format!("{e}")))?;
        let status = response.status();
        let status_code = status.as_u16();
        let text = response
            .text()
            .await
            .map_err(|e| AppError::internal(format!("{e}")))?;
        if !status.is_success() {
            return Err(normalize_error(status, &text));
        }
        Ok(ElasticsearchRawResponse {
            status: status_code,
            json: serde_json::from_str::<Value>(&text).ok(),
            body: text,
            took_ms: started.elapsed().as_millis() as i64,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_api_key, build_auth, build_base_url, build_reqwest_client,
        build_search_body, clamp_bulk_batch_size, clamp_search_size, normalize_error,
        parse_docs_count, parse_search_response, set_search_pagination,
        validate_index_name, validate_raw_path, BulkActionKind,
        ElasticsearchAuth,
    };
    use super::bulk::{validate_file_path, parse_bulk_action_line, build_bulk_action_line};
    use crate::models::ConnectionForm;
    use base64::{engine::general_purpose, Engine as _};
    use reqwest::StatusCode;

    #[test]
    fn build_base_url_uses_http_by_default() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            host: Some(" localhost ".to_string()),
            port: Some(9201),
            ..Default::default()
        };
        assert_eq!(build_base_url(&form).unwrap(), "http://localhost:9201");
    }

    #[test]
    fn build_base_url_strips_scheme_and_uses_https_when_ssl_enabled() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            host: Some("http://es.local/".to_string()),
            port: None,
            ssl: Some(true),
            ..Default::default()
        };
        assert_eq!(build_base_url(&form).unwrap(), "https://es.local:9200");
    }

    #[test]
    fn build_base_url_uses_cloud_id_when_present() {
        let encoded = general_purpose::STANDARD.encode("example.es.io$abc123$kibana123");
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            host: Some("ignored.local".to_string()),
            port: Some(9200),
            cloud_id: Some(format!("deployment:{encoded}")),
            ..Default::default()
        };
        assert_eq!(
            build_base_url(&form).unwrap(),
            "https://abc123.example.es.io"
        );
    }

    #[test]
    fn build_base_url_rejects_invalid_cloud_id() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            cloud_id: Some("not-base64".to_string()),
            ..Default::default()
        };
        assert!(build_base_url(&form).is_err());
    }

    #[test]
    fn build_api_key_supports_encoded_and_id_secret() {
        let encoded_form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            api_key_encoded: Some("already-encoded".to_string()),
            ..Default::default()
        };
        assert_eq!(
            build_api_key(&encoded_form).unwrap().as_deref(),
            Some("already-encoded")
        );

        let split_form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            api_key_id: Some("id".to_string()),
            api_key_secret: Some("secret".to_string()),
            ..Default::default()
        };
        assert_eq!(
            build_api_key(&split_form).unwrap().as_deref(),
            Some(general_purpose::STANDARD.encode("id:secret").as_str())
        );
    }

    #[test]
    fn verify_ca_requires_certificate() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            host: Some("localhost".to_string()),
            ssl: Some(true),
            ssl_mode: Some("verify_ca".to_string()),
            ..Default::default()
        };
        assert!(build_reqwest_client(&form, 5000).is_err());
    }

    #[test]
    fn normalize_error_prefers_elasticsearch_reason() {
        let body = r#"{"error":{"reason":"bad query","type":"search_phase_execution_exception"}}"#;
        let err = normalize_error(StatusCode::BAD_REQUEST, body).to_string();
        assert!(err.contains("HTTP 400"));
        assert!(err.contains("bad query"));
    }

    #[test]
    fn clamp_search_size_bounds_values() {
        assert_eq!(clamp_search_size(0), 1);
        assert_eq!(clamp_search_size(50), 50);
        assert_eq!(clamp_search_size(1000), 500);
    }

    #[test]
    fn clamp_bulk_batch_size_bounds_values() {
        assert_eq!(clamp_bulk_batch_size(0), 1);
        assert_eq!(clamp_bulk_batch_size(1000), 1000);
        assert_eq!(clamp_bulk_batch_size(9000), 5000);
    }

    #[test]
    fn parse_bulk_action_accepts_index_and_create() {
        let index =
            parse_bulk_action_line(r#"{"index":{"_id":"1","_index":"old","routing":"r1"}}"#, 1)
                .unwrap();
        assert_eq!(index.kind, BulkActionKind::Index);
        assert_eq!(index.metadata["_id"], "1");
        assert_eq!(index.metadata["routing"], "r1");

        let create = parse_bulk_action_line(r#"{"create":{}}"#, 3).unwrap();
        assert_eq!(create.kind, BulkActionKind::Create);
        assert!(create.metadata.is_empty());
    }

    #[test]
    fn parse_bulk_action_rejects_delete_and_multi_action() {
        assert!(parse_bulk_action_line(r#"{"delete":{"_id":"1"}}"#, 1).is_err());
        assert!(parse_bulk_action_line(r#"{"index":{},"create":{}}"#, 1).is_err());
    }

    #[test]
    fn build_bulk_action_line_targets_current_index() {
        let action =
            parse_bulk_action_line(r#"{"index":{"_id":"1","_index":"old","routing":"r1"}}"#, 1)
                .unwrap();
        let line = build_bulk_action_line("new-index", &action).unwrap();
        let value: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(value["index"]["_index"], "new-index");
        assert_eq!(value["index"]["_id"], "1");
        assert_eq!(value["index"]["routing"], "r1");
    }

    #[test]
    fn encode_path_segment_escapes_reserved_characters() {
        assert_eq!(super::encode_path_segment("a/b c"), "a%2Fb%20c");
    }

    #[test]
    fn validate_raw_path_rejects_full_urls() {
        assert!(validate_raw_path("https://example.com/_search").is_err());
        assert_eq!(
            validate_raw_path("_cluster/health").unwrap(),
            "/_cluster/health"
        );
    }

    #[test]
    fn validate_index_name_rejects_empty_values() {
        assert!(validate_index_name("   ").is_err());
        assert_eq!(validate_index_name(" products ").unwrap(), "products");
    }

    #[test]
    fn parse_search_response_preserves_aggregations() {
        let response = parse_search_response(
            serde_json::json!({
                "took": 4,
                "hits": {
                    "total": { "value": 1 },
                    "hits": [{
                        "_index": "products",
                        "_id": "1",
                        "_score": 1.0,
                        "_source": { "category": "books" }
                    }]
                },
                "aggregations": {
                    "by_category": {
                        "buckets": [{ "key": "books", "doc_count": 1 }]
                    }
                }
            }),
            99,
        );
        assert_eq!(response.took_ms, 4);
        assert_eq!(response.total, 1);
        assert_eq!(response.hits.len(), 1);
        assert_eq!(
            response.aggregations.unwrap()["by_category"]["buckets"][0]["key"],
            "books"
        );
    }

    #[test]
    fn build_auth_auto_mode_no_credentials_returns_none() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            ..Default::default()
        };
        assert!(matches!(
            build_auth(&form).unwrap(),
            ElasticsearchAuth::None
        ));
    }

    #[test]
    fn build_auth_auto_mode_detects_basic_from_username() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            username: Some("user".to_string()),
            password: Some("pass".to_string()),
            ..Default::default()
        };
        match build_auth(&form).unwrap() {
            ElasticsearchAuth::Basic { username, password } => {
                assert_eq!(username, "user");
                assert_eq!(password.as_deref(), Some("pass"));
            }
            _ => panic!("expected Basic auth"),
        }
    }

    #[test]
    fn build_auth_auto_mode_detects_api_key() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            api_key_encoded: Some("mykey".to_string()),
            ..Default::default()
        };
        match build_auth(&form).unwrap() {
            ElasticsearchAuth::ApiKey(key) => assert_eq!(key, "mykey"),
            _ => panic!("expected ApiKey auth"),
        }
    }

    #[test]
    fn build_auth_unsupported_mode_returns_error() {
        let form = ConnectionForm {
            driver: "elasticsearch".to_string(),
            auth_mode: Some("oauth".to_string()),
            ..Default::default()
        };
        assert!(build_auth(&form).is_err());
    }

    #[test]
    fn validate_file_path_rejects_empty() {
        assert!(validate_file_path("", "export").is_err());
        assert!(validate_file_path("   ", "export").is_err());
    }

    #[test]
    fn validate_file_path_accepts_valid_path() {
        let result = validate_file_path("/tmp/test.ndjson", "export").unwrap();
        assert_eq!(result, std::path::PathBuf::from("/tmp/test.ndjson"));
    }

    #[test]
    fn build_search_body_dsl_takes_priority() {
        let result =
            build_search_body(Some("ignored".to_string()), Some(r#"{"match":{"title":"hello"}}"#.to_string())).unwrap();
        assert_eq!(result["match"]["title"], "hello");
    }

    #[test]
    fn build_search_body_query_string_fallback() {
        let result = build_search_body(Some("status:ok".to_string()), None).unwrap();
        assert_eq!(result["query"]["query_string"]["query"], "status:ok");
    }

    #[test]
    fn build_search_body_match_all_default() {
        let result = build_search_body(None, None).unwrap();
        assert!(result["query"]["match_all"].is_object());
    }

    #[test]
    fn build_search_body_invalid_dsl_returns_error() {
        assert!(build_search_body(None, Some("not json".to_string())).is_err());
    }

    #[test]
    fn set_search_pagination_sets_from_and_size() {
        let mut body = serde_json::json!({"query": {"match_all": {}}});
        set_search_pagination(&mut body, Some(10), 50).unwrap();
        assert_eq!(body["from"], 10);
        assert_eq!(body["size"], 50);
    }

    #[test]
    fn set_search_pagination_removes_from_when_none() {
        let mut body = serde_json::json!({"query": {"match_all": {}}, "from": 10});
        set_search_pagination(&mut body, None, 50).unwrap();
        assert!(body.get("from").is_none());
        assert_eq!(body["size"], 50);
    }

    #[test]
    fn set_search_pagination_rejects_non_object() {
        let mut body = serde_json::json!([1, 2, 3]);
        assert!(set_search_pagination(&mut body, None, 50).is_err());
    }

    #[test]
    fn parse_docs_count_parses_valid_number() {
        assert_eq!(parse_docs_count(Some("42")), Some(42));
    }

    #[test]
    fn parse_docs_count_returns_none_for_none() {
        assert_eq!(parse_docs_count(None), None);
    }

    #[test]
    fn parse_docs_count_returns_none_for_non_numeric() {
        assert_eq!(parse_docs_count(Some("abc")), None);
    }

    #[test]
    fn validate_raw_path_rejects_double_dot() {
        assert!(validate_raw_path("/../secret").is_err());
    }

    #[test]
    fn validate_raw_path_auto_prepends_slash() {
        assert_eq!(
            validate_raw_path("_cluster/health").unwrap(),
            "/_cluster/health"
        );
    }

    #[test]
    fn normalize_error_falls_back_to_error_type() {
        let body = r#"{"error":{"type":"search_phase_execution_exception"}}"#;
        let err = normalize_error(StatusCode::BAD_REQUEST, body).to_string();
        assert!(err.contains("search_phase_execution_exception"));
    }

    #[test]
    fn normalize_error_handles_empty_body() {
        let err = normalize_error(StatusCode::NOT_FOUND, "").to_string();
        assert!(err.contains("HTTP 404"));
    }

    #[test]
    fn normalize_error_handles_non_json_body() {
        let err = normalize_error(StatusCode::INTERNAL_SERVER_ERROR, "server error").to_string();
        assert!(err.contains("server error"));
    }
}
