pub mod connection;
pub mod helpers;
pub mod metadata;
pub mod query;
pub mod table_data;

use super::{DatabaseDriver, DriverCapabilities, DriverResult};
use crate::error::AppError;
use crate::models::{
    ClickHouseTableExtra, ColumnInfo, ColumnSchema, ConnectionForm, QueryColumn, QueryResult,
    SchemaOverview, SingleResultSet, TableDataResponse, TableInfo, TableMetadata, TableSchema,
    TableStructure,
};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;

use crate::ssh::SshTunnel;

pub struct ClickHouseDriver {
    pub client: reqwest::Client,
    pub base_url: String,
    pub database: String,
    pub username: String,
    pub password: String,
    pub ssh_tunnel: Option<SshTunnel>,
}

#[async_trait]
impl DatabaseDriver for ClickHouseDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities::QUERY_WITH_ID
    }

    async fn close(&self) {
        // reqwest::Client does not require explicit close.
    }

    async fn test_connection(&self) -> DriverResult<()> {
        self.execute_raw("SELECT 1", None).await.map(|_| ())
    }

    async fn list_databases(&self) -> DriverResult<Vec<String>> {
        let resp = self
            .execute_json(
                "SELECT name FROM system.databases ORDER BY name FORMAT JSON",
                None,
            )
            .await?;

        let mut out = Vec::new();
        for row in resp.data {
            if let Some(name) = row.get("name").and_then(Value::as_str) {
                out.push(name.to_string());
            }
        }
        Ok(out)
    }

    async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>> {
        let target_schema = schema
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| self.database.clone());

        let sql = format!(
            "SELECT database, name, engine FROM system.tables WHERE database = {} ORDER BY name FORMAT JSON",
            quote_literal(&target_schema)
        );
        let resp = self.execute_json(&sql, None).await?;

        let mut out = Vec::new();
        for row in resp.data {
            let schema_name = row
                .get("database")
                .and_then(Value::as_str)
                .unwrap_or(target_schema.as_str())
                .to_string();
            let table_name = row
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let table_type = row
                .get("engine")
                .and_then(Value::as_str)
                .unwrap_or("table")
                .to_string();

            if !table_name.is_empty() {
                out.push(TableInfo {
                    schema: schema_name,
                    name: table_name,
                    r#type: table_type,
                });
            }
        }

        Ok(out)
    }

    async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableStructure> {
        let columns = self.get_table_metadata(schema, table).await?.columns;
        Ok(TableStructure { columns })
    }

    async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableMetadata> {
        let target_schema = if schema.trim().is_empty() {
            self.database.clone()
        } else {
            schema
        };

        let sql = format!(
            "SELECT name, type, default_expression, comment, is_in_primary_key \
             FROM system.columns \
             WHERE database = {} AND table = {} \
             ORDER BY position FORMAT JSON",
            quote_literal(&target_schema),
            quote_literal(&table)
        );

        let resp = self.execute_json(&sql, None).await?;

        let mut columns = Vec::new();
        for row in resp.data {
            let name = row
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            if name.is_empty() {
                continue;
            }

            let type_name = row
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let nullable = type_name.starts_with("Nullable(");
            let default_value = row
                .get("default_expression")
                .and_then(Value::as_str)
                .and_then(|s| {
                    let trimmed = s.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                });
            let comment = row.get("comment").and_then(Value::as_str).and_then(|s| {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed.to_string())
                }
            });

            let primary_key = row
                .get("is_in_primary_key")
                .map(value_to_bool)
                .unwrap_or(false);

            columns.push(ColumnInfo {
                name,
                r#type: type_name,
                nullable,
                default_value,
                primary_key,
                comment,
                default_constraint_name: None,
            });
        }

        let clickhouse_extra = self.query_table_extra(&target_schema, &table).await?;

        Ok(TableMetadata {
            columns,
            indexes: vec![],
            foreign_keys: vec![],
            clickhouse_extra,
            cassandra_extra: None,
            special_type_summaries: vec![],
        })
    }

    async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String> {
        let target_schema = if schema.trim().is_empty() {
            self.database.clone()
        } else {
            schema
        };
        let sql = format!(
            "SHOW CREATE TABLE {} FORMAT JSON",
            table_ref(&target_schema, &table)
        );
        let resp = self.execute_json(&sql, None).await?;

        if let Some(first) = resp.data.first() {
            for key in ["statement", "create_table_query", "result"] {
                if let Some(v) = first.get(key).and_then(Value::as_str) {
                    return Ok(v.to_string());
                }
            }

            if let Some(obj) = first.as_object() {
                for value in obj.values() {
                    if let Some(text) = value.as_str() {
                        return Ok(text.to_string());
                    }
                }
            }
        }

        Err(AppError::query_failed(
            "SHOW CREATE TABLE returned empty result",
        ))
    }

    async fn get_table_data(
        &self,
        schema: String,
        table: String,
        page: i64,
        limit: i64,
        sort_column: Option<String>,
        sort_direction: Option<String>,
        filter: Option<String>,
        order_by: Option<String>,
    ) -> DriverResult<TableDataResponse> {
        self.get_table_data(
            schema,
            table,
            page,
            limit,
            sort_column,
            sort_direction,
            filter,
            order_by,
        )
        .await
    }

    async fn get_table_data_chunk(
        &self,
        schema: String,
        table: String,
        page: i64,
        limit: i64,
        sort_column: Option<String>,
        sort_direction: Option<String>,
        filter: Option<String>,
        order_by: Option<String>,
    ) -> DriverResult<TableDataResponse> {
        self.get_table_data_chunk(
            schema,
            table,
            page,
            limit,
            sort_column,
            sort_direction,
            filter,
            order_by,
        )
        .await
    }

    async fn execute_query(&self, sql: String) -> DriverResult<QueryResult> {
        self.execute_query_with_id(sql, None).await
    }

    async fn execute_query_with_id(
        &self,
        sql: String,
        query_id: Option<&str>,
    ) -> DriverResult<QueryResult> {
        self.execute_query_with_id(sql, query_id).await
    }

    async fn get_schema_overview(&self, schema: Option<String>) -> DriverResult<SchemaOverview> {
        let base = "SELECT database, table, name, type FROM system.columns";
        let sql = if let Some(s) = schema.filter(|s| !s.trim().is_empty()) {
            format!(
                "{} WHERE database = {} ORDER BY database, table, position FORMAT JSON",
                base,
                quote_literal(&s)
            )
        } else {
            format!("{} ORDER BY database, table, position FORMAT JSON", base)
        };

        let resp = self.execute_json(&sql, None).await?;
        let mut grouped: HashMap<(String, String), Vec<ColumnSchema>> = HashMap::new();

        for row in resp.data {
            let schema_name = row
                .get("database")
                .and_then(value_to_string)
                .unwrap_or_default();
            let table_name = row
                .get("table")
                .and_then(value_to_string)
                .unwrap_or_default();
            let col_name = row
                .get("name")
                .and_then(value_to_string)
                .unwrap_or_default();
            let col_type = row
                .get("type")
                .and_then(value_to_string)
                .unwrap_or_default();

            if schema_name.is_empty() || table_name.is_empty() || col_name.is_empty() {
                continue;
            }

            grouped
                .entry((schema_name, table_name))
                .or_default()
                .push(ColumnSchema {
                    name: col_name,
                    r#type: col_type,
                });
        }

        let mut tables = grouped
            .into_iter()
            .map(|((schema_name, table_name), columns)| TableSchema {
                schema: schema_name,
                name: table_name,
                columns,
            })
            .collect::<Vec<_>>();

        tables.sort_by(|a, b| a.schema.cmp(&b.schema).then(a.name.cmp(&b.name)));

        Ok(SchemaOverview { tables })
    }
}
