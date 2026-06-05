use super::import_plan::{
    import_transaction_sql, normalize_driver_name, prepare_import_plan,
    should_use_outer_import_transaction, MAX_IMPORT_STATEMENTS,
};
use super::ImportSqlResult;
use crate::state::AppState;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_IMPORT_FILE_SIZE_BYTES: u64 = 20 * 1024 * 1024;

pub(super) async fn import_sql_file_direct(
    state: &AppState,
    id: i64,
    database: Option<String>,
    file_path: String,
    driver: String,
) -> Result<ImportSqlResult, String> {
    let normalized_driver = normalize_driver_name(&driver);
    let (begin_sql, commit_sql, rollback_sql) =
        import_transaction_sql(&normalized_driver, &driver)?;

    let import_path = PathBuf::from(file_path.trim());
    validate_import_path(&import_path)?;
    validate_import_file_size(&import_path)?;

    let source = fs::read_to_string(&import_path)
        .map_err(|e| format!("[IMPORT_ERROR] failed to read sql file: {e}"))?;
    let source = source
        .strip_prefix('\u{feff}')
        .unwrap_or(&source)
        .to_string();

    let import_plan = prepare_import_plan(&source, &normalized_driver)?;
    if import_plan.units.is_empty() {
        return Err("[IMPORT_ERROR] SQL file does not contain executable statements".to_string());
    }
    if import_plan.units.len() > MAX_IMPORT_STATEMENTS {
        return Err(format!(
            "[IMPORT_ERROR] statement count exceeds limit ({} > {})",
            import_plan.units.len(),
            MAX_IMPORT_STATEMENTS
        ));
    }

    let started_at = std::time::Instant::now();
    let total_statements = import_plan.units.len() as i64;
    let use_outer_transaction =
        should_use_outer_import_transaction(&normalized_driver, &import_plan);

    super::super::execute_with_retry_from_app_state(state, id, database, |db_driver| {
        let import_plan = import_plan.clone();
        let import_path = import_path.clone();
        async move {
            if use_outer_transaction {
                db_driver
                    .execute_query(begin_sql.to_string())
                    .await
                    .map_err(|e| format!("[IMPORT_ERROR] failed to start transaction: {e}"))?;
            }

            let mut success_statements = 0i64;
            for (idx, unit) in import_plan.units.iter().enumerate() {
                if let Err(e) = db_driver.execute_query(unit.sql.clone()).await {
                    if use_outer_transaction {
                        let _ = db_driver.execute_query(rollback_sql.to_string()).await;
                    }
                    return Ok(ImportSqlResult {
                        file_path: import_path.to_string_lossy().to_string(),
                        total_statements,
                        success_statements,
                        failed_at: Some((idx + 1) as i64),
                        failed_batch: Some(unit.batch_index as i64),
                        failed_statement_preview: Some(unit.preview.clone()),
                        error: Some(truncate_error_message(&e)),
                        time_taken_ms: started_at.elapsed().as_millis() as i64,
                        rolled_back: use_outer_transaction,
                    });
                }
                success_statements += 1;
            }

            if use_outer_transaction {
                if let Err(e) = db_driver.execute_query(commit_sql.to_string()).await {
                    let _ = db_driver.execute_query(rollback_sql.to_string()).await;
                    return Ok(ImportSqlResult {
                        file_path: import_path.to_string_lossy().to_string(),
                        total_statements,
                        success_statements,
                        failed_at: None,
                        failed_batch: None,
                        failed_statement_preview: None,
                        error: Some(format!(
                            "[IMPORT_ERROR] failed to commit transaction: {}",
                            truncate_error_message(&e)
                        )),
                        time_taken_ms: started_at.elapsed().as_millis() as i64,
                        rolled_back: true,
                    });
                }
            }

            Ok(ImportSqlResult {
                file_path: import_path.to_string_lossy().to_string(),
                total_statements,
                success_statements: total_statements,
                failed_at: None,
                failed_batch: None,
                failed_statement_preview: None,
                error: None,
                time_taken_ms: started_at.elapsed().as_millis() as i64,
                rolled_back: false,
            })
        }
    })
    .await
}

fn validate_import_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("[IMPORT_ERROR] Invalid import path".to_string());
    }
    if path.is_dir() {
        return Err("[IMPORT_ERROR] Import path points to a directory".to_string());
    }
    if !path.exists() {
        return Err("[IMPORT_ERROR] Import file does not exist".to_string());
    }
    let Some(ext) = path.extension().and_then(|v| v.to_str()) else {
        return Err("[IMPORT_ERROR] Import file must use .sql extension".to_string());
    };
    if !ext.eq_ignore_ascii_case("sql") {
        return Err("[IMPORT_ERROR] Import file must use .sql extension".to_string());
    }
    Ok(())
}

fn validate_import_file_size(path: &Path) -> Result<(), String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("[IMPORT_ERROR] failed to read file metadata: {e}"))?;
    if metadata.len() > MAX_IMPORT_FILE_SIZE_BYTES {
        return Err(format!(
            "[IMPORT_ERROR] file is too large (max {} bytes)",
            MAX_IMPORT_FILE_SIZE_BYTES
        ));
    }
    Ok(())
}

pub(super) fn truncate_error_message(message: &str) -> String {
    const MAX_CHARS: usize = 500;
    let mut out = String::new();
    for (idx, ch) in message.chars().enumerate() {
        if idx >= MAX_CHARS {
            out.push_str("...");
            break;
        }
        out.push(ch);
    }
    out
}
