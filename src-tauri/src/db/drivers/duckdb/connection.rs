use super::helpers::build_file_path;
use crate::db::drivers::{conn_failed_error, DriverResult};
use crate::error::AppError;
use crate::models::ConnectionForm;
use duckdb::Connection;

#[derive(Debug, Clone)]
pub struct DuckdbConnection {
    pub file_path: String,
}

impl DuckdbConnection {
    pub async fn connect(form: &ConnectionForm) -> DriverResult<Self> {
        let file_path = build_file_path(form)?;
        let open_path = file_path.clone();
        tokio::task::spawn_blocking(move || {
            Connection::open(&open_path)
                .map(|_| ())
                .map_err(|e| conn_failed_error(&e))
        })
        .await
        .map_err(|e| conn_failed_error(&e))??;

        Ok(Self { file_path })
    }

    pub async fn run_blocking<T, F>(&self, f: F) -> DriverResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> DriverResult<T> + Send + 'static,
    {
        let file_path = self.file_path.clone();
        tokio::task::spawn_blocking(move || {
            let conn = Connection::open(&file_path).map_err(|e| conn_failed_error(&e))?;
            f(&conn)
        })
        .await
        .map_err(|e| AppError::query_failed(format!("join error: {e}")))?
    }
}
