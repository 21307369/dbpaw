use crate::error::AppError;
use crate::models::SavedQuery;
use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub async fn save_query(
    state: State<'_, AppState>,
    name: String,
    query: String,
    description: Option<String>,
    connection_id: Option<i64>,
    database: Option<String>,
) -> Result<SavedQuery, String> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.create_saved_query(name, query, description, connection_id, database)
            .await
            .map_err(String::from)
    } else {
        Err(AppError::internal("Local DB not initialized").into())
    }
}

pub async fn save_query_direct(
    state: &AppState,
    name: String,
    query: String,
    description: Option<String>,
    connection_id: Option<i64>,
    database: Option<String>,
) -> Result<SavedQuery, AppError> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.create_saved_query(name, query, description, connection_id, database)
            .await
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}

#[tauri::command]
pub async fn update_saved_query(
    state: State<'_, AppState>,
    id: i64,
    name: String,
    query: String,
    description: Option<String>,
    connection_id: Option<i64>,
    database: Option<String>,
) -> Result<SavedQuery, String> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.update_saved_query(id, name, query, description, connection_id, database)
            .await
            .map_err(String::from)
    } else {
        Err(AppError::internal("Local DB not initialized").into())
    }
}

pub async fn update_saved_query_direct(
    state: &AppState,
    id: i64,
    name: String,
    query: String,
    description: Option<String>,
    connection_id: Option<i64>,
    database: Option<String>,
) -> Result<SavedQuery, AppError> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.update_saved_query(id, name, query, description, connection_id, database)
            .await
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}

#[tauri::command]
pub async fn delete_saved_query(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.delete_saved_query(id).await.map_err(String::from)
    } else {
        Err(AppError::internal("Local DB not initialized").into())
    }
}

pub async fn delete_saved_query_direct(state: &AppState, id: i64) -> Result<(), AppError> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.delete_saved_query(id).await
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}

#[tauri::command]
pub async fn get_saved_queries(state: State<'_, AppState>) -> Result<Vec<SavedQuery>, String> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.list_saved_queries().await.map_err(String::from)
    } else {
        Err(AppError::internal("Local DB not initialized").into())
    }
}

pub async fn get_saved_queries_direct(state: &AppState) -> Result<Vec<SavedQuery>, AppError> {
    let local_db = state.local_db.lock().await;
    if let Some(db) = local_db.as_ref() {
        db.list_saved_queries().await
    } else {
        Err(AppError::internal("Local DB not initialized"))
    }
}

#[macro_export]
macro_rules! storage_commands {
    () => {
        $crate::commands::storage::save_query,
        $crate::commands::storage::get_saved_queries,
        $crate::commands::storage::update_saved_query,
        $crate::commands::storage::delete_saved_query,
    };
}
