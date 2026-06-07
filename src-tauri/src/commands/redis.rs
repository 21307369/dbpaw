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

#[macro_export]
macro_rules! redis_commands {
    () => {
        $crate::commands::redis::redis_list_databases,
        $crate::commands::redis::redis_scan_keys,
        $crate::commands::redis::redis_get_key,
        $crate::commands::redis::redis_set_key,
        $crate::commands::redis::redis_update_key,
        $crate::commands::redis::redis_delete_key,
        $crate::commands::redis::redis_rename_key,
        $crate::commands::redis::redis_set_ttl,
        $crate::commands::redis::redis_get_key_page,
        $crate::commands::redis::redis_patch_key,
        $crate::commands::redis::redis_get_stream_range,
        $crate::commands::redis::redis_get_stream_view,
        $crate::commands::redis::redis_execute_raw,
        $crate::commands::redis::redis_server_info,
        $crate::commands::redis::redis_server_config,
        $crate::commands::redis::redis_slowlog_get,
        $crate::commands::redis::list_redis_command_logs,
        $crate::commands::redis::redis_bitmap_get_bit,
        $crate::commands::redis::redis_bitmap_count,
        $crate::commands::redis::redis_bitmap_pos,
        $crate::commands::redis::redis_hll_pfadd,
        $crate::commands::redis::redis_geo_add,
        $crate::commands::redis::redis_geo_pos,
        $crate::commands::redis::redis_geo_dist,
        $crate::commands::redis::redis_geo_search,
        $crate::commands::redis::redis_zrangebyscore,
        $crate::commands::redis::redis_zrank,
        $crate::commands::redis::redis_zscore,
        $crate::commands::redis::redis_zmscore,
        $crate::commands::redis::redis_zrangebylex,
        $crate::commands::redis::redis_zlexcount,
        $crate::commands::redis::redis_zpopmin,
        $crate::commands::redis::redis_zpopmax,
        $crate::commands::redis::redis_set_operation,
        $crate::commands::redis::redis_sismember,
        $crate::commands::redis::redis_smove,
        $crate::commands::redis::redis_batch_key_ops,
        $crate::commands::redis::redis_mget,
        $crate::commands::redis::redis_mset,
        $crate::commands::redis::redis_lindex,
        $crate::commands::redis::redis_lpos,
        $crate::commands::redis::redis_ltrim,
        $crate::commands::redis::redis_linsert,
        $crate::commands::redis::redis_lmove,
        $crate::commands::redis::redis_xgroup_create,
        $crate::commands::redis::redis_xgroup_del,
        $crate::commands::redis::redis_xgroup_setid,
        $crate::commands::redis::redis_xack,
        $crate::commands::redis::redis_xpending,
        $crate::commands::redis::redis_xclaim,
        $crate::commands::redis::redis_xtrim,
        $crate::commands::redis::redis_xreadgroup,
        $crate::commands::redis::redis_cluster_info,
    };
}
