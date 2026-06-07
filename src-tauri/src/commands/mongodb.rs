use crate::db::drivers::mongodb::{
    MongoDBDriver, MongodbCollectionInfo, MongodbConnectionInfo, MongodbDatabaseInfo,
};
use crate::models::TestConnectionResult;
use crate::state::AppState;
use std::time::Instant;
use tauri::State;

async fn connection_form(
    state: &State<'_, AppState>,
    id: i64,
) -> Result<crate::models::ConnectionForm, String> {
    let local_db = {
        let lock = state.local_db.lock().await;
        lock.clone()
    };
    let db = local_db.ok_or("Local DB not initialized")?;
    let form = db.get_connection_form_by_id(id).await?;
    if form.driver != "mongodb" {
        return Err(format!(
            "[UNSUPPORTED] Connection {} is not a MongoDB connection",
            id
        ));
    }
    Ok(form)
}

async fn driver_from_id(state: &State<'_, AppState>, id: i64) -> Result<MongoDBDriver, String> {
    MongoDBDriver::connect(&connection_form(state, id).await?).await
}

#[tauri::command]
pub async fn mongodb_test_connection(
    state: State<'_, AppState>,
    id: i64,
) -> Result<MongodbConnectionInfo, String> {
    driver_from_id(&state, id)
        .await?
        .test_connection_info()
        .await
}

#[tauri::command]
pub async fn mongodb_test_connection_ephemeral(
    form: crate::models::ConnectionForm,
) -> Result<TestConnectionResult, String> {
    let started = Instant::now();
    let driver = MongoDBDriver::connect(&form).await?;
    match driver.test_connection_info().await {
        Ok(info) => Ok(TestConnectionResult {
            success: true,
            message: format!(
                "Connected to MongoDB {}",
                info.version.unwrap_or_else(|| "server".to_string())
            ),
            latency_ms: Some(started.elapsed().as_millis() as i64),
        }),
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn mongodb_list_databases(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Vec<MongodbDatabaseInfo>, String> {
    driver_from_id(&state, id)
        .await?
        .list_databases_info()
        .await
}

#[tauri::command]
pub async fn mongodb_list_collections(
    state: State<'_, AppState>,
    id: i64,
    database: String,
) -> Result<Vec<MongodbCollectionInfo>, String> {
    driver_from_id(&state, id)
        .await?
        .list_collections_info(&database)
        .await
}

#[macro_export]
macro_rules! mongodb_commands {
    () => {
        $crate::commands::mongodb::mongodb_test_connection,
        $crate::commands::mongodb::mongodb_test_connection_ephemeral,
        $crate::commands::mongodb::mongodb_list_databases,
        $crate::commands::mongodb::mongodb_list_collections,
    };
}
