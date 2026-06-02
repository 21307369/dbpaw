use crate::datasources::redis::RedisConnectionCache;
use crate::db::local::LocalDb;
use crate::db::pool_manager::PoolManager;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct AppState {
    pub local_db: Mutex<Option<Arc<LocalDb>>>,
    pub pool_manager: Arc<PoolManager>,
    pub redis_cache: Mutex<RedisConnectionCache>,
    pub mcp_process: Mutex<Option<std::process::Child>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            local_db: Mutex::new(None),
            pool_manager: Arc::new(PoolManager::new()),
            redis_cache: Mutex::new(RedisConnectionCache::new()),
            mcp_process: Mutex::new(None),
        }
    }
}
