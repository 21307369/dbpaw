use super::super::DriverResult;
use crate::models::TableDataResponse;

use super::metadata::{build_mssql_select_list, quote_ident, table_ref};
use super::query::escape_literal;
use super::MssqlDriver;

impl MssqlDriver {
    pub(crate) async fn get_table_data_impl(
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
        let start = std::time::Instant::now();
        let safe_page = if page < 1 { 1 } else { page };
        let safe_limit = if limit < 1 { 100 } else { limit };
        let offset = (safe_page - 1) * safe_limit;
        let qualified = table_ref(&schema, &table)?;

        let filter = filter.map(|f| super::super::normalize_quotes(&f));
        let order_by = order_by.map(|f| super::super::normalize_quotes(&f));

        let where_clause = match &filter {
            Some(f) if !f.trim().is_empty() => format!(" WHERE {}", f.trim()),
            _ => String::new(),
        };

        let count_sql = format!(
            "SELECT COUNT_BIG(1) AS total FROM {}{}",
            qualified, where_clause
        );
        let count_rows = self.fetch_rows(&count_sql).await?;
        let total = count_rows
            .first()
            .map(|row| Self::parse_i64(row, 0))
            .unwrap_or(0);

        let order_clause = if let Some(ref raw) = order_by {
            if raw.trim().is_empty() {
                " ORDER BY (SELECT NULL)".to_string()
            } else {
                format!(" ORDER BY {}", raw.trim())
            }
        } else if let Some(ref col) = sort_column {
            let dir = if matches!(sort_direction.as_deref(), Some("desc")) {
                "DESC"
            } else {
                "ASC"
            };
            format!(" ORDER BY {} {}", quote_ident(col)?, dir)
        } else {
            " ORDER BY (SELECT NULL)".to_string()
        };

        let column_sql = format!(
            "SELECT c.name, t.name AS data_type FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id JOIN sys.tables tbl ON tbl.object_id = c.object_id JOIN sys.schemas s ON s.schema_id = tbl.schema_id WHERE s.name = '{}' AND tbl.name = '{}' ORDER BY c.column_id",
            escape_literal(&schema), escape_literal(&table)
        );
        let col_rows = self.fetch_rows(&column_sql).await?;
        let mut col_list = Vec::new();
        for row in &col_rows {
            col_list.push((Self::parse_string(row, 0), Self::parse_string(row, 1)));
        }
        let select_list = build_mssql_select_list(&col_list)?;

        let sql = if offset == 0 {
            format!(
                "SELECT TOP ({}) {} FROM {}{}{}",
                safe_limit, select_list, qualified, where_clause, order_clause
            )
        } else {
            let row_num_order =
                if order_clause.trim().is_empty() || order_clause.contains("SELECT NULL") {
                    "(SELECT NULL)".to_string()
                } else {
                    order_clause
                        .strip_prefix(" ORDER BY")
                        .unwrap_or(&order_clause)
                        .trim()
                        .to_string()
                };
            format!("SELECT * FROM ( SELECT TOP ({}) {}, ROW_NUMBER() OVER (ORDER BY {}) AS __row_num FROM {}{} ) AS __paged WHERE __row_num > {} ORDER BY __row_num", offset + safe_limit, select_list, row_num_order, qualified, where_clause, offset)
        };
        let (mut data, mut columns) = self.fetch_query_result_json(&sql).await?;

        for row in &mut data {
            if let serde_json::Value::Object(obj) = row {
                obj.remove("__row_num");
            }
        }
        if let Some(idx) = columns.iter().position(|c| c.name == "__row_num") {
            columns.remove(idx);
        }

        Ok(TableDataResponse {
            data,
            total,
            page: safe_page,
            limit: safe_limit,
            execution_time_ms: start.elapsed().as_millis() as i64,
        })
    }

    pub(crate) async fn get_table_data_chunk_impl(
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
        self.get_table_data_impl(
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
}
