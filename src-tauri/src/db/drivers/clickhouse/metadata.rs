use super::connection::ClickHouseJsonResponse;
use super::helpers::{quote_ident, quote_literal, table_ref, value_to_bool, value_to_i64, value_to_string, required_i64_from_json_row};
use super::super::{DriverResult, ColumnInfo, ColumnSchema, QueryColumn, QueryResult, SchemaOverview, SingleResultSet, TableDataResponse, TableInfo, TableMetadata, TableSchema, TableStructure};
use crate::error::AppError;
use crate::models::ClickHouseTableExtra;
use serde_json::Value;
use std::collections::HashMap;

pub fn normalize_optional_sql_expr(v: Option<&Value>) -> Option<String> {
    v.and_then(Value::as_str).and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

pub fn extract_ttl_expr(create_table_query: &str) -> Option<String> {
    let lower = create_table_query.to_ascii_lowercase();
    let ttl_idx = lower.find(" ttl ")?;
    let after = &create_table_query[ttl_idx + 5..];
    let mut end = after.len();
    for marker in [" SETTINGS ", " COMMENT ", " PRIMARY KEY ", " ORDER BY "] {
        if let Some(pos) = after.to_ascii_uppercase().find(marker) {
            end = end.min(pos);
        }
    }
    let ttl = after[..end].trim().trim_end_matches(';').trim();
    if ttl.is_empty() {
        None
    } else {
        Some(ttl.to_string())
    }
}

impl ClickHouseDriver {
    pub async fn estimate_total_rows(&self, schema: &str, table: &str) -> DriverResult<Option<i64>> {
        let sql = format!(
            "SELECT total_rows FROM system.tables WHERE database = {} AND name = {} FORMAT JSON",
            quote_literal(schema),
            quote_literal(table)
        );
        let resp = self.execute_json(&sql, None).await?;
        let total = resp
            .data
            .first()
            .and_then(|v| v.get("total_rows"))
            .and_then(value_to_i64);
        Ok(total.filter(|v| *v >= 0))
    }

    pub async fn query_table_extra(
        &self,
        schema: &str,
        table: &str,
    ) -> DriverResult<Option<ClickHouseTableExtra>> {
        let sql = format!(
            "SELECT engine, partition_key, sorting_key, primary_key, sampling_key, create_table_query \
             FROM system.tables WHERE database = {} AND name = {} FORMAT JSON",
            quote_literal(schema),
            quote_literal(table)
        );
        let resp = self.execute_json(&sql, None).await?;
        let Some(first) = resp.data.first() else {
            return Ok(None);
        };

        let engine = first
            .get("engine")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if engine.is_empty() {
            return Ok(None);
        }

        let create_table_query = normalize_optional_sql_expr(first.get("create_table_query"));
        let ttl_expr = create_table_query.as_deref().and_then(extract_ttl_expr);

        Ok(Some(ClickHouseTableExtra {
            engine,
            partition_key: normalize_optional_sql_expr(first.get("partition_key")),
            sorting_key: normalize_optional_sql_expr(first.get("sorting_key")),
            primary_key_expr: normalize_optional_sql_expr(first.get("primary_key")),
            sampling_key: normalize_optional_sql_expr(first.get("sampling_key")),
            ttl_expr,
            create_table_query,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_ttl_expr_extracts_ttl() {
        let sql = "CREATE TABLE t (id Int64) ENGINE = MergeTree() TTL date + INTERVAL 30 DAY SETTINGS index_granularity = 8192";
        assert_eq!(extract_ttl_expr(sql), Some("date + INTERVAL 30 DAY".to_string()));
    }

    #[test]
    fn extract_ttl_expr_returns_none_for_no_ttl() {
        let sql = "CREATE TABLE t (id Int64) ENGINE = MergeTree() SETTINGS index_granularity = 8192";
        assert_eq!(extract_ttl_expr(sql), None);
    }

    #[test]
    fn normalize_optional_sql_expr_normalizes() {
        assert_eq!(normalize_optional_sql_expr(None), None);
        assert_eq!(normalize_optional_sql_expr(Some(&Value::String("".to_string()))), None);
        assert_eq!(normalize_optional_sql_expr(Some(&Value::String("  ".to_string()))), None);
        assert_eq!(normalize_optional_sql_expr(Some(&Value::String("expr".to_string()))), Some("expr".to_string()));
    }
}
