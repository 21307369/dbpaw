use super::connection::DuckdbConnection;
use super::helpers::{duckdb_schema_name, quote_literal};
use crate::db::drivers::DriverResult;
use crate::error::AppError;
use crate::models::{
    ColumnInfo, ColumnSchema, SchemaOverview, TableInfo, TableMetadata, TableSchema, TableStructure,
};
use std::collections::HashMap;

#[derive(Debug)]
pub struct DuckdbMetadata {
    pub connection: DuckdbConnection,
}

impl DuckdbMetadata {
    pub async fn list_databases(&self) -> DriverResult<Vec<String>> {
        self.connection
            .run_blocking(|conn| {
                let mut out = Vec::new();
                if let Ok(mut stmt) = conn.prepare("SELECT database_name FROM duckdb_databases()") {
                    let mut rows = stmt
                        .query([])
                        .map_err(|e| AppError::query_failed(format!("{e}")))?;
                    while let Some(row) = rows
                        .next()
                        .map_err(|e| AppError::query_failed(format!("{e}")))?
                    {
                        let db_name = row
                            .get::<usize, String>(0)
                            .unwrap_or_else(|_| "main".to_string());
                        out.push(db_name);
                    }
                }

                if out.is_empty() {
                    out.push("main".to_string());
                }
                out.sort();
                out.dedup();
                Ok(out)
            })
            .await
    }

    pub async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>> {
        self.connection
            .run_blocking(move |conn| {
                let schema_filter = schema
                    .as_deref()
                    .map(duckdb_schema_name)
                    .filter(|v| !v.trim().is_empty());

                let sql = if let Some(schema_name) = schema_filter {
                    format!(
                        "SELECT table_schema, table_name, table_type \
                         FROM information_schema.tables \
                         WHERE table_schema = {} \
                           AND table_schema NOT IN ('pg_catalog', 'information_schema') \
                         ORDER BY table_schema, table_name",
                        quote_literal(&schema_name)
                    )
                } else {
                    "SELECT table_schema, table_name, table_type \
                     FROM information_schema.tables \
                     WHERE table_schema NOT IN ('pg_catalog', 'information_schema') \
                     ORDER BY table_schema, table_name"
                        .to_string()
                };

                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                let mut rows = stmt
                    .query([])
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                let mut tables = Vec::new();

                while let Some(row) = rows
                    .next()
                    .map_err(|e| AppError::query_failed(format!("{e}")))?
                {
                    let schema_name = row
                        .get::<usize, String>(0)
                        .unwrap_or_else(|_| "main".to_string());
                    let table_name = row.get::<usize, String>(1).unwrap_or_default();
                    let table_type = row
                        .get::<usize, String>(2)
                        .unwrap_or_else(|_| "BASE TABLE".to_string());

                    if table_name.is_empty() {
                        continue;
                    }

                    tables.push(TableInfo {
                        schema: duckdb_schema_name(&schema_name),
                        name: table_name,
                        r#type: if table_type.eq_ignore_ascii_case("view") {
                            "view".to_string()
                        } else {
                            "table".to_string()
                        },
                    });
                }

                Ok(tables)
            })
            .await
    }

    pub async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableStructure> {
        self.connection
            .run_blocking(move |conn| {
                let schema_name = duckdb_schema_name(&schema);
                let sql = format!(
                    "SELECT column_name, data_type, is_nullable, column_default \
                     FROM information_schema.columns \
                     WHERE table_schema = {} AND table_name = {} \
                     ORDER BY ordinal_position",
                    quote_literal(&schema_name),
                    quote_literal(&table)
                );
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                let mut rows = stmt
                    .query([])
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;

                let pk_sql = format!(
                    "SELECT kcu.column_name \
                     FROM information_schema.table_constraints tc \
                     JOIN information_schema.key_column_usage kcu \
                       ON tc.constraint_name = kcu.constraint_name \
                      AND tc.table_schema = kcu.table_schema \
                      AND tc.table_name = kcu.table_name \
                     WHERE tc.constraint_type = 'PRIMARY KEY' \
                       AND tc.table_schema = {} \
                       AND tc.table_name = {}",
                    quote_literal(&schema_name),
                    quote_literal(&table)
                );
                let mut pk_stmt = conn
                    .prepare(&pk_sql)
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                let mut pk_rows = pk_stmt
                    .query([])
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                let mut pk_cols = std::collections::HashSet::new();
                while let Some(row) = pk_rows
                    .next()
                    .map_err(|e| AppError::query_failed(format!("{e}")))?
                {
                    let col_name = row.get::<usize, String>(0).unwrap_or_default();
                    if !col_name.is_empty() {
                        pk_cols.insert(col_name);
                    }
                }

                let mut columns = Vec::new();
                while let Some(row) = rows
                    .next()
                    .map_err(|e| AppError::query_failed(format!("{e}")))?
                {
                    let name = row.get::<usize, String>(0).unwrap_or_default();
                    if name.is_empty() {
                        continue;
                    }
                    let type_name = row.get::<usize, String>(1).unwrap_or_default();
                    let is_nullable = row
                        .get::<usize, String>(2)
                        .unwrap_or_else(|_| "YES".to_string());
                    let default_value = row.get::<usize, Option<String>>(3).unwrap_or(None);

                    columns.push(ColumnInfo {
                        name: name.clone(),
                        r#type: type_name,
                        nullable: is_nullable.eq_ignore_ascii_case("yes"),
                        default_value,
                        primary_key: pk_cols.contains(&name),
                        comment: None,
                        default_constraint_name: None,
                    });
                }

                Ok(TableStructure { columns })
            })
            .await
    }

    pub async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableMetadata> {
        let columns = self
            .get_table_structure(schema.clone(), table.clone())
            .await?
            .columns;

        Ok(TableMetadata {
            columns,
            indexes: vec![],
            foreign_keys: vec![],
            clickhouse_extra: None,
            cassandra_extra: None,
            special_type_summaries: vec![],
        })
    }

    pub async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String> {
        self.connection
            .run_blocking(move |conn| {
                let schema_name = duckdb_schema_name(&schema);
                let sql = format!(
                    "SELECT sql FROM duckdb_tables() \
                     WHERE schema_name = {} AND table_name = {} \
                     LIMIT 1",
                    quote_literal(&schema_name),
                    quote_literal(&table)
                );
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                let mut rows = stmt
                    .query([])
                    .map_err(|e| AppError::query_failed(format!("{e}")))?;
                if let Some(row) = rows
                    .next()
                    .map_err(|e| AppError::query_failed(format!("{e}")))?
                {
                    let ddl = row.get::<usize, Option<String>>(0).unwrap_or(None);
                    if let Some(ddl) = ddl.filter(|v| !v.trim().is_empty()) {
                        return Ok(ddl);
                    }
                }

                Err(AppError::query_failed(format!(
                    "Failed to read DDL for '{}'",
                    table
                )))
            })
            .await
    }

    pub async fn get_schema_overview(
        &self,
        schema: Option<String>,
    ) -> DriverResult<SchemaOverview> {
        let target_schema = duckdb_schema_name(schema.as_deref().unwrap_or("main"));
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
}
