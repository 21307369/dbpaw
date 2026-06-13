use crate::error::AppError;
use crate::models::{
    ColumnInfo, ColumnSchema, ForeignKeyInfo, IndexInfo, SchemaForeignKey, SchemaOverview,
    TableInfo, TableMetadata, TableSchema, TableStructure,
};
use sqlx::Row;
use std::collections::HashMap;

fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('\"', "\"\""))
}

pub(crate) fn sqlite_schema_name(schema: &str) -> String {
    let trimmed = schema.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("public")
        || trimmed.eq_ignore_ascii_case("main")
    {
        "main".to_string()
    } else {
        trimmed.to_string()
    }
}

pub(crate) fn sqlite_master_ref(schema: &str) -> String {
    let schema_name = sqlite_schema_name(schema);
    if schema_name == "main" {
        "sqlite_master".to_string()
    } else {
        format!("{}.sqlite_master", quote_ident(&schema_name))
    }
}

pub(crate) fn pragma_table_info_sql(schema: &str, table: &str) -> String {
    format!(
        "PRAGMA {}.table_info({})",
        quote_ident(&sqlite_schema_name(schema)),
        quote_ident(table)
    )
}

pub(crate) fn sqlite_table_ref(schema: &str, table: &str) -> String {
    let table_quoted = quote_ident(table);
    let schema_name = sqlite_schema_name(schema);
    if schema_name == "main" {
        table_quoted
    } else {
        format!("{}.{}", quote_ident(&schema_name), table_quoted)
    }
}

pub struct SqliteMetadata {
    pub pool: sqlx::SqlitePool,
}

impl SqliteMetadata {
    pub async fn list_databases(&self) -> Result<Vec<String>, AppError> {
        Ok(vec!["main".to_string()])
    }

    pub async fn list_tables(&self, _schema: Option<String>) -> Result<Vec<TableInfo>, AppError> {
        let schema = _schema.unwrap_or_else(|| "main".to_string());
        let master_ref = sqlite_master_ref(&schema);
        let rows = sqlx::query(&format!(
            "SELECT name, type \
             FROM {} \
             WHERE type IN ('table', 'view') \
               AND name NOT LIKE 'sqlite_%' \
             ORDER BY name",
            master_ref
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::query_failed(format!("{e}")))?;

        let mut tables = Vec::new();
        for row in rows {
            let table_type: String = row.try_get("type").unwrap_or_else(|_| "table".to_string());
            tables.push(TableInfo {
                schema: sqlite_schema_name(&schema),
                name: row.try_get("name").unwrap_or_default(),
                r#type: if table_type.eq_ignore_ascii_case("view") {
                    "view".to_string()
                } else {
                    "table".to_string()
                },
            });
        }

        Ok(tables)
    }

    pub async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> Result<TableStructure, AppError> {
        let rows = sqlx::query(&pragma_table_info_sql(&schema, &table))
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::query_failed(format!("{e}")))?;

        let mut columns = Vec::new();
        for row in rows {
            let nullable = row.try_get::<i64, _>("notnull").unwrap_or(0) == 0;
            let pk = row.try_get::<i64, _>("pk").unwrap_or(0) > 0;
            columns.push(ColumnInfo {
                name: row.try_get("name").unwrap_or_default(),
                r#type: row.try_get("type").unwrap_or_default(),
                nullable,
                default_value: row
                    .try_get::<Option<String>, _>("dflt_value")
                    .unwrap_or(None),
                primary_key: pk,
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
        let columns = self
            .get_table_structure(schema.clone(), table.clone())
            .await?
            .columns;

        let idx_rows = sqlx::query(&format!(
            "PRAGMA {}.index_list({})",
            quote_ident(&sqlite_schema_name(&schema)),
            quote_ident(&table)
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::query_failed(format!("{e}")))?;

        let mut indexes = Vec::new();
        for idx_row in idx_rows {
            let index_name: String = idx_row.try_get("name").unwrap_or_default();
            if index_name.is_empty() {
                continue;
            }
            let unique = idx_row.try_get::<i64, _>("unique").unwrap_or(0) == 1;

            let info_rows = sqlx::query(&format!(
                "PRAGMA {}.index_info({})",
                quote_ident(&sqlite_schema_name(&schema)),
                quote_ident(&index_name)
            ))
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::query_failed(format!("{e}")))?;

            let mut ordered: Vec<(i64, String)> = Vec::new();
            for r in info_rows {
                let seqno = r.try_get::<i64, _>("seqno").unwrap_or(0);
                let col_name: String = r.try_get("name").unwrap_or_default();
                if !col_name.is_empty() {
                    ordered.push((seqno, col_name));
                }
            }
            ordered.sort_by_key(|x| x.0);

            indexes.push(IndexInfo {
                name: index_name,
                unique,
                index_type: Some("btree".to_string()),
                columns: ordered.into_iter().map(|x| x.1).collect(),
            });
        }
        indexes.sort_by(|a, b| a.name.cmp(&b.name));

        let fk_rows = sqlx::query(&format!(
            "PRAGMA {}.foreign_key_list({})",
            quote_ident(&sqlite_schema_name(&schema)),
            quote_ident(&table)
        ))
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::query_failed(format!("{e}")))?;

        let mut foreign_keys = Vec::new();
        for row in fk_rows {
            let id = row.try_get::<i64, _>("id").unwrap_or(0);
            let from_col: String = row.try_get("from").unwrap_or_default();
            let ref_table: String = row.try_get("table").unwrap_or_default();
            let ref_col: String = row.try_get("to").unwrap_or_default();
            if from_col.is_empty() || ref_table.is_empty() {
                continue;
            }
            foreign_keys.push(ForeignKeyInfo {
                name: format!("fk_{}_{}", id, from_col),
                column: from_col,
                referenced_schema: None,
                referenced_table: ref_table,
                referenced_column: ref_col,
                on_update: row
                    .try_get::<Option<String>, _>("on_update")
                    .unwrap_or(None),
                on_delete: row
                    .try_get::<Option<String>, _>("on_delete")
                    .unwrap_or(None),
            });
        }

        Ok(TableMetadata {
            columns,
            indexes,
            foreign_keys,
            clickhouse_extra: None,
            cassandra_extra: None,
            special_type_summaries: vec![],
        })
    }

    pub async fn get_table_ddl(
        &self,
        schema: String,
        table: String,
    ) -> Result<String, AppError> {
        let row = sqlx::query(&format!(
            "SELECT sql \
             FROM {} \
             WHERE name = ? AND type IN ('table', 'view') \
             LIMIT 1",
            sqlite_master_ref(&schema)
        ))
        .bind(&table)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::query_failed(format!("{e}")))?;

        let row = row.ok_or_else(|| {
            AppError::query_failed(format!("Table or view '{}' not found", table))
        })?;
        let sql: Option<String> = row.try_get("sql").unwrap_or(None);
        sql.ok_or_else(|| AppError::query_failed(format!("Failed to read DDL for '{}'", table)))
    }

    pub async fn get_schema_overview(
        &self,
        schema: Option<String>,
    ) -> Result<SchemaOverview, AppError> {
        let target_schema = sqlite_schema_name(schema.as_deref().unwrap_or("main"));
        let tables = self.list_tables(Some(target_schema.clone())).await?;
        let mut map: HashMap<(String, String), Vec<ColumnSchema>> = HashMap::new();

        for t in tables {
            let structure = self
                .get_table_structure(target_schema.clone(), t.name.clone())
                .await?;
            let cols = structure
                .columns
                .into_iter()
                .map(|c| ColumnSchema {
                    name: c.name,
                    r#type: c.r#type,
                })
                .collect::<Vec<_>>();
            map.insert((target_schema.clone(), t.name), cols);
        }

        let mut out = Vec::new();
        for ((schema_name, table_name), columns) in map {
            out.push(TableSchema {
                schema: schema_name,
                name: table_name,
                columns,
            });
        }
        out.sort_by(|a, b| a.schema.cmp(&b.schema).then(a.name.cmp(&b.name)));
        Ok(SchemaOverview { tables: out })
    }

    pub async fn get_schema_foreign_keys(
        &self,
        _database: Option<&str>,
    ) -> Result<Vec<SchemaForeignKey>, AppError> {
        let tables: Vec<String> = sqlx::query_scalar(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::query_failed(format!("{e}")))?;

        let mut foreign_keys = Vec::new();
        for table in tables {
            let rows = sqlx::query(&format!(
                "PRAGMA foreign_key_list('{}')",
                table.replace('\'', "''")
            ))
            .fetch_all(&self.pool)
            .await
            .map_err(|e| AppError::query_failed(format!("{e}")))?;

            for row in rows {
                let target_table: String = row.try_get(2).unwrap_or_default();
                let source_column: String = row.try_get(3).unwrap_or_default();
                let target_column: String = row.try_get(4).unwrap_or_default();
                let on_update: String = row.try_get(5).unwrap_or_default();
                let on_delete: String = row.try_get(6).unwrap_or_default();
                foreign_keys.push(SchemaForeignKey {
                    name: format!("fk_{}_{}", table, source_column),
                    source_schema: None,
                    source_table: table.clone(),
                    source_column,
                    target_schema: None,
                    target_table,
                    target_column,
                    on_update: if on_update.is_empty() {
                        None
                    } else {
                        Some(on_update)
                    },
                    on_delete: if on_delete.is_empty() {
                        None
                    } else {
                        Some(on_delete)
                    },
                });
            }
        }
        Ok(foreign_keys)
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
    async fn test_list_databases_returns_main() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let metadata = SqliteMetadata { pool: conn.pool.clone() };
        let dbs = metadata.list_databases().await.unwrap();
        assert_eq!(dbs, vec!["main".to_string()]);
        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_list_tables_includes_tables_and_views() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };

        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let metadata = SqliteMetadata { pool: conn.pool.clone() };

        sqlx::query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);")
            .execute(&conn.pool)
            .await
            .unwrap();
        sqlx::query("CREATE VIEW users_view AS SELECT name FROM users;")
            .execute(&conn.pool)
            .await
            .unwrap();

        let tables = metadata.list_tables(None).await.unwrap();
        assert!(tables
            .iter()
            .any(|t| t.name == "users" && t.r#type == "table"));
        assert!(tables
            .iter()
            .any(|t| t.name == "users_view" && t.r#type == "view"));
        assert!(!tables.iter().any(|t| t.name.starts_with("sqlite_")));
        conn.close().await;
        let _ = std::fs::remove_file(path);
    }

    #[tokio::test]
    async fn test_metadata_ddl_and_schema_overview() {
        let path = temp_db_path();
        let form = crate::models::ConnectionForm {
            driver: "sqlite".to_string(),
            file_path: Some(path.clone()),
            ..Default::default()
        };
        let conn = super::super::connection::SqliteConnection::connect(&form)
            .await
            .unwrap();
        let metadata = SqliteMetadata { pool: conn.pool.clone() };

        sqlx::query(
            "CREATE TABLE parents (id INTEGER PRIMARY KEY, name TEXT); \
             CREATE TABLE children (id INTEGER PRIMARY KEY, parent_id INTEGER, name TEXT, \
             FOREIGN KEY(parent_id) REFERENCES parents(id)); \
             CREATE INDEX idx_children_name ON children(name);",
        )
        .execute(&conn.pool)
        .await
        .unwrap();

        let structure = metadata
            .get_table_structure("public".to_string(), "children".to_string())
            .await
            .unwrap();
        assert!(structure
            .columns
            .iter()
            .any(|c| c.name == "id" && c.primary_key));

        let table_metadata = metadata
            .get_table_metadata("public".to_string(), "children".to_string())
            .await
            .unwrap();
        assert!(table_metadata.columns.iter().any(|c| c.name == "parent_id"));
        assert!(table_metadata
            .indexes
            .iter()
            .any(|i| i.name == "idx_children_name"));
        assert!(table_metadata
            .foreign_keys
            .iter()
            .any(|fk| fk.column == "parent_id" && fk.referenced_table == "parents"));

        let ddl = metadata
            .get_table_ddl("public".to_string(), "children".to_string())
            .await
            .unwrap();
        assert!(ddl.to_lowercase().contains("create table"));

        let overview = metadata.get_schema_overview(None).await.unwrap();
        assert!(overview.tables.iter().any(|t| t.name == "children"));

        conn.close().await;
        let _ = std::fs::remove_file(path);
    }
}
