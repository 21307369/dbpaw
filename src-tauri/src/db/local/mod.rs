mod ai_conversations;
mod ai_providers;
mod connections;
mod crypto;
mod logs;
mod saved_queries;

use crate::error::AppError;
use rand::RngCore;
use serde_json;
use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::fs;
use std::path::Path;
use tauri::Manager;

pub struct LocalDb {
    pool: Pool<Sqlite>,
    ai_master_key: [u8; 32],
}

fn encode_string_list(values: Option<Vec<String>>) -> Option<String> {
    values.and_then(|items| {
        if items.is_empty() {
            None
        } else {
            serde_json::to_string(&items).ok()
        }
    })
}

fn decode_string_list(value: Option<String>) -> Option<Vec<String>> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        serde_json::from_str::<Vec<String>>(trimmed).ok()
    })
}

impl LocalDb {
    const AI_KEY_PREFIX: &'static str = "enc:v1:";

    pub async fn init(app_handle: &tauri::AppHandle) -> Result<Self, AppError> {
        let app_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|e| AppError::internal_with("Database operation failed", e))?;
        Self::init_with_app_dir(&app_dir).await
    }

    pub async fn init_with_app_dir(app_dir: &Path) -> Result<Self, AppError> {
        if !app_dir.exists() {
            fs::create_dir_all(app_dir)
                .map_err(|e| AppError::internal_with("Database operation failed", e))?;
        }
        let ai_master_key = Self::load_or_create_ai_master_key(&app_dir)?;
        let db_path = app_dir.join("dbpaw.sqlite");
        let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .map_err(|e| AppError::internal_with("Local DB initialization failed", e))?;

        crate::db::migrations::run_migrations(&pool).await?;

        Ok(Self {
            pool,
            ai_master_key,
        })
    }

    fn load_or_create_ai_master_key(app_dir: &Path) -> Result<[u8; 32], AppError> {
        let key_path = app_dir.join("ai_master.key");
        if key_path.exists() {
            let bytes = fs::read(&key_path)
                .map_err(|e| AppError::internal(format!("[AI_MASTER_KEY_READ] {e}")))?;
            if bytes.len() != 32 {
                return Err(AppError::internal("Invalid master key length"));
            }
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }

        let mut key = [0u8; 32];
        rand::rng().fill_bytes(&mut key);
        fs::write(&key_path, &key)
            .map_err(|e| AppError::internal(format!("[AI_MASTER_KEY_WRITE] {e}")))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perm = fs::Permissions::from_mode(0o600);
            let _ = fs::set_permissions(&key_path, perm);
        }
        Ok(key)
    }
}

#[cfg(test)]
mod tests {
    use super::LocalDb;
    use crate::models::{AiProviderForm, ConnectionForm};
    use rand::RngCore;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn make_test_db() -> LocalDb {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("connect sqlite memory db");

        crate::db::migrations::run_migrations(&pool)
            .await
            .expect("apply migrations");

        let mut ai_master_key = [0u8; 32];
        rand::rng().fill_bytes(&mut ai_master_key);

        LocalDb {
            pool,
            ai_master_key,
        }
    }

    fn provider_form(
        name: &str,
        provider_type: &str,
        api_key: &str,
        is_default: Option<bool>,
        enabled: Option<bool>,
    ) -> AiProviderForm {
        AiProviderForm {
            name: name.to_string(),
            provider_type: Some(provider_type.to_string()),
            base_url: "https://api.example.com/v1".to_string(),
            model: "gpt-test".to_string(),
            api_key: Some(api_key.to_string()),
            is_default,
            enabled,
            extra_json: None,
        }
    }

    #[test]
    fn api_key_encrypt_decrypt_round_trip_and_format_validation() {
        let mut key = [0u8; 32];
        rand::rng().fill_bytes(&mut key);
        let encrypted = LocalDb::encrypt_ai_api_key_raw(&key, "secret-123").unwrap();
        assert!(LocalDb::has_encrypted_ai_api_key(&encrypted));
        let decrypted = LocalDb::decrypt_ai_api_key_raw(&key, &encrypted).unwrap();
        assert_eq!(decrypted, "secret-123");

        let err = LocalDb::decrypt_ai_api_key_raw(&key, "plaintext").unwrap_err();
        assert!(
            err.to_string().contains("[ERR-5002]")
                || err.to_string().contains("Missing encryption prefix")
                || err.to_string().contains("Payload too short")
        );
    }

    #[tokio::test]
    async fn create_ai_provider_supports_upsert_and_switches_default() {
        let db = make_test_db().await;

        let openai = db
            .create_ai_provider(provider_form("OpenAI-A", "openai", "k1", None, Some(true)))
            .await
            .unwrap();
        assert!(openai.is_default);

        let kimi = db
            .create_ai_provider(provider_form(
                "Kimi-A",
                "kimi",
                "k2",
                Some(true),
                Some(true),
            ))
            .await
            .unwrap();
        assert!(kimi.is_default);

        let providers = db.list_ai_providers().await.unwrap();
        assert_eq!(providers.len(), 2);
        let openai_after_switch = providers
            .iter()
            .find(|p| p.provider_type == "openai")
            .expect("openai provider exists");
        assert!(!openai_after_switch.is_default);

        let openai_upserted = db
            .create_ai_provider(provider_form(
                "OpenAI-B",
                "openai",
                "k3",
                Some(true),
                Some(true),
            ))
            .await
            .unwrap();
        assert_eq!(openai_upserted.id, openai.id);
        assert!(openai_upserted.is_default);
        assert_eq!(openai_upserted.name, "OpenAI-B");

        let providers_after_upsert = db.list_ai_providers().await.unwrap();
        let default_count = providers_after_upsert
            .iter()
            .filter(|p| p.is_default)
            .count();
        assert_eq!(default_count, 1);
        let kimi_after_upsert = providers_after_upsert
            .iter()
            .find(|p| p.provider_type == "kimi")
            .expect("kimi provider exists");
        assert!(!kimi_after_upsert.is_default);
    }

    #[tokio::test]
    async fn set_default_ai_provider_rejects_not_found_and_disabled() {
        let db = make_test_db().await;
        let disabled = db
            .create_ai_provider(provider_form(
                "Disabled-Provider",
                "openai",
                "k1",
                Some(false),
                Some(false),
            ))
            .await
            .unwrap();

        let not_found_err = db.set_default_ai_provider(999_999).await.unwrap_err();
        assert!(not_found_err.to_string().contains("Provider not found"));

        let disabled_err = db.set_default_ai_provider(disabled.id).await.unwrap_err();
        assert!(disabled_err.to_string().contains("Disabled provider"));
    }

    #[tokio::test]
    async fn sql_execution_logs_prune_to_latest_100_rows() {
        let db = make_test_db().await;
        for i in 0..105 {
            db.insert_sql_execution_log(
                format!("SELECT {}", i),
                Some("test".to_string()),
                None,
                None,
                true,
                None,
            )
            .await
            .unwrap();
        }

        let logs = db.list_sql_execution_logs(200).await.unwrap();
        assert_eq!(logs.len(), 100);
        assert_eq!(logs.first().unwrap().sql, "SELECT 104");
        assert_eq!(logs.last().unwrap().sql, "SELECT 5");
        assert!(!logs.iter().any(|l| l.sql == "SELECT 0"));
        assert!(!logs.iter().any(|l| l.sql == "SELECT 4"));
    }

    #[tokio::test]
    async fn connection_ssl_fields_round_trip_from_create_to_form() {
        let db = make_test_db().await;
        let form = ConnectionForm {
            driver: "mysql".to_string(),
            name: Some("ssl-roundtrip".to_string()),
            host: Some("127.0.0.1".to_string()),
            port: Some(3306),
            database: Some("test_db".to_string()),
            username: Some("root".to_string()),
            password: Some("pwd".to_string()),
            ssl: Some(true),
            ssl_mode: Some("verify_ca".to_string()),
            ssl_ca_cert: Some(
                "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----".to_string(),
            ),
            file_path: None,
            ssh_enabled: Some(false),
            ssh_host: None,
            ssh_port: None,
            ssh_username: None,
            ssh_password: None,
            ssh_key_path: None,
            schema: None,
            ..Default::default()
        };

        let created = db.create_connection(form).await.unwrap();
        let loaded = db.get_connection_form_by_id(created.id).await.unwrap();
        assert_eq!(loaded.ssl, Some(true));
        assert_eq!(loaded.ssl_mode.as_deref(), Some("verify_ca"));
        assert_eq!(
            loaded.ssl_ca_cert.as_deref(),
            Some("-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----")
        );
    }

    #[tokio::test]
    async fn list_connections_keeps_creation_order_after_update() {
        let db = make_test_db().await;

        let first = db
            .create_connection(ConnectionForm {
                driver: "postgres".to_string(),
                name: Some("first".to_string()),
                host: Some("127.0.0.1".to_string()),
                port: Some(5432),
                database: Some("db1".to_string()),
                username: Some("user1".to_string()),
                password: Some("pwd1".to_string()),
                ssl: Some(false),
                ssl_mode: None,
                ssl_ca_cert: None,
                file_path: None,
                ssh_enabled: Some(false),
                ssh_host: None,
                ssh_port: None,
                ssh_username: None,
                ssh_password: None,
                ssh_key_path: None,
                schema: None,
                ..Default::default()
            })
            .await
            .unwrap();

        let second = db
            .create_connection(ConnectionForm {
                driver: "postgres".to_string(),
                name: Some("second".to_string()),
                host: Some("127.0.0.2".to_string()),
                port: Some(5432),
                database: Some("db2".to_string()),
                username: Some("user2".to_string()),
                password: Some("pwd2".to_string()),
                ssl: Some(false),
                ssl_mode: None,
                ssl_ca_cert: None,
                file_path: None,
                ssh_enabled: Some(false),
                ssh_host: None,
                ssh_port: None,
                ssh_username: None,
                ssh_password: None,
                ssh_key_path: None,
                schema: None,
                ..Default::default()
            })
            .await
            .unwrap();

        let before_update = db.list_connections().await.unwrap();
        assert_eq!(
            before_update.iter().map(|conn| conn.id).collect::<Vec<_>>(),
            vec![first.id, second.id]
        );

        db.update_connection(
            first.id,
            ConnectionForm {
                driver: "postgres".to_string(),
                name: Some("first-renamed".to_string()),
                host: Some("127.0.0.10".to_string()),
                port: Some(5432),
                database: Some("db1".to_string()),
                username: Some("user1".to_string()),
                password: Some("pwd1".to_string()),
                ssl: Some(false),
                ssl_mode: None,
                ssl_ca_cert: None,
                file_path: None,
                ssh_enabled: Some(false),
                ssh_host: None,
                ssh_port: None,
                ssh_username: None,
                ssh_password: None,
                ssh_key_path: None,
                schema: None,
                ..Default::default()
            },
        )
        .await
        .unwrap();

        let after_update = db.list_connections().await.unwrap();
        assert_eq!(
            after_update.iter().map(|conn| conn.id).collect::<Vec<_>>(),
            vec![first.id, second.id]
        );
        assert_eq!(after_update[0].name, "first-renamed");
    }

    #[tokio::test]
    async fn saved_query_crud_round_trip() {
        let db = make_test_db().await;

        let created = db
            .create_saved_query(
                "q1".to_string(),
                "SELECT 1".to_string(),
                Some("desc".to_string()),
                Some(10),
                Some("db1".to_string()),
            )
            .await
            .unwrap();
        assert_eq!(created.name, "q1");
        assert_eq!(created.query, "SELECT 1");
        assert_eq!(created.description.as_deref(), Some("desc"));
        assert_eq!(created.connection_id, Some(10));
        assert_eq!(created.database.as_deref(), Some("db1"));

        let updated = db
            .update_saved_query(
                created.id,
                "q1-updated".to_string(),
                "SELECT 2".to_string(),
                None,
                None,
                None,
            )
            .await
            .unwrap();
        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name, "q1-updated");
        assert_eq!(updated.query, "SELECT 2");
        assert!(updated.description.is_none());
        assert!(updated.connection_id.is_none());
        assert!(updated.database.is_none());

        let list = db.list_saved_queries().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);

        db.delete_saved_query(created.id).await.unwrap();
        let get_err = db.get_saved_query_by_id(created.id).await.unwrap_err();
        assert!(
            get_err.to_string().contains("[ERR-5003]")
                || get_err.to_string().contains("[GET_QUERY_ERROR]")
                || get_err.to_string().contains("not found")
        );

        let list_after = db.list_saved_queries().await.unwrap();
        assert!(list_after.is_empty());
    }
}
