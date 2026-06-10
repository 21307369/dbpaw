use super::sql_writer::{quote_ident, quote_target, sql_value};
use super::ExportFormat;
use crate::error::AppError;
use serde_json::{Map, Value};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;

pub(super) fn extension_for_format(format: &ExportFormat) -> &'static str {
    match format {
        ExportFormat::Csv => "csv",
        ExportFormat::Json => "json",
        ExportFormat::SqlDml | ExportFormat::SqlDdl | ExportFormat::SqlFull => "sql",
    }
}

pub(super) fn resolve_output_path(
    explicit_path: Option<String>,
    base_name: &str,
    extension: &str,
) -> Result<PathBuf, AppError> {
    let path = if let Some(path) = explicit_path {
        let trimmed = path.trim().to_string();
        if trimmed.is_empty() {
            default_output_path(base_name, extension)
        } else {
            PathBuf::from(trimmed)
        }
    } else {
        default_output_path(base_name, extension)
    };

    validate_output_path(&path)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
    }
    Ok(path)
}

pub(super) fn validate_output_path(path: &PathBuf) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::validation("Invalid output path"));
    }
    if path.file_name().is_none() {
        return Err(AppError::validation("Output path must include a file name"));
    }
    if path.exists() && path.is_dir() {
        return Err(AppError::validation("Output path points to a directory"));
    }
    Ok(())
}

fn default_output_path(base_name: &str, extension: &str) -> PathBuf {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let export_dir = home.join("Downloads").join("DbPawExports");
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    export_dir.join(format!(
        "{}_{}.{}",
        sanitize_filename(base_name),
        timestamp,
        extension
    ))
}

fn sanitize_filename(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    if sanitized.is_empty() {
        "export".to_string()
    } else {
        sanitized
    }
}

pub(super) struct ExportWriter {
    format: ExportFormat,
    writer: BufWriter<File>,
    first_json_row: bool,
}

impl ExportWriter {
    pub(super) fn new(path: PathBuf, format: ExportFormat) -> Result<Self, AppError> {
        let file =
            File::create(path).map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
        let mut writer = BufWriter::new(file);

        if matches!(format, ExportFormat::Json) {
            writer
                .write_all(b"[\n")
                .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
        }

        Ok(Self {
            format,
            writer,
            first_json_row: true,
        })
    }

    pub(super) fn write_csv_header(&mut self, columns: &[String]) -> Result<(), AppError> {
        if !matches!(self.format, ExportFormat::Csv) {
            return Ok(());
        }
        let header = columns
            .iter()
            .map(|c| csv_escape(c))
            .collect::<Vec<_>>()
            .join(",");
        self.writer
            .write_all(format!("{header}\n").as_bytes())
            .map_err(|e| AppError::internal(format!("create dir failed: {e}")))
    }

    pub(super) fn write_rows(
        &mut self,
        rows: &[Value],
        columns: &[String],
        schema: Option<&str>,
        table: &str,
        driver: &str,
    ) -> Result<i64, AppError> {
        let mut count = 0;
        for row in rows {
            let obj = row
                .as_object()
                .ok_or(AppError::validation("row is not a JSON object")?;
            self.write_row(obj, columns, schema, table, driver)?;
            count += 1;
        }
        Ok(count)
    }

    fn write_row(
        &mut self,
        row: &Map<String, Value>,
        columns: &[String],
        schema: Option<&str>,
        table: &str,
        driver: &str,
    ) -> Result<(), AppError> {
        match self.format {
            ExportFormat::Csv => {
                let line = columns
                    .iter()
                    .map(|c| row.get(c).map(csv_value).unwrap_or_else(|| ""))
                    .collect::<Vec<_>>()
                    .join(",");
                self.writer
                    .write_all(format!("{line}\n").as_bytes())
                    .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
            }
            ExportFormat::Json => {
                if !self.first_json_row {
                    self.writer
                        .write_all(b",\n")
                        .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
                }
                self.first_json_row = false;
                let text = serde_json::to_string(row)
                    .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
                self.writer
                    .write_all(text.as_bytes())
                    .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
            }
            ExportFormat::SqlDml | ExportFormat::SqlFull => {
                let quoted_cols = columns
                    .iter()
                    .map(|c| quote_ident(c, driver))
                    .collect::<Vec<_>>()
                    .join(", ");
                let values = columns
                    .iter()
                    .map(|c| {
                        row.get(c)
                            .map(sql_value)
                            .unwrap_or_else(|| "NULL")
                    })
                    .collect::<Vec<_>>()
                    .join(", ");
                let statement = format!(
                    "INSERT INTO {} ({}) VALUES ({});\n",
                    quote_target(schema, table, driver),
                    quoted_cols,
                    values
                );
                self.writer
                    .write_all(statement.as_bytes())
                    .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
            }
            ExportFormat::SqlDdl => unreachable!("SqlDdl rows are never written"),
        }
        Ok(())
    }

    pub(super) fn write_ddl(&mut self, ddl: &str) -> Result<(), AppError> {
        let content = format!("{}\n\n", ddl.trim_end());
        self.writer
            .write_all(content.as_bytes())
            .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
        Ok(())
    }

    pub(super) fn finish(&mut self) -> Result<(), AppError> {
        if matches!(self.format, ExportFormat::Json) {
            self.writer
                .write_all(b"\n]\n")
                .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
        }
        self.writer
            .flush()
            .map_err(|e| AppError::internal(format!("create dir failed: {e}")))?;
        Ok(())
    }
}

pub(super) fn csv_escape(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn csv_value(value: &Value) -> String {
    if value.is_null() {
        return "".to_string();
    }
    let raw = match value {
        Value::String(s) => s.clone(),
        _ => value.to_string(),
    };
    csv_escape(&raw)
}
