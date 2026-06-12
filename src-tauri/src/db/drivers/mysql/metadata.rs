use crate::error::AppError;
use crate::models::{
    ColumnInfo, ColumnSchema, EventInfo, ForeignKeyInfo, IndexInfo, RoutineInfo, SchemaForeignKey,
    SchemaOverview, SpecialTypeSummary, TableInfo, TableMetadata, TableSchema, TableStructure,
};
use sqlx::Row;
use std::collections::{HashMap, HashSet};

fn query_error(message: impl Into<String>) -> AppError {
    AppError::query_failed(message)
}

pub struct MysqlMetadata {
    pub pool: sqlx::MySqlPool,
    pub driver_name: String,
    pub compatibility_mode: bool,
}

fn decode_mysql_text_cell(row: &sqlx::mysql::MySqlRow, idx: usize) -> Result<String, AppError> {
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return Ok(v);
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return Ok(String::from_utf8_lossy(&v).to_string());
    }
    Err(query_error(format!(
        "Failed to decode MySQL text column at index {idx}"
    )))
}

fn decode_mysql_optional_text_cell(
    row: &sqlx::mysql::MySqlRow,
    idx: usize,
) -> Result<Option<String>, AppError> {
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return Ok(v);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return Ok(v.map(|b| String::from_utf8_lossy(&b).to_string()));
    }
    if let Ok(v) = row.try_get::<String, _>(idx) {
        return Ok(Some(v));
    }
    if let Ok(v) = row.try_get::<Vec<u8>, _>(idx) {
        return Ok(Some(String::from_utf8_lossy(&v).to_string()));
    }
    Err(query_error(format!(
        "Failed to decode MySQL optional text column at index {idx}"
    )))
}

fn quote_mysql_ident(ident: &str) -> String {
    format!("`{}`", ident.replace('`', "``"))
}

fn quote_mysql_string_literal(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "''"))
}

fn render_mysql_query_with_str_params(sql: &str, params: &[&str]) -> Result<String, AppError> {
    let mut rendered = String::with_capacity(sql.len() + params.len() * 16);
    let mut parts = sql.split('?');
    if let Some(first) = parts.next() {
        rendered.push_str(first);
    }

    let mut used = 0usize;
    for part in parts {
        let Some(param) = params.get(used) else {
            return Err(query_error(format!(
                "Placeholder count does not match parameter count for SQL: {}",
                sql
            )));
        };
        rendered.push_str(&quote_mysql_string_literal(param));
        rendered.push_str(part);
        used += 1;
    }

    if used != params.len() {
        return Err(query_error(format!(
            "Placeholder count does not match parameter count for SQL: {}",
            sql
        )));
    }

    Ok(rendered)
}

fn mysql_special_type_category(raw_type: &str) -> Option<&'static str> {
    let normalized = raw_type.trim().to_ascii_lowercase();
    let base = normalized
        .split('(')
        .next()
        .unwrap_or("")
        .split_whitespace()
        .next()
        .unwrap_or("");

    match base {
        "bitmap" => Some("bitmap"),
        "hll" | "hyperloglog" => Some("hyperloglog"),
        "geometry" | "geography" | "point" | "linestring" | "polygon" | "multipoint"
        | "multilinestring" | "multipolygon" | "geometrycollection" => Some("geo"),
        _ => None,
    }
}

fn mysql_special_type_name(raw_type: &str) -> String {
    raw_type
        .trim()
        .split('(')
        .next()
        .unwrap_or("")
        .split_whitespace()
        .next()
        .unwrap_or(raw_type.trim())
        .to_ascii_uppercase()
}

fn mysql_declared_length(raw_type: &str) -> Option<String> {
    let start = raw_type.find('(')?;
    let rest = &raw_type[start + 1..];
    let end = rest.find(')')?;
    let value = rest[..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn build_mysql_special_type_summary(
    column_name: &str,
    raw_type: &str,
    notes: Option<String>,
) -> Option<SpecialTypeSummary> {
    let category = mysql_special_type_category(raw_type)?;
    Some(SpecialTypeSummary {
        column_name: column_name.to_string(),
        category: category.to_string(),
        type_name: mysql_special_type_name(raw_type),
        declared_length: mysql_declared_length(raw_type),
        memory_usage_bytes: None,
        memory_usage_display: None,
        raw_type: raw_type.trim().to_string(),
        notes,
    })
}

impl MysqlMetadata {
    fn is_compatibility_mode(&self) -> bool {
        self.compatibility_mode
    }

    fn supports_special_type_metadata(&self) -> bool {
        matches!(self.driver_name.as_str(), "doris" | "starrocks")
    }

    async fn fetch_all_sql(&self, sql: &str) -> Result<Vec<sqlx::mysql::MySqlRow>, AppError> {
        if self.is_compatibility_mode() {
            sqlx::raw_sql(sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        } else {
            sqlx::query(sql)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        }
    }

    async fn fetch_one_sql(&self, sql: &str) -> Result<sqlx::mysql::MySqlRow, AppError> {
        if self.is_compatibility_mode() {
            sqlx::raw_sql(sql)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        } else {
            sqlx::query(sql)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        }
    }

    async fn fetch_all_with_str_params(
        &self,
        sql: &str,
        params: &[&str],
    ) -> Result<Vec<sqlx::mysql::MySqlRow>, AppError> {
        if self.is_compatibility_mode() {
            let rendered = render_mysql_query_with_str_params(sql, params)?;
            self.fetch_all_sql(&rendered).await
        } else {
            let mut query = sqlx::query(sql);
            for param in params {
                query = query.bind(*param);
            }
            query
                .fetch_all(&self.pool)
                .await
                .map_err(|e| query_error(format!("SQL: {} | {}", sql, e)))
        }
    }

    async fn current_database(&self) -> Result<Option<String>, AppError> {
        let row = self.fetch_one_sql("SELECT DATABASE()").await?;
        decode_mysql_optional_text_cell(&row, 0)
    }

    async fn resolve_schema_name(&self, schema: &str) -> Result<String, AppError> {
        if !schema.trim().is_empty() {
            return Ok(schema.to_string());
        }
        self.current_database()
            .await
            .map_err(|e| query_error(format!("Failed to resolve current database: {e}")))?
            .ok_or_else(|| query_error("No active MySQL database selected"))
    }

    async fn fetch_primary_key_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<HashSet<String>, AppError> {
        let rows = self
            .fetch_all_with_str_params(
                "SELECT kcu.column_name \
                 FROM information_schema.table_constraints tc \
                 JOIN information_schema.key_column_usage kcu \
                   ON tc.constraint_name = kcu.constraint_name \
                  AND tc.table_schema = kcu.table_schema \
                  AND tc.table_name = kcu.table_name \
                 WHERE tc.constraint_type = 'PRIMARY KEY' \
                   AND tc.table_schema = ? \
                   AND tc.table_name = ? \
                 ORDER BY kcu.ordinal_position",
                &[schema, table],
            )
            .await?;

        let mut pk_set = HashSet::new();
        for row in rows {
            pk_set.insert(decode_mysql_text_cell(&row, 0)?);
        }
        Ok(pk_set)
    }

    pub async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        let rows = self.fetch_all_sql("SHOW DATABASES").await?;
        rows.into_iter()
            .map(|row| decode_mysql_text_cell(&row, 0))
            .collect()
    }

    pub async fn list_tables(&self, schema: Option<String>) -> Result<Vec<TableInfo>, AppError> {
        let target_schema = if let Some(s) = schema {
            s
        } else {
            self.current_database()
                .await
                .map_err(|e| query_error(format!("Failed to get current database: {e}")))?
                .ok_or_else(|| query_error("No database selected and no schema provided"))?
        };

        let rows = self
            .fetch_all_with_str_params(
                "SELECT table_schema, table_name, table_type \
                 FROM information_schema.tables \
                 WHERE table_schema = ? AND table_type IN ('BASE TABLE','VIEW') \
                 ORDER BY table_name",
                &[&target_schema],
            )
            .await?;

        let mut res = Vec::new();
        for row in rows {
            let table_schema = decode_mysql_text_cell(&row, 0)?;
            let table_name = decode_mysql_text_cell(&row, 1)?;
            let table_type = decode_mysql_text_cell(&row, 2)?;
            res.push(TableInfo {
                schema: table_schema,
                name: table_name,
                r#type: if table_type == "VIEW" {
                    "view".to_string()
                } else {
                    "table".to_string()
                },
            });
        }
        Ok(res)
    }

    pub async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> Result<TableStructure, AppError> {
        let pk_set = self.fetch_primary_key_columns(&schema, &table).await?;

        let rows = self
            .fetch_all_with_str_params(
                "SELECT column_name, data_type, is_nullable, column_default \
                 FROM information_schema.columns \
                 WHERE table_schema = ? AND table_name = ? \
                 ORDER BY ordinal_position",
                &[&schema, &table],
            )
            .await?;

        let mut columns = Vec::new();
        for row in rows {
            let name = decode_mysql_text_cell(&row, 0).unwrap_or_default();
            columns.push(ColumnInfo {
                primary_key: pk_set.contains(&name),
                name,
                r#type: decode_mysql_text_cell(&row, 1).unwrap_or_default(),
                nullable: decode_mysql_text_cell(&row, 2).unwrap_or_default() == "YES",
                default_value: decode_mysql_optional_text_cell(&row, 3).ok().flatten(),
                comment: None,
                default_constraint_name: None,
            });
        }
        Ok(TableStructure { columns })
    }

    pub async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> Result<TableMetadata, AppError> {
        let pk_set = self.fetch_primary_key_columns(&schema, &table).await?;

        let column_rows = self
            .fetch_all_with_str_params(
                "SELECT column_name, column_type, is_nullable, column_default, column_comment \
                 FROM information_schema.columns \
                 WHERE table_schema = ? AND table_name = ? \
                 ORDER BY ordinal_position",
                &[&schema, &table],
            )
            .await?;

        let mut columns = Vec::new();
        let mut special_type_summaries = Vec::new();
        for row in column_rows {
            let name = decode_mysql_text_cell(&row, 0)?;
            let raw_type = decode_mysql_text_cell(&row, 1)?;
            let comment = decode_mysql_optional_text_cell(&row, 4)?;
            let comment = comment.and_then(|c| {
                let trimmed = c.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            });
            if self.supports_special_type_metadata() {
                let notes =
                    Some("Memory usage is not exposed by the current metadata driver.".to_string());
                if let Some(summary) = build_mysql_special_type_summary(&name, &raw_type, notes) {
                    special_type_summaries.push(summary);
                }
            }
            columns.push(ColumnInfo {
                name: name.clone(),
                r#type: raw_type,
                nullable: decode_mysql_text_cell(&row, 2)? == "YES",
                default_value: decode_mysql_optional_text_cell(&row, 3)?,
                primary_key: pk_set.contains(&name),
                comment,
                default_constraint_name: None,
            });
        }

        let index_rows = self
            .fetch_all_with_str_params(
                "SELECT index_name, non_unique, index_type, seq_in_index, column_name \
                 FROM information_schema.statistics \
                 WHERE table_schema = ? AND table_name = ? \
                 ORDER BY index_name, seq_in_index",
                &[&schema, &table],
            )
            .await?;

        let mut index_map: HashMap<String, (bool, Option<String>, Vec<(i64, String)>)> =
            HashMap::new();
        for row in index_rows {
            let index_name = decode_mysql_text_cell(&row, 0)?;
            let non_unique: i64 = row.try_get(1).unwrap_or(1);
            let index_type = decode_mysql_optional_text_cell(&row, 2).ok().flatten();
            let seq: i64 = row.try_get(3).unwrap_or(0);
            let Some(column_name) = decode_mysql_optional_text_cell(&row, 4).ok().flatten() else {
                continue;
            };

            let entry = index_map.entry(index_name).or_insert((
                non_unique == 0,
                index_type.clone(),
                Vec::new(),
            ));
            entry.0 = non_unique == 0;
            if entry.1.is_none() {
                entry.1 = index_type;
            }
            entry.2.push((seq, column_name));
        }

        let mut indexes = index_map
            .into_iter()
            .map(|(name, (unique, index_type, mut cols))| {
                cols.sort_by_key(|c| c.0);
                IndexInfo {
                    name,
                    unique,
                    index_type,
                    columns: cols.into_iter().map(|c| c.1).collect(),
                }
            })
            .collect::<Vec<_>>();
        indexes.sort_by(|a, b| a.name.cmp(&b.name));

        let fk_rows = self
            .fetch_all_with_str_params(
                "SELECT \
                   kcu.constraint_name, \
                   kcu.column_name, \
                   kcu.referenced_table_schema, \
                   kcu.referenced_table_name, \
                   kcu.referenced_column_name, \
                   rc.update_rule, \
                   rc.delete_rule \
                 FROM information_schema.table_constraints tc \
                 JOIN information_schema.key_column_usage kcu \
                   ON tc.constraint_name = kcu.constraint_name \
                  AND tc.table_schema = kcu.table_schema \
                  AND tc.table_name = kcu.table_name \
                 LEFT JOIN information_schema.referential_constraints rc \
                   ON rc.constraint_name = tc.constraint_name \
                  AND rc.constraint_schema = tc.table_schema \
                 WHERE tc.constraint_type = 'FOREIGN KEY' \
                   AND tc.table_schema = ? \
                   AND tc.table_name = ? \
                 ORDER BY kcu.constraint_name, kcu.ordinal_position",
                &[&schema, &table],
            )
            .await?;

        let mut foreign_keys = Vec::new();
        for row in fk_rows {
            foreign_keys.push(ForeignKeyInfo {
                name: decode_mysql_text_cell(&row, 0).unwrap_or_default(),
                column: decode_mysql_text_cell(&row, 1).unwrap_or_default(),
                referenced_schema: decode_mysql_optional_text_cell(&row, 2).ok().flatten(),
                referenced_table: decode_mysql_text_cell(&row, 3).unwrap_or_default(),
                referenced_column: decode_mysql_text_cell(&row, 4).unwrap_or_default(),
                on_update: decode_mysql_optional_text_cell(&row, 5).ok().flatten(),
                on_delete: decode_mysql_optional_text_cell(&row, 6).ok().flatten(),
            });
        }

        Ok(TableMetadata {
            columns,
            indexes,
            foreign_keys,
            clickhouse_extra: None,
            cassandra_extra: None,
            special_type_summaries,
        })
    }

    pub async fn get_table_ddl(&self, schema: String, table: String) -> Result<String, AppError> {
        let qualified = if schema.is_empty() {
            format!("`{}`", table)
        } else {
            format!("`{}`.`{}`", schema, table)
        };
        let query = format!("SHOW CREATE TABLE {}", qualified);
        let row = self.fetch_one_sql(&query).await?;
        decode_mysql_text_cell(&row, 1)
    }

    pub async fn get_schema_overview(
        &self,
        schema: Option<String>,
    ) -> Result<SchemaOverview, AppError> {
        let sql = "SELECT table_schema, table_name, column_name, data_type \
             FROM information_schema.columns"
            .to_string();

        let rows = if let Some(s) = schema {
            self.fetch_all_with_str_params(
                &format!(
                    "{} WHERE table_schema = ? ORDER BY table_schema, table_name, ordinal_position",
                    sql
                ),
                &[&s],
            )
            .await
        } else {
            match self.current_database().await {
                Ok(Some(db)) => {
                    self.fetch_all_with_str_params(
                        &format!(
                            "{} WHERE table_schema = ? ORDER BY table_schema, table_name, ordinal_position",
                            sql
                        ),
                        &[&db],
                    )
                    .await
                }
                Ok(None) | Err(_) => {
                    self.fetch_all_sql(&format!(
                        "{} WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys') ORDER BY table_schema, table_name, ordinal_position",
                        sql
                    ))
                    .await
                }
            }
        };

        let rows = rows.map_err(|e| {
            tracing::error!(error = %e, "MySQL schema overview query failed");
            query_error("Failed to fetch schema overview")
        })?;

        let mut tables_map: std::collections::HashMap<(String, String), Vec<ColumnSchema>> =
            std::collections::HashMap::new();

        for row in rows {
            let schema_name = decode_mysql_text_cell(&row, 0)
                .map_err(|e| AppError::internal(format!("Failed to get table_schema: {}", e)))?;
            let table_name = decode_mysql_text_cell(&row, 1)
                .map_err(|e| AppError::internal(format!("Failed to get table_name: {}", e)))?;
            let col_name = decode_mysql_text_cell(&row, 2)
                .map_err(|e| AppError::internal(format!("Failed to get column_name: {}", e)))?;
            let data_type = decode_mysql_text_cell(&row, 3)
                .map_err(|e| AppError::internal(format!("Failed to get data_type: {}", e)))?;

            let key = (schema_name, table_name);
            tables_map.entry(key).or_default().push(ColumnSchema {
                name: col_name,
                r#type: data_type,
            });
        }

        let mut tables = Vec::new();
        for ((schema_name, table_name), columns) in tables_map {
            tables.push(TableSchema {
                schema: schema_name,
                name: table_name,
                columns,
            });
        }

        tables.sort_by(|a, b| a.schema.cmp(&b.schema).then(a.name.cmp(&b.name)));

        Ok(SchemaOverview { tables })
    }

    pub async fn list_routines(
        &self,
        schema: Option<String>,
    ) -> Result<Vec<RoutineInfo>, AppError> {
        let target_schema = if let Some(s) = schema {
            s
        } else {
            self.current_database()
                .await
                .map_err(|e| query_error(format!("Failed to get current database: {e}")))?
                .ok_or_else(|| query_error("No database selected and no schema provided"))?
        };

        let rows = self
            .fetch_all_with_str_params(
                "SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE \
                 FROM information_schema.ROUTINES \
                 WHERE ROUTINE_SCHEMA = ? \
                 ORDER BY ROUTINE_TYPE, ROUTINE_NAME",
                &[&target_schema],
            )
            .await?;

        let mut res = Vec::new();
        for row in rows {
            res.push(RoutineInfo {
                schema: decode_mysql_text_cell(&row, 0).unwrap_or_default(),
                name: decode_mysql_text_cell(&row, 1).unwrap_or_default(),
                r#type: decode_mysql_text_cell(&row, 2)
                    .unwrap_or_default()
                    .to_lowercase(),
            });
        }
        Ok(res)
    }

    pub async fn get_routine_ddl(
        &self,
        schema: String,
        name: String,
        routine_type: String,
    ) -> Result<String, AppError> {
        let ddl_keyword = match routine_type.to_lowercase().as_str() {
            "procedure" => "PROCEDURE",
            "function" => "FUNCTION",
            _ => {
                return Err(query_error(format!(
                    "Unknown routine type '{}'. Expected 'procedure' or 'function'",
                    routine_type
                )));
            }
        };

        let sql = format!("SHOW CREATE {} `{}`.`{}`", ddl_keyword, schema, name);
        let row = self.fetch_one_sql(&sql).await?;

        let ddl = decode_mysql_text_cell(&row, 2).map_err(|e| query_error(e.to_string()))?;

        if ddl.trim().is_empty() {
            return Err(AppError::not_found(format!(
                "Routine '{}.{}' does not exist or its definition is not visible",
                schema, name
            )));
        }
        Ok(ddl)
    }

    pub async fn list_events(&self, schema: Option<String>) -> Result<Vec<EventInfo>, AppError> {
        let target_schema = if let Some(s) = schema {
            s
        } else {
            self.current_database()
                .await
                .map_err(|e| query_error(format!("Failed to get current database: {e}")))?
                .ok_or_else(|| query_error("No database selected and no schema provided"))?
        };

        let rows = self
            .fetch_all_with_str_params(
                "SELECT EVENT_SCHEMA, EVENT_NAME, STATUS, EVENT_TYPE, \
                 EXECUTE_AT, INTERVAL_VALUE, LAST_EXECUTED, EVENT_DEFINITION \
                 FROM information_schema.EVENTS \
                 WHERE EVENT_SCHEMA = ? \
                 ORDER BY EVENT_NAME",
                &[&target_schema],
            )
            .await?;

        let mut res = Vec::new();
        for row in rows {
            res.push(EventInfo {
                schema: decode_mysql_text_cell(&row, 0)?,
                name: decode_mysql_text_cell(&row, 1)?,
                status: decode_mysql_text_cell(&row, 2)?,
                event_type: decode_mysql_text_cell(&row, 3)?,
                execute_at: decode_mysql_optional_text_cell(&row, 4)?,
                interval_value: decode_mysql_optional_text_cell(&row, 5)?,
                last_executed: decode_mysql_optional_text_cell(&row, 6)?,
                definition: decode_mysql_optional_text_cell(&row, 7)?,
            });
        }
        Ok(res)
    }

    pub async fn get_schema_foreign_keys(
        &self,
        database: Option<&str>,
    ) -> Result<Vec<SchemaForeignKey>, AppError> {
        let target_db = if let Some(db) = database.filter(|d| !d.trim().is_empty()) {
            db.trim().to_string()
        } else {
            self.current_database()
                .await
                .map_err(|e| query_error(format!("Failed to get current database: {e}")))?
                .unwrap_or_default()
        };

        let rows = if target_db.is_empty() {
            sqlx::query(
                r#"
                SELECT
                  kcu.CONSTRAINT_NAME,
                  kcu.TABLE_SCHEMA,
                  kcu.TABLE_NAME,
                  kcu.COLUMN_NAME,
                  kcu.REFERENCED_TABLE_SCHEMA,
                  kcu.REFERENCED_TABLE_NAME,
                  kcu.REFERENCED_COLUMN_NAME,
                  rc.UPDATE_RULE,
                  rc.DELETE_RULE
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                  AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
                WHERE kcu.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
                "#,
            )
            .fetch_all(&self.pool)
            .await
            .map_err(|e| query_error(e.to_string()))?
        } else {
            sqlx::query(
                r#"
                SELECT
                  kcu.CONSTRAINT_NAME,
                  kcu.TABLE_SCHEMA,
                  kcu.TABLE_NAME,
                  kcu.COLUMN_NAME,
                  kcu.REFERENCED_TABLE_SCHEMA,
                  kcu.REFERENCED_TABLE_NAME,
                  kcu.REFERENCED_COLUMN_NAME,
                  rc.UPDATE_RULE,
                  rc.DELETE_RULE
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                  AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
                WHERE kcu.REFERENCED_TABLE_NAME IS NOT NULL
                  AND kcu.TABLE_SCHEMA = ?
                ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
                "#,
            )
            .bind(&target_db)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| query_error(e.to_string()))?
        };

        let mut foreign_keys = Vec::new();
        for row in rows {
            let source_schema = decode_mysql_text_cell(&row, 1).unwrap_or_default();
            let target_schema = decode_mysql_text_cell(&row, 4).unwrap_or_default();
            foreign_keys.push(SchemaForeignKey {
                name: decode_mysql_text_cell(&row, 0).unwrap_or_default(),
                source_schema: Some(source_schema),
                source_table: decode_mysql_text_cell(&row, 2).unwrap_or_default(),
                source_column: decode_mysql_text_cell(&row, 3).unwrap_or_default(),
                target_schema: Some(target_schema),
                target_table: decode_mysql_text_cell(&row, 5).unwrap_or_default(),
                target_column: decode_mysql_text_cell(&row, 6).unwrap_or_default(),
                on_update: decode_mysql_optional_text_cell(&row, 7).unwrap_or(None),
                on_delete: decode_mysql_optional_text_cell(&row, 8).unwrap_or(None),
            });
        }
        Ok(foreign_keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mysql_special_type_category_detects_supported_types() {
        assert_eq!(mysql_special_type_category("BITMAP"), Some("bitmap"));
        assert_eq!(mysql_special_type_category("hll"), Some("hyperloglog"));
        assert_eq!(mysql_special_type_category("GEOMETRY"), Some("geo"));
        assert_eq!(mysql_special_type_category("POINT"), Some("geo"));
        assert_eq!(mysql_special_type_category("VARCHAR(255)"), None);
    }

    #[test]
    fn test_mysql_declared_length_extracts_parenthesized_values() {
        assert_eq!(
            mysql_declared_length("VARCHAR(255)"),
            Some("255".to_string())
        );
        assert_eq!(
            mysql_declared_length("DECIMAL(18, 2)"),
            Some("18, 2".to_string())
        );
        assert_eq!(mysql_declared_length("BITMAP"), None);
    }

    #[test]
    fn test_build_mysql_special_type_summary_populates_expected_fields() {
        let summary = build_mysql_special_type_summary(
            "uv_hll",
            "HLL(16384)",
            Some("Memory usage is not exposed.".to_string()),
        )
        .expect("summary should be built");

        assert_eq!(summary.column_name, "uv_hll");
        assert_eq!(summary.category, "hyperloglog");
        assert_eq!(summary.type_name, "HLL");
        assert_eq!(summary.declared_length.as_deref(), Some("16384"));
        assert!(summary.memory_usage_bytes.is_none());
        assert_eq!(summary.raw_type, "HLL(16384)");
        assert_eq!(
            summary.notes.as_deref(),
            Some("Memory usage is not exposed.")
        );
    }

    #[test]
    fn test_render_mysql_query_with_str_params_quotes_values() {
        let sql =
            "SELECT * FROM information_schema.tables WHERE table_schema = ? AND table_name = ?";
        let rendered = render_mysql_query_with_str_params(sql, &["demo's", r#"a\b"#]).unwrap();
        assert_eq!(
            rendered,
            "SELECT * FROM information_schema.tables WHERE table_schema = 'demo''s' AND table_name = 'a\\\\b'"
        );
    }

    #[test]
    fn test_render_mysql_query_with_str_params_rejects_mismatched_param_count() {
        let err =
            render_mysql_query_with_str_params("SELECT * FROM t WHERE a = ? AND b = ?", &["x"])
                .unwrap_err();
        assert!(err
            .to_string()
            .contains("Placeholder count does not match parameter count"));
    }
}
