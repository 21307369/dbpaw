use super::writer::ExportWriter;
use super::{ExportFormat, ExportResult, ExportScope};
use crate::db::drivers::DatabaseDriver;
use crate::error::AppError;
use std::path::PathBuf;
use std::sync::Arc;

pub(super) const DEFAULT_CHUNK_SIZE: i64 = 2000;

async fn write_table_export(
    db_driver: Arc<dyn DatabaseDriver>,
    writer: &mut ExportWriter,
    schema: String,
    table: String,
    driver: String,
    format: ExportFormat,
    scope: ExportScope,
    filter: Option<String>,
    order_by: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
    chunk: i64,
) -> Result<i64, AppError> {
    let mut exported = 0i64;

    if matches!(format, ExportFormat::SqlDdl | ExportFormat::SqlFull) {
        let ddl = db_driver
            .get_table_ddl(schema.clone(), table.clone())
            .await?;
        writer.write_ddl(&ddl)?;
    }

    if !matches!(format, ExportFormat::SqlDdl) {
        let columns: Vec<String> = db_driver
            .get_table_metadata(schema.clone(), table.clone())
            .await?
            .columns
            .into_iter()
            .map(|c| c.name)
            .collect();

        writer.write_csv_header(&columns)?;

        match scope {
            ExportScope::CurrentPage => {
                let resp = db_driver
                    .get_table_data_chunk(
                        schema.clone(),
                        table.clone(),
                        page.unwrap_or(1).max(1),
                        limit.unwrap_or(50).max(1),
                        sort_column,
                        sort_direction,
                        filter,
                        order_by,
                    )
                    .await?;
                exported +=
                    writer.write_rows(&resp.data, &columns, Some(&schema), &table, &driver)?;
            }
            ExportScope::Filtered | ExportScope::FullTable => {
                let (eff_filter, eff_order, eff_sort_col, eff_sort_dir) =
                    if matches!(scope, ExportScope::Filtered) {
                        (filter, order_by, sort_column, sort_direction)
                    } else {
                        (None, None, None, None)
                    };
                let mut current_page = 1;
                loop {
                    let resp = db_driver
                        .get_table_data_chunk(
                            schema.clone(),
                            table.clone(),
                            current_page,
                            chunk,
                            eff_sort_col.clone(),
                            eff_sort_dir.clone(),
                            eff_filter.clone(),
                            eff_order.clone(),
                        )
                        .await?;
                    if resp.data.is_empty() {
                        break;
                    }
                    exported +=
                        writer.write_rows(&resp.data, &columns, Some(&schema), &table, &driver)?;
                    if exported >= resp.total {
                        break;
                    }
                    current_page += 1;
                }
            }
        }
    }

    Ok(exported)
}

pub(super) async fn do_table_export(
    db_driver: Arc<dyn DatabaseDriver>,
    output_path: PathBuf,
    schema: String,
    table: String,
    driver: String,
    format: ExportFormat,
    scope: ExportScope,
    filter: Option<String>,
    order_by: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
    chunk: i64,
) -> Result<ExportResult, AppError> {
    let mut writer = ExportWriter::new(output_path.clone(), format.clone())?;
    let exported = write_table_export(
        db_driver,
        &mut writer,
        schema,
        table,
        driver,
        format,
        scope,
        filter,
        order_by,
        sort_column,
        sort_direction,
        page,
        limit,
        chunk,
    )
    .await?;

    writer.finish()?;
    Ok(ExportResult {
        file_path: output_path.to_string_lossy().to_string(),
        row_count: exported,
    })
}

pub(super) async fn do_database_export(
    db_driver: Arc<dyn DatabaseDriver>,
    output_path: PathBuf,
    driver: String,
    format: ExportFormat,
    chunk: i64,
) -> Result<ExportResult, AppError> {
    let mut tables = db_driver.list_tables(None).await?;
    tables.sort_by(|a, b| a.schema.cmp(&b.schema).then(a.name.cmp(&b.name)));

    let mut writer = ExportWriter::new(output_path.clone(), format.clone())?;
    let mut exported = 0i64;
    for table in tables {
        exported += write_table_export(
            db_driver.clone(),
            &mut writer,
            table.schema,
            table.name,
            driver.clone(),
            format.clone(),
            ExportScope::FullTable,
            None,
            None,
            None,
            None,
            None,
            None,
            chunk,
        )
        .await?;
    }
    writer.finish()?;

    Ok(ExportResult {
        file_path: output_path.to_string_lossy().to_string(),
        row_count: exported,
    })
}

pub(super) async fn do_query_export(
    db_driver: Arc<dyn DatabaseDriver>,
    output_path: PathBuf,
    sql: String,
    driver: String,
    format: ExportFormat,
) -> Result<ExportResult, AppError> {
    if matches!(format, ExportFormat::SqlDdl) {
        return Err(AppError::unsupported("SqlDdl format is not supported for query exports"));
    }

    let result = db_driver.execute_query(sql).await?;
    let columns = result
        .columns
        .into_iter()
        .map(|c| c.name)
        .collect::<Vec<_>>();
    let mut writer = ExportWriter::new(output_path.clone(), format)?;
    writer.write_csv_header(&columns)?;
    let exported = writer.write_rows(&result.data, &columns, None, "query_result", &driver)?;
    writer.finish()?;
    Ok(ExportResult {
        file_path: output_path.to_string_lossy().to_string(),
        row_count: exported,
    })
}
