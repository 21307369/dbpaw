pub mod dbeaver;
pub mod navicat;

use crate::connection_input::normalize_connection_form;
use crate::db::local::LocalDb;
use crate::models::Connection;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: Vec<Connection>,
    pub skipped: usize,
}

enum ImportFormat {
    DBeaver,
    Navicat,
}

fn detect_format(path: &str) -> Result<ImportFormat, String> {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "json" => Ok(ImportFormat::DBeaver),
        "ncx" => Ok(ImportFormat::Navicat),
        _ => Err(format!(
            "Unsupported file format '.{ext}'. Supported: .json (DBeaver), .ncx (Navicat)"
        )),
    }
}

/// Deduplicate connection names against existing names.
/// Appends " (1)", " (2)", etc. until unique.
fn deduplicate_name(base: &str, existing: &mut Vec<String>) -> String {
    if !existing.iter().any(|n| n == base) {
        existing.push(base.to_string());
        return base.to_string();
    }
    let mut counter = 1u32;
    loop {
        let candidate = format!("{base} ({counter})");
        if !existing.iter().any(|n| n == &candidate) {
            existing.push(candidate.clone());
            return candidate;
        }
        counter += 1;
    }
}

pub async fn import_from_file(path: &str, local_db: &LocalDb) -> Result<ImportResult, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Cannot read file: {e}"))?;

    let format = detect_format(path)?;

    let (mut forms, skipped) = match format {
        ImportFormat::DBeaver => dbeaver::parse_dbeaver_json(&content)?,
        ImportFormat::Navicat => navicat::parse_navicat_ncx(&content)?,
    };

    // Get existing connection names for deduplication
    let existing_connections = local_db.list_connections().await?;
    let mut existing_names: Vec<String> = existing_connections.into_iter().map(|c| c.name).collect();

    let mut imported = Vec::new();
    for form in &mut forms {
        // Apply defaults
        if form.host.is_none() || form.host.as_deref() == Some("") {
            form.host = Some("localhost".to_string());
        }
        if form.name.is_none() || form.name.as_deref() == Some("") {
            let host = form.host.as_deref().unwrap_or("localhost");
            let port = form.port.map(|p| p.to_string()).unwrap_or_else(|| "default".to_string());
            form.name = Some(format!("{} - {}:{}", form.driver, host, port));
        }

        // Deduplicate name
        let base_name = form.name.clone().unwrap_or_default();
        let unique_name = deduplicate_name(&base_name, &mut existing_names);
        form.name = Some(unique_name);

        // Normalize and create
        let normalized = normalize_connection_form(form.clone())?;
        match local_db.create_connection(normalized).await {
            Ok(conn) => imported.push(conn),
            Err(e) => {
                // Continue with remaining connections on partial failure
                eprintln!("Failed to import connection '{}': {e}", form.name.as_deref().unwrap_or("?"));
            }
        }
    }

    Ok(ImportResult { imported, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_format() {
        assert!(matches!(detect_format("data-sources.json"), Ok(ImportFormat::DBeaver)));
        assert!(matches!(detect_format("connections.ncx"), Ok(ImportFormat::Navicat)));
        assert!(detect_format("file.csv").is_err());
    }

    #[test]
    fn test_deduplicate_name_no_conflict() {
        let mut names = vec!["existing".to_string()];
        let result = deduplicate_name("new_name", &mut names);
        assert_eq!(result, "new_name");
    }

    #[test]
    fn test_deduplicate_name_with_conflict() {
        let mut names = vec!["my_conn".to_string()];
        let result = deduplicate_name("my_conn", &mut names);
        assert_eq!(result, "my_conn (1)");

        let result2 = deduplicate_name("my_conn", &mut names);
        assert_eq!(result2, "my_conn (2)");
    }
}
