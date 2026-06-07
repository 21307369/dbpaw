use crate::datasources::redis::{
    self, RedisBatchKeyOp, RedisBatchKeyOpResult, RedisClusterInfo, RedisDatabaseInfo,
    RedisGeoMember, RedisGeoPosition, RedisGeoSearchResult, RedisKeyPatchPayload, RedisKeyValue,
    RedisLInsertPosition, RedisLMoveDirection, RedisMgetEntry, RedisMutationResult, RedisRawResult,
    RedisScanResponse, RedisServerInfo, RedisSetKeyPayload, RedisSetOperation, RedisSlowlogEntry,
    RedisStreamEntry, RedisStreamView, RedisXClaimEntry, RedisXPendingResult,
    RedisZRangeByLexResult, RedisZRangeByScoreResult, RedisZSetMember,
};
use crate::datasources::redis::{connect, RedisConnection};
use crate::models::{ConnectionForm, RedisCommandLog};
use crate::state::AppState;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use tauri::State;

include!("redis/connection.rs");
include!("redis/database_scan.rs");
include!("redis/key_value.rs");
include!("redis/stream_view.rs");
include!("redis/console_logs.rs");
include!("redis/bitmap_geo.rs");
include!("redis/zset.rs");
include!("redis/collections.rs");
include!("redis/stream_commands.rs");
include!("redis/cluster.rs");

#[cfg(test)]
include!("redis/tests.rs");
