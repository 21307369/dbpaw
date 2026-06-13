use super::super::conn_failed_error;
use crate::error::AppError;
use crate::models::ConnectionForm;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

pub struct SqliteConnection {
    pub pool: sqlx::SqlitePool,
}

impl SqliteConnection {
    pub async fn connect(form: &ConnectionForm) -> Result<Self, AppError> {
        let file_path = form
            .file_path
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .ok_or(AppError::validation("file_path cannot be empty"))?;

        let mut opts = SqliteConnectOptions::new()
            .filename(file_path)
            .create_if_missing(true);

        if let Some(key) = form.password.as_deref().filter(|k| !k.is_empty()) {
            opts = opts.pragma("key", key.to_string());
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(3))
            .connect_with(opts)
            .await
            .map_err(|e| {
                if e.to_string().contains("not a database") {
                    AppError::conn_failed(
                        "Cannot open database: the file is encrypted or the key is incorrect. Please provide the correct SQLCipher passphrase.",
                        "Check that the file is a valid SQLite database or provide the correct SQLCipher passphrase",
                    )
                } else {
                    conn_failed_error(&e)
                }
            })?;

        Ok(Self { pool })
    }

    pub async fn test_connection(&self) -> Result<(), AppError> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await
            .map_err(|e| AppError::query_failed(format!("{e}")))?;
        Ok(())
    }

    pub async fn close(&self) {
        self.pool.close().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn temp_db_path() -> String {
        let mut p = std::env::temp_dir();
        p.push(format!("dbpaw-sqlite-test-{}.db", Uuid::new_v4()));
        p.to_string_lossy().to_string()
    }

    #[tokio::test]
    async fn test_connect_validation_error() {
        let form = ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: None,
            ..Default::default()
        };
        let result = SqliteConnection::connect(&form).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("file_path cannot be empty"));
    }

    #[tokio::test]
    async fn test_connect_with_space_in_path() {
        let mut path = std::env::temp_dir();
        path.push(format!("dbpaw test space {}.db", Uuid::new_v4()));
        let path_str = path.to_string_lossy().to_string();

        let form = ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path_str.clone()),
            ..Default::default()
        };

        let conn = SqliteConnection::connect(&form)
            .await
            .expect("Should connect to path with spaces");
        conn.test_connection()
            .await
            .expect("Should execute query");
        conn.close().await;

        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_connect_and_test_connection() {
        let path = temp_db_path();
        let form = ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = SqliteConnection::connect(&form).await.unwrap();
        conn.test_connection().await.unwrap();
        conn.close().await;
        let _ = std::fs::remove_file(path);
    }
}
