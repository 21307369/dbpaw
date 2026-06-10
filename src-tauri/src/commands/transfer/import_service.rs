use super::import_plan::{
    import_transaction_sql, normalize_driver_name, prepare_import_plan,
    should_use_outer_import_transaction, truncate_error_message, validate_import_file_size,
    validate_import_path, MAX_IMPORT_STATEMENTS,
};
use super::ImportSqlResult;
use crate::db::drivers::DatabaseDriver;
use crate::error::AppError;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

#[derive(Clone)]
pub(super) struct PreparedSqlImport {
    import_path: PathBuf,
    import_plan: super::import_plan::PreparedImportPlan,
    begin_sql: String,
    commit_sql: String,
    rollback_sql: String,
    use_outer_transaction: bool,
}

pub(super) fn prepare_sql_import(
    file_path: String,
    driver: &str,
) -> Result<PreparedSqlImport, AppError> {
    let normalized_driver = normalize_driver_name(driver);
    let (begin_sql, commit_sql, rollback_sql) = import_transaction_sql(&normalized_driver, driver)?;

    let import_path = PathBuf::from(file_path.trim());
    validate_import_path(&import_path)?;
    validate_import_file_size(&import_path)?;

    let source = fs::read_to_string(&import_path)
        .map_err(|e| AppError::internal(format!("failed to read sql file: {e}"))?;
    let source = source
        .strip_prefix('\u{feff}')
        .unwrap_or(&source)
        .to_string();

    let import_plan = prepare_import_plan(&source, &normalized_driver)?;
    if import_plan.units.is_empty() {
        return Err(AppError::internal("SQL file does not contain executable statements"));
    }
    if import_plan.units.len() > MAX_IMPORT_STATEMENTS {
        return Err(AppError::internal(format!(
            "statement count exceeds limit ({} > {})",
            import_plan.units.len(),
            MAX_IMPORT_STATEMENTS
        )));
    }

    let use_outer_transaction =
        should_use_outer_import_transaction(&normalized_driver, &import_plan);
    Ok(PreparedSqlImport {
        import_path,
        import_plan,
        begin_sql: begin_sql.to_string(),
        commit_sql: commit_sql.to_string(),
        rollback_sql: rollback_sql.to_string(),
        use_outer_transaction,
    })
}

pub(super) async fn execute_sql_import(
    db_driver: Arc<dyn DatabaseDriver>,
    prepared: PreparedSqlImport,
    started_at: std::time::Instant,
) -> Result<ImportSqlResult, AppError> {
    let total_statements = prepared.import_plan.units.len() as i64;

    if prepared.use_outer_transaction {
        db_driver
            .execute_query(prepared.begin_sql.clone())
            .await
            .map_err(|e| AppError::internal(format!("failed to start transaction: {e}"))?;
    }

    let mut success_statements = 0i64;
    for (idx, unit) in prepared.import_plan.units.iter().enumerate() {
        if let Err(e) = db_driver.execute_query(unit.sql.clone()).await {
            if prepared.use_outer_transaction {
                let _ = db_driver.execute_query(prepared.rollback_sql.clone()).await;
            }
            return Ok(ImportSqlResult {
                file_path: prepared.import_path.to_string_lossy().to_string(),
                total_statements,
                success_statements,
                failed_at: Some((idx + 1) as i64),
                failed_batch: Some(unit.batch_index as i64),
                failed_statement_preview: Some(unit.preview.clone()),
                error: Some(truncate_error_message(&e)),
                time_taken_ms: started_at.elapsed().as_millis() as i64,
                rolled_back: prepared.use_outer_transaction,
            });
        }
        success_statements += 1;
    }

    if prepared.use_outer_transaction {
        if let Err(e) = db_driver.execute_query(prepared.commit_sql.clone()).await {
            let _ = db_driver.execute_query(prepared.rollback_sql.clone()).await;
            return Ok(ImportSqlResult {
                file_path: prepared.import_path.to_string_lossy().to_string(),
                total_statements,
                success_statements,
                failed_at: None,
                failed_batch: None,
                failed_statement_preview: None,
                error: Some(AppError::internal(format!(
                    "failed to commit transaction: {}",
                    truncate_error_message(&e)
                ))),
                time_taken_ms: started_at.elapsed().as_millis() as i64,
                rolled_back: true,
            });
        }
    }

    Ok(ImportSqlResult {
        file_path: prepared.import_path.to_string_lossy().to_string(),
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
