use crate::db::drivers::conn_failed_error;
use crate::models::ConnectionForm;
use base64::Engine;
use redis::aio::ConnectionLike;
use redis::aio::MultiplexedConnection;
use redis::cluster::ClusterClient;
use redis::cluster_async::ClusterConnection;
use redis::cluster_routing::{
    MultipleNodeRoutingInfo, ResponsePolicy, RoutingInfo, SingleNodeRoutingInfo,
};
use redis::sentinel::{Sentinel, SentinelNodeConnectionInfo};
use redis::AsyncConnectionConfig;
use redis::{
    from_redis_value, Cmd, ConnectionAddr, ConnectionInfo, FromRedisValue, ProtocolVersion,
    RedisConnectionInfo, TlsMode, Value,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex as TokioMutex;

mod error;

const DEFAULT_REDIS_PORT: i64 = 6379;
const DEFAULT_CONNECT_TIMEOUT_MS: i64 = 5000;
const DEFAULT_SCAN_LIMIT: u32 = 100;
const MAX_SCAN_LIMIT: u32 = 1000;
const PAGE_SIZE: isize = 200;

/// Shareable Redis connection handle.
/// Standalone uses MultiplexedConnection (Clone, shared underlying TCP).
/// Cluster wraps ClusterConnection in Arc<Mutex> so it can be shared across commands.
#[derive(Clone)]
pub enum RedisConnection {
    Standalone(MultiplexedConnection),
    Cluster(Arc<TokioMutex<ClusterConnection>>),
}

pub struct RedisConnectionCache {
    connections: HashMap<String, RedisConnection>,
}

impl RedisConnectionCache {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    pub fn get(&self, key: &str) -> Option<RedisConnection> {
        self.connections.get(key).cloned()
    }

    pub fn insert(&mut self, key: String, conn: RedisConnection) {
        self.connections.insert(key, conn);
    }

    pub fn remove(&mut self, key: &str) {
        self.connections.remove(key);
    }

    /// Remove all cached connections that belong to `connection_id`
    /// (keys are formatted as `"{id}:{db}"` or `"{id}:cluster"`).
    pub fn remove_by_connection_id(&mut self, connection_id: i64) {
        let prefix = format!("{connection_id}:");
        self.connections.retain(|k, _| !k.starts_with(&prefix));
    }
}

impl RedisConnection {
    pub fn is_cluster(&self) -> bool {
        matches!(self, RedisConnection::Cluster(_))
    }

    pub async fn query<T: FromRedisValue>(&mut self, cmd: Cmd) -> Result<T, String> {
        match self {
            RedisConnection::Standalone(inner) => query_on(inner, cmd).await,
            RedisConnection::Cluster(arc) => {
                let mut conn = arc.lock().await;
                query_on(&mut *conn, cmd).await
            }
        }
    }

    pub async fn route_all_masters_combine_arrays<T: FromRedisValue>(
        &mut self,
        cmd: &Cmd,
    ) -> Result<T, String> {
        let RedisConnection::Cluster(arc) = self else {
            return Err("[REDIS_ERROR] all-master routing requires Redis Cluster".to_string());
        };
        let mut cluster = arc.lock().await;
        let value = cluster
            .route_command(
                cmd,
                RoutingInfo::MultiNode((
                    MultipleNodeRoutingInfo::AllMasters,
                    Some(ResponsePolicy::CombineArrays),
                )),
            )
            .await
            .map_err(|e| error::to_command_string(e))?;
        from_redis_value(&value).map_err(|e| error::to_command_string(e))
    }

    pub async fn pipe_query<T: FromRedisValue>(
        &mut self,
        pipe: &mut redis::Pipeline,
    ) -> Result<T, String> {
        match self {
            RedisConnection::Standalone(inner) => pipe
                .query_async(inner)
                .await
                .map_err(|e| error::to_command_string(e)),
            RedisConnection::Cluster(arc) => {
                let mut conn = arc.lock().await;
                pipe.query_async(&mut *conn)
                    .await
                    .map_err(|e| error::to_command_string(e))
            }
        }
    }

    pub async fn query_on_node<T: FromRedisValue>(
        &mut self,
        host: &str,
        port: u16,
        cmd: Cmd,
    ) -> Result<T, String> {
        let RedisConnection::Cluster(arc) = self else {
            return self.query(cmd).await;
        };
        let mut cluster = arc.lock().await;
        let routing = RoutingInfo::SingleNode(SingleNodeRoutingInfo::ByAddress {
            host: host.to_string(),
            port,
        });
        let value = cluster
            .route_command(&cmd, routing)
            .await
            .map_err(|e| error::to_command_string(e))?;
        from_redis_value(&value).map_err(|e| error::to_command_string(e))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisDatabaseInfo {
    pub index: i64,
    pub name: String,
    pub selected: bool,
    pub key_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisServerInfo {
    pub sections: HashMap<String, HashMap<String, String>>,
    pub dbsize: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisSlowlogEntry {
    pub id: u64,
    pub timestamp: i64,
    pub duration_ms: u64,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisScanResponse {
    pub cursor: String,
    pub keys: Vec<RedisKeyInfo>,
    pub is_partial: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisZSetMember {
    pub member: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisStreamEntry {
    pub id: String,
    pub fields: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisStreamInfo {
    pub length: u64,
    pub radix_tree_keys: u64,
    pub radix_tree_nodes: u64,
    pub groups: u64,
    pub last_generated_id: String,
    pub first_entry: Option<RedisStreamEntry>,
    pub last_entry: Option<RedisStreamEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisStreamGroupInfo {
    pub name: String,
    pub consumers: u64,
    pub pending: u64,
    pub last_delivered_id: String,
    pub entries_read: Option<u64>,
    pub lag: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisXPendingSummary {
    pub count: i64,
    pub min_id: String,
    pub max_id: String,
    pub consumers: Vec<(String, i64)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisXPendingEntry {
    pub id: String,
    pub consumer: String,
    pub idle_ms: i64,
    pub delivery_count: i64,
}

/// Unified XPENDING result — summary when no range params, detail list otherwise.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", untagged)]
pub enum RedisXPendingResult {
    Summary(RedisXPendingSummary),
    Entries(Vec<RedisXPendingEntry>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisXClaimEntry {
    pub id: String,
    pub fields: BTreeMap<String, String>,
    pub idle_ms: Option<i64>,
    pub delivery_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisBitmapBit {
    pub offset: u64,
    pub value: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyExtra {
    pub subtype: Option<String>,
    pub stream_info: Option<RedisStreamInfo>,
    pub stream_groups: Option<Vec<RedisStreamGroupInfo>>,
    pub hll_count: Option<u64>,
    pub geo_count: Option<u64>,
    pub bitmap_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisStreamView {
    pub entries: Vec<RedisStreamEntry>,
    pub total_len: u64,
    pub start_id: String,
    pub end_id: String,
    pub count: u32,
    pub next_start_id: Option<String>,
    pub stream_info: Option<RedisStreamInfo>,
    pub groups: Vec<RedisStreamGroupInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum RedisValue {
    String(String),
    Hash(BTreeMap<String, String>),
    List(Vec<String>),
    Set(Vec<String>),
    ZSet(Vec<RedisZSetMember>),
    Stream(Vec<RedisStreamEntry>),
    Json(String),
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyValue {
    pub key: String,
    pub key_type: String,
    pub ttl: i64,
    pub value: RedisValue,
    pub value_total_len: Option<u64>,
    pub value_offset: u64,
    pub is_binary: bool,
    pub extra: Option<RedisKeyExtra>,
    pub object_encoding: Option<String>,
    pub memory_usage: Option<u64>,
    pub object_idletime: Option<i64>,
    pub object_refcount: Option<i64>,
    pub key_exists: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisSetKeyPayload {
    pub key: String,
    pub value: RedisValue,
    pub ttl_seconds: Option<i64>,
    /// SET NX — only set if key does not exist.
    pub set_nx: Option<bool>,
    /// SET XX — only set if key already exists.
    pub set_xx: Option<bool>,
    /// SET PX — expire after this many milliseconds (mutually exclusive with ttl_seconds/EX).
    pub set_px: Option<i64>,
    /// SET KEEPTTL — retain the existing TTL.
    pub set_keepttl: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisMutationResult {
    pub success: bool,
    pub affected: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisListSetItem {
    pub index: usize,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyPatchPayload {
    pub key: String,
    pub ttl_seconds: Option<i64>,
    pub hash_set: Option<BTreeMap<String, String>>,
    pub hash_del: Option<Vec<String>>,
    pub set_add: Option<Vec<String>>,
    pub set_rem: Option<Vec<String>>,
    pub zset_add: Option<Vec<RedisZSetMember>>,
    pub zset_rem: Option<Vec<String>>,
    pub list_rpush: Option<Vec<String>>,
    pub list_lpush: Option<Vec<String>>,
    pub list_set: Option<Vec<RedisListSetItem>>,
    pub list_rem: Option<Vec<String>>,
    pub list_lpop: Option<usize>,
    pub list_rpop: Option<usize>,
    pub stream_add: Option<Vec<RedisStreamEntry>>,
    pub stream_del: Option<Vec<String>>,
    pub bitmap_set: Option<Vec<RedisBitmapBit>>,
    pub string_incr_by: Option<String>,
    pub hash_incr_by: Option<BTreeMap<String, String>>,
    pub zset_incr_by: Option<Vec<RedisZSetMember>>,
    pub string_incr_by_int: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisZRangeByScoreResult {
    pub members: Vec<RedisZSetMember>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisZRangeByLexResult {
    pub members: Vec<String>,
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedisSetOperation {
    Inter,
    Union,
    Diff,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedisLInsertPosition {
    Before,
    After,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RedisLMoveDirection {
    Left,
    Right,
}

// ── Batch operations types ──────────────────────────────────────────────────

/// A single batch key operation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisBatchKeyOp {
    /// Operation: "del" | "unlink" | "expire" | "persist"
    pub op: String,
    pub key: String,
    /// Only used by "expire" — TTL in seconds.
    pub ttl_seconds: Option<i64>,
}

/// Result of a single batch key operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisBatchKeyOpResult {
    pub key: String,
    pub op: String,
    pub success: bool,
    pub affected: i64,
}

/// Result of a single key in MGET.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisMgetEntry {
    pub key: String,
    pub value: Option<String>,
    pub exists: bool,
}

/// A parsed Redis Cluster node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisClusterNode {
    pub id: String,
    pub addr: String,
    pub flags: Vec<String>,
    pub master_id: Option<String>,
    pub ping_sent: i64,
    pub pong_recv: i64,
    pub config_epoch: i64,
    pub link_state: String,
    pub slot_range: Option<String>,
}

/// Aggregated cluster information.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisClusterInfo {
    pub info: HashMap<String, String>,
    pub nodes: Vec<RedisClusterNode>,
}

fn parse_database(database: Option<&str>) -> Result<i64, String> {
    let Some(raw) = database else {
        return Ok(0);
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let normalized = trimmed.strip_prefix("db").unwrap_or(trimmed);
    let db = normalized
        .parse::<i64>()
        .map_err(|_| "[VALIDATION_ERROR] Redis database must be a numeric index".to_string())?;
    if !(0..=255).contains(&db) {
        return Err("[VALIDATION_ERROR] Redis database must be between 0 and 255".to_string());
    }
    Ok(db)
}

fn selected_database(form: &ConnectionForm, database: Option<&str>) -> Result<i64, String> {
    match database {
        Some(db) => parse_database(Some(db)),
        None => parse_database(form.database.as_deref()),
    }
}

fn redis_mode(form: &ConnectionForm) -> &str {
    match form.mode.as_deref() {
        Some("standalone") => "standalone",
        Some("cluster") => "cluster",
        Some("sentinel") => "sentinel",
        _ if form
            .host
            .as_deref()
            .map(|host| {
                host.split(',')
                    .filter(|part| !part.trim().is_empty())
                    .count()
                    > 1
            })
            .unwrap_or(false) =>
        {
            "cluster"
        }
        _ => "standalone",
    }
}

fn is_cluster_form(form: &ConnectionForm) -> bool {
    redis_mode(form) == "cluster"
}

fn is_sentinel_form(form: &ConnectionForm) -> bool {
    redis_mode(form) == "sentinel"
}

fn connect_timeout(form: &ConnectionForm) -> Duration {
    Duration::from_millis(
        form.connect_timeout_ms
            .unwrap_or(DEFAULT_CONNECT_TIMEOUT_MS) as u64,
    )
}

fn validate_key(key: &str) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("[VALIDATION_ERROR] Redis key cannot be empty".to_string());
    }
    Ok(())
}

fn validate_value_for_write(value: &RedisValue) -> Result<(), String> {
    match value {
        RedisValue::Hash(fields) if fields.is_empty() => {
            Err("[VALIDATION_ERROR] Redis hash must contain at least one field".into())
        }
        RedisValue::List(items) if items.is_empty() => {
            Err("[VALIDATION_ERROR] Redis list must contain at least one item".into())
        }
        RedisValue::Set(items) if items.is_empty() => {
            Err("[VALIDATION_ERROR] Redis set must contain at least one member".into())
        }
        RedisValue::ZSet(items) if items.is_empty() => {
            Err("[VALIDATION_ERROR] Redis zset must contain at least one member".into())
        }
        RedisValue::Stream(entries) if entries.is_empty() => {
            Err("[VALIDATION_ERROR] Redis stream must contain at least one entry".into())
        }
        RedisValue::Json(s) => {
            if serde_json::from_str::<serde_json::Value>(s).is_err() {
                return Err("[VALIDATION_ERROR] Invalid JSON".into());
            }
            Ok(())
        }
        RedisValue::None => Err("[VALIDATION_ERROR] Redis value is required".into()),
        _ => Ok(()),
    }
}

include!("redis/stream_view.rs");
include!("redis/connection.rs");
include!("redis/scan.rs");
include!("redis/key_value.rs");
include!("redis/geo.rs");
include!("redis/console.rs");
include!("redis/zset_collections.rs");
include!("redis/stream_commands.rs");
include!("redis/raw_batch_cluster.rs");

#[cfg(test)]
include!("redis/tests.rs");
