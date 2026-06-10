pub mod ai;
pub mod config;
pub mod connection;
pub mod elasticsearch;
pub mod mcp;
pub mod metadata;
pub mod mongodb;
pub mod query;
pub mod redis;
pub mod storage;
pub mod system;
pub mod transfer;

use crate::db::drivers::DatabaseDriver;
use crate::error::AppError;
use crate::models::ConnectionForm;
use crate::state::AppState;
use std::sync::Arc;
use tauri::State;

fn connection_pool_key(id: i64, database: &Option<String>) -> String {
    if let Some(db) = database {
        if !db.is_empty() {
            return format!("{}:{}", id, db);
        }
    }
    id.to_string()
}

pub async fn get_connection_form_by_id(
    state: &State<'_, AppState>,
    id: i64,
) -> Result<ConnectionForm, String> {
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    let db = local_db.ok_or("Local DB not initialized")?;
    db.get_connection_form_by_id(id).await
}

pub async fn get_connection_form_by_id_with_driver_check(
    state: &State<'_, AppState>,
    id: i64,
    expected_driver: &str,
) -> Result<ConnectionForm, String> {
    let form = get_connection_form_by_id(state, id).await?;
    if form.driver != expected_driver {
        return Err(AppError::unsupported(format!(
            "Connection {} is not a {} connection",
            id, expected_driver
        )).to_string());
    }
    Ok(form)
}

pub async fn ensure_connection_with_db(
    state: &State<'_, AppState>,
    id: i64,
    database: Option<String>,
) -> Result<Arc<dyn DatabaseDriver>, AppError> {
    ensure_connection_with_db_inner(state.inner(), id, database).await
}

pub async fn ensure_connection_with_db_from_app_state(
    state: &AppState,
    id: i64,
    database: Option<String>,
) -> Result<Arc<dyn DatabaseDriver>, AppError> {
    ensure_connection_with_db_inner(state, id, database).await
}

async fn ensure_connection_with_db_inner(
    state: &AppState,
    id: i64,
    database: Option<String>,
) -> Result<Arc<dyn DatabaseDriver>, AppError> {
    let key = connection_pool_key(id, &database);

    if let Some(driver) = state.pool_manager.get_connection(&key).await {
        let local_db = {
            let lock = state.local_db.lock().await;
            lock.clone()
        };

        if let Some(db) = local_db {
            if db.get_connection_by_id(id).await.is_err() {
                state.pool_manager.remove_by_prefix(&id.to_string()).await;
                return Err(AppError::internal(format!(
                    "Connection with ID {} no longer exists",
                    id
                )));
            }
        }
        return Ok(driver);
    }

    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };

    let db = local_db.ok_or_else(|| AppError::internal("Local DB not initialized"))?;
    let mut form = db.get_connection_form_by_id(id).await.map_err(AppError::internal)?;

    if let Some(db_name) = database {
        if !db_name.is_empty() {
            form.database = Some(db_name);
        }
    }

    state.pool_manager.connect(&key, &form).await
}

async fn execute_with_retry_core<T, E, Ensure, EnsureFut, Remove, RemoveFut, Task, TaskFut>(
    max_retries: u32,
    mut ensure: Ensure,
    mut remove: Remove,
    task: Task,
) -> Result<T, String>
where
    Ensure: FnMut() -> EnsureFut,
    EnsureFut: std::future::Future<Output = Result<Arc<dyn DatabaseDriver>, AppError>>,
    Remove: FnMut() -> RemoveFut,
    RemoveFut: std::future::Future<Output = ()>,
    Task: Fn(Arc<dyn DatabaseDriver>) -> TaskFut,
    TaskFut: std::future::Future<Output = Result<T, E>>,
    E: Into<AppError>,
{
    let mut last_err = None;
    for attempt in 0..=max_retries {
        let driver = ensure().await.map_err(String::from)?;
        match task(driver.clone()).await {
            Ok(res) => return Ok(res),
            Err(e) => {
                let err: AppError = e.into();
                if err.is_retryable() && attempt < max_retries {
                    println!(
                        "[Pool] Retryable error on attempt {}/{}, retrying: {}",
                        attempt + 1,
                        max_retries,
                        err
                    );
                    remove().await;
                    last_err = Some(err);
                } else {
                    return Err(String::from(err));
                }
            }
        }
    }
    Err(String::from(last_err.unwrap()))
}

pub async fn execute_with_retry<F, Fut, T, E>(
    state: &State<'_, AppState>,
    id: i64,
    database: Option<String>,
    task: F,
) -> Result<T, String>
where
    F: Fn(Arc<dyn DatabaseDriver>) -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: Into<AppError>,
{
    execute_with_retry_inner(state.inner(), id, database, task).await
}

pub async fn execute_with_retry_from_app_state<F, Fut, T, E>(
    state: &AppState,
    id: i64,
    database: Option<String>,
    task: F,
) -> Result<T, String>
where
    F: Fn(Arc<dyn DatabaseDriver>) -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: Into<AppError>,
{
    execute_with_retry_inner(state, id, database, task).await
}

async fn execute_with_retry_inner<F, Fut, T, E>(
    state: &AppState,
    id: i64,
    database: Option<String>,
    task: F,
) -> Result<T, String>
where
    F: Fn(Arc<dyn DatabaseDriver>) -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: Into<AppError>,
{
    let key = connection_pool_key(id, &database);
    execute_with_retry_core(
        state.pool_manager.config().max_retries,
        || ensure_connection_with_db_from_app_state(state, id, database.clone()),
        || state.pool_manager.remove(&key),
        task,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{connection_pool_key, execute_with_retry_core};
    use crate::db::drivers::{DatabaseDriver, DriverResult};
    use crate::models::{
        QueryResult, SchemaOverview, TableDataResponse, TableInfo, TableMetadata, TableStructure,
    };
    use async_trait::async_trait;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    struct MockDriver;

    #[async_trait]
    impl DatabaseDriver for MockDriver {
        async fn close(&self) {}
        async fn test_connection(&self) -> DriverResult<()> {
            Ok(())
        }
        async fn list_databases(&self) -> DriverResult<Vec<String>> {
            Ok(vec![])
        }
        async fn list_tables(&self, _schema: Option<String>) -> DriverResult<Vec<TableInfo>> {
            Ok(vec![])
        }
        async fn get_table_structure(
            &self,
            _schema: String,
            _table: String,
        ) -> DriverResult<TableStructure> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
        async fn get_table_metadata(
            &self,
            _schema: String,
            _table: String,
        ) -> DriverResult<TableMetadata> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
        async fn get_table_ddl(&self, _schema: String, _table: String) -> DriverResult<String> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
        async fn get_table_data(
            &self,
            _schema: String,
            _table: String,
            _page: i64,
            _limit: i64,
            _sort_column: Option<String>,
            _sort_direction: Option<String>,
            _filter: Option<String>,
            _order_by: Option<String>,
        ) -> DriverResult<TableDataResponse> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
        async fn get_table_data_chunk(
            &self,
            _schema: String,
            _table: String,
            _page: i64,
            _limit: i64,
            _sort_column: Option<String>,
            _sort_direction: Option<String>,
            _filter: Option<String>,
            _order_by: Option<String>,
        ) -> DriverResult<TableDataResponse> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
        async fn execute_query(&self, _sql: String) -> DriverResult<QueryResult> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
        async fn get_schema_overview(
            &self,
            _schema: Option<String>,
        ) -> DriverResult<SchemaOverview> {
            Err(crate::error::AppError::unsupported("Unimplemented"))
        }
    }

    #[tokio::test]
    async fn execute_with_retry_retries_up_to_max_on_connection_error() {
        let task_calls = Arc::new(AtomicUsize::new(0));
        let task_calls_c = task_calls.clone();

        let result: Result<String, String> = execute_with_retry_core(
            3,
            || async { Ok(Arc::new(MockDriver) as Arc<dyn DatabaseDriver>) },
            || async {},
            move |_driver| {
                let task_calls_c = task_calls_c.clone();
                async move {
                    let n = task_calls_c.fetch_add(1, Ordering::SeqCst);
                    if n < 2 {
                        Err(crate::error::AppError::query_failed(
                            "connection reset by peer",
                        ))
                    } else {
                        Ok("ok".to_string())
                    }
                }
            },
        )
        .await;

        assert_eq!(result.unwrap(), "ok");
        assert_eq!(task_calls.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn execute_with_retry_returns_last_error_after_max_retries() {
        let task_calls = Arc::new(AtomicUsize::new(0));
        let task_calls_c = task_calls.clone();

        let result: Result<String, String> = execute_with_retry_core(
            2,
            || async { Ok(Arc::new(MockDriver) as Arc<dyn DatabaseDriver>) },
            || async {},
            move |_driver| {
                let task_calls_c = task_calls_c.clone();
                async move {
                    task_calls_c.fetch_add(1, Ordering::SeqCst);
                    Err::<String, crate::error::AppError>(crate::error::AppError::query_failed(
                        "pool closed",
                    ))
                }
            },
        )
        .await;

        assert_eq!(result.unwrap_err(), "[ERR-2001] pool closed");
        assert_eq!(task_calls.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn execute_with_retry_no_retry_on_non_retryable_error() {
        let task_calls = Arc::new(AtomicUsize::new(0));
        let task_calls_c = task_calls.clone();

        let result: Result<String, String> = execute_with_retry_core(
            3,
            || async { Ok(Arc::new(MockDriver) as Arc<dyn DatabaseDriver>) },
            || async {},
            move |_driver| {
                let task_calls_c = task_calls_c.clone();
                async move {
                    task_calls_c.fetch_add(1, Ordering::SeqCst);
                    Err::<String, crate::error::AppError>(crate::error::AppError::query_syntax(
                        "syntax error near SELECT",
                    ))
                }
            },
        )
        .await;

        assert!(result.unwrap_err().contains("syntax error"));
        assert_eq!(task_calls.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn connection_pool_key_handles_none_and_empty_db() {
        assert_eq!(connection_pool_key(1, &None), "1");
        assert_eq!(connection_pool_key(1, &Some("".to_string())), "1");
        assert_eq!(connection_pool_key(1, &Some("app".to_string())), "1:app");
    }
}
