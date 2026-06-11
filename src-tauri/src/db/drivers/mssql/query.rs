use super::super::DriverResult;
use crate::models::{QueryColumn, QueryResult, SingleResultSet};
use futures_util::TryStreamExt;
use std::collections::{HashMap, HashSet};
use tiberius::{ColumnData, QueryItem, Row};

use super::MssqlDriver;
use super::connection::{map_pool_error, query_error};

pub(crate) fn column_data_to_json(col: &ColumnData<'static>) -> serde_json::Value {
    match col {
        ColumnData::U8(None) | ColumnData::I16(None) | ColumnData::I32(None) | ColumnData::I64(None)
        | ColumnData::F32(None) | ColumnData::F64(None) | ColumnData::Bit(None)
        | ColumnData::String(None) | ColumnData::Guid(None) | ColumnData::Binary(None)
        | ColumnData::Numeric(None) | ColumnData::Xml(None) | ColumnData::DateTime(None)
        | ColumnData::SmallDateTime(None) | ColumnData::Time(None) | ColumnData::Date(None)
        | ColumnData::DateTime2(None) | ColumnData::DateTimeOffset(None) => serde_json::Value::Null,
        ColumnData::U8(Some(v)) => serde_json::json!(v),
        ColumnData::I16(Some(v)) => serde_json::json!(v),
        ColumnData::I32(Some(v)) => serde_json::json!(v),
        ColumnData::I64(Some(v)) => serde_json::json!(v),
        ColumnData::F32(Some(v)) => serde_json::json!(v),
        ColumnData::F64(Some(v)) => serde_json::json!(v),
        ColumnData::Bit(Some(v)) => serde_json::json!(v),
        ColumnData::String(Some(v)) => serde_json::json!(*v),
        ColumnData::Guid(Some(v)) => serde_json::json!(v.to_string()),
        ColumnData::Binary(Some(v)) => serde_json::json!(v.iter().map(|b| format!("{:02x}", b)).collect::<String>()),
        ColumnData::Numeric(Some(v)) => serde_json::json!(v.to_string()),
        ColumnData::Xml(Some(v)) => serde_json::json!(v.to_string()),
        ColumnData::DateTime(Some(v)) => {
            let base = chrono::NaiveDate::from_ymd_opt(1900, 1, 1).unwrap();
            let date = base + chrono::Duration::days(v.days() as i64);
            let ns = (v.seconds_fragments() as i64) * (1e9 as i64) / 300;
            let time = chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap() + chrono::Duration::nanoseconds(ns);
            serde_json::json!(chrono::NaiveDateTime::new(date, time).format("%Y-%m-%dT%H:%M:%S%.3f").to_string())
        }
        ColumnData::SmallDateTime(Some(v)) => {
            let base = chrono::NaiveDate::from_ymd_opt(1900, 1, 1).unwrap();
            let date = base + chrono::Duration::days(v.days() as i64);
            let time = chrono::NaiveTime::from_num_seconds_from_midnight_opt(v.seconds_fragments() as u32, 0).unwrap_or_default();
            serde_json::json!(chrono::NaiveDateTime::new(date, time).format("%Y-%m-%dT%H:%M:%S").to_string())
        }
        ColumnData::Time(Some(v)) => {
            let ns = v.increments() as i64 * 10i64.pow(9 - v.scale() as u32);
            let time = chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap() + chrono::Duration::nanoseconds(ns);
            serde_json::json!(time.format("%H:%M:%S%.f").to_string())
        }
        ColumnData::Date(Some(v)) => {
            let base = chrono::NaiveDate::from_ymd_opt(1, 1, 1).unwrap();
            let date = base + chrono::Duration::days(v.days() as i64);
            serde_json::json!(date.format("%Y-%m-%d").to_string())
        }
        ColumnData::DateTime2(Some(v)) => {
            let base = chrono::NaiveDate::from_ymd_opt(1, 1, 1).unwrap();
            let date = base + chrono::Duration::days(v.date().days() as i64);
            let t = v.time();
            let ns = t.increments() as i64 * 10i64.pow(9 - t.scale() as u32);
            let time = chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap() + chrono::Duration::nanoseconds(ns);
            serde_json::json!(chrono::NaiveDateTime::new(date, time).format("%Y-%m-%dT%H:%M:%S%.f").to_string())
        }
        ColumnData::DateTimeOffset(Some(v)) => {
            let base = chrono::NaiveDate::from_ymd_opt(1, 1, 1).unwrap();
            let dt2 = v.datetime2();
            let date = base + chrono::Duration::days(dt2.date().days() as i64);
            let t = dt2.time();
            let ns = t.increments() as i64 * 10i64.pow(9 - t.scale() as u32);
            let time = chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap() + chrono::Duration::nanoseconds(ns);
            let offset_mins = v.offset() as i32;
            let sign = if offset_mins < 0 { "-" } else { "+" };
            let abs = offset_mins.abs();
            serde_json::json!(format!("{}{}{:02}:{:02}", chrono::NaiveDateTime::new(date, time).format("%Y-%m-%dT%H:%M:%S%.f"), sign, abs / 60, abs % 60))
        }
        #[allow(unreachable_patterns)]
        _ => serde_json::Value::Null,
    }
}

pub(crate) fn escape_literal(value: &str) -> String {
    value.replace('\'', "''")
}

fn already_has_for_json(sql: &str) -> bool {
    let upper = sql.to_uppercase();
    let bytes = upper.as_bytes();
    let mut i = 0;
    while i + 8 <= bytes.len() {
        match bytes[i] {
            b'\'' => { i += 1; while i < bytes.len() { if bytes[i] == b'\'' { i += 1; if i < bytes.len() && bytes[i] == b'\'' { continue; } break; } i += 1; } continue; }
            b'-' if i + 1 < bytes.len() && bytes[i + 1] == b'-' => { i += 2; while i < bytes.len() && bytes[i] != b'\n' { i += 1; } continue; }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'*' => { i += 2; while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') { i += 1; } if i + 1 < bytes.len() { i += 2; } continue; }
            _ => { if bytes[i..].starts_with(b"FOR JSON") { let before_ok = i == 0 || { let ch = bytes[i - 1]; !ch.is_ascii_alphabetic() && ch != b'_' }; let after = i + 8; let after_ok = after >= bytes.len() || { let ch = bytes[after]; !ch.is_ascii_alphabetic() && ch != b'_' }; if before_ok && after_ok { return true; } } }
        }
        i += 1;
    }
    false
}

fn has_top_level_keyword(sql: &str, keyword: &str) -> bool {
    let upper = sql.to_uppercase();
    let kw_bytes = keyword.to_uppercase().as_bytes().to_vec();
    let kw_len = kw_bytes.len();
    let bytes = upper.as_bytes();
    let mut depth: i32 = 0;
    let mut i = 0;
    while i + kw_len <= bytes.len() {
        match bytes[i] {
            b'(' => depth += 1,
            b')' => depth = depth.saturating_sub(1),
            b'\'' => { i += 1; while i < bytes.len() { if bytes[i] == b'\'' { i += 1; if i < bytes.len() && bytes[i] == b'\'' { continue; } break; } i += 1; } continue; }
            b'-' if i + 1 < bytes.len() && bytes[i + 1] == b'-' => { i += 2; while i < bytes.len() && bytes[i] != b'\n' { i += 1; } continue; }
            b'/' if i + 1 < bytes.len() && bytes[i + 1] == b'*' => { i += 2; while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') { i += 1; } if i + 1 < bytes.len() { i += 2; } continue; }
            _ if depth == 0 => { if bytes[i..].starts_with(&kw_bytes) { let after = i + kw_len; let after_ok = after >= bytes.len() || { let ch = bytes[after]; !ch.is_ascii_alphabetic() && ch != b'_' }; if after_ok { return true; } } }
            _ => {}
        }
        i += 1;
    }
    false
}

fn has_top_level_union(sql: &str) -> bool { has_top_level_keyword(sql, "UNION") }

fn is_for_json_safe(sql: &str) -> bool {
    let first = super::super::first_sql_keyword(sql);
    if !matches!(first.as_deref(), Some("SELECT")) { return false; }
    if has_top_level_union(sql) { return false; }
    true
}

fn build_for_json_query(sql: &str) -> String {
    let trimmed = sql.trim_end().trim_end_matches(';').trim_end();
    if already_has_for_json(trimmed) { return trimmed.to_string(); }
    format!("{trimmed} FOR JSON PATH, INCLUDE_NULL_VALUES")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum MssqlStatementKind { Read, AffectedRows, Other }

fn classify_mssql_statement(sql: &str) -> MssqlStatementKind {
    let Some(first_keyword) = super::super::first_sql_keyword(sql) else { return MssqlStatementKind::Other; };
    match first_keyword.as_str() {
        "SELECT" | "WITH" | "SHOW" => MssqlStatementKind::Read,
        "INSERT" | "UPDATE" | "DELETE" | "MERGE" => MssqlStatementKind::AffectedRows,
        "EXEC" | "EXECUTE" => {
            if !contains_sp_executesql(sql) { return MssqlStatementKind::Read; }
            match extract_sp_executesql_text(sql).and_then(|inner| super::super::first_sql_keyword(&inner)).as_deref() {
                Some("SELECT") | Some("WITH") => MssqlStatementKind::Read,
                Some("INSERT") | Some("UPDATE") | Some("DELETE") | Some("MERGE") => MssqlStatementKind::AffectedRows,
                _ => MssqlStatementKind::Other,
            }
        }
        _ => MssqlStatementKind::Other,
    }
}

fn contains_sp_executesql(sql: &str) -> bool { sql.to_ascii_uppercase().contains("SP_EXECUTESQL") }

fn extract_sp_executesql_text(sql: &str) -> Option<String> {
    let bytes = sql.as_bytes();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'N' || bytes[i] == b'n' {
            let mut quote_idx = i + 1;
            while quote_idx < bytes.len() && bytes[quote_idx].is_ascii_whitespace() { quote_idx += 1; }
            if quote_idx < bytes.len() && bytes[quote_idx] == b'\'' { return parse_mssql_unicode_string_literal(sql, quote_idx); }
        }
        i += 1;
    }
    None
}

fn parse_mssql_unicode_string_literal(sql: &str, quote_idx: usize) -> Option<String> {
    let mut out = String::new();
    let mut chars = sql[quote_idx + 1..].chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\'' { if matches!(chars.peek(), Some('\'')) { chars.next(); out.push('\''); continue; } return Some(out); }
        out.push(ch);
    }
    None
}

fn is_high_precision_mssql_query_type(type_name: &str) -> bool {
    let t = type_name.trim().to_ascii_lowercase();
    t.contains("int8") || t.contains("bigint") || t.contains("numeric") || t.contains("decimal") || t.contains("money")
}

fn normalize_mssql_row_json(row_json: &mut serde_json::Value, high_precision_cols: &HashSet<String>) -> DriverResult<()> {
    let obj = row_json.as_object_mut().ok_or_else(|| query_error("Expected JSON object row from MSSQL FOR JSON"))?;
    let mut lookup: HashMap<String, String> = HashMap::new();
    for key in obj.keys() { lookup.insert(key.to_ascii_lowercase(), key.clone()); }
    for col in high_precision_cols {
        let Some(actual_key) = lookup.get(&col.to_ascii_lowercase()) else { continue; };
        let Some(v) = obj.get_mut(actual_key) else { continue; };
        if v.is_number() { *v = serde_json::Value::String(v.to_string()); }
    }
    Ok(())
}

fn normalize_mssql_for_json_columns(columns: Vec<QueryColumn>, rows: &[serde_json::Value]) -> Vec<QueryColumn> {
    let has_json_wrapper_column = columns.len() == 1 && columns[0].name.starts_with("JSON_F52E2B61-18A1-11d1-B105-00805F49916B");
    if !columns.is_empty() && !has_json_wrapper_column { return columns; }
    rows.first().and_then(|row| row.as_object()).map(|obj| obj.keys().map(|name| QueryColumn { name: name.clone(), r#type: "Unknown".to_string() }).collect()).unwrap_or_default()
}

impl MssqlDriver {
    pub(crate) async fn fetch_rows(&self, sql: &str) -> DriverResult<Vec<Row>> { Ok(self.fetch_rows_with_columns(sql).await?.0) }

    pub(crate) async fn fetch_rows_with_columns(&self, sql: &str) -> DriverResult<(Vec<Row>, Vec<QueryColumn>)> {
        let mut client = self.pool.get().await.map_err(map_pool_error)?;
        let mut stream = client.simple_query(sql).await.map_err(|e| query_error(e.to_string()))?;
        let mut rows = Vec::new();
        let mut columns = Vec::new();
        while let Some(item) = stream.try_next().await.map_err(|e| query_error(e.to_string()))? {
            match item {
                QueryItem::Metadata(meta) if columns.is_empty() => {
                    columns = meta.columns().iter().map(|col| QueryColumn { name: col.name().to_string(), r#type: format!("{:?}", col.column_type()) }).collect();
                }
                QueryItem::Row(row) => rows.push(row),
                _ => {}
            }
        }
        Ok((rows, columns))
    }

    pub(crate) fn parse_i64(row: &Row, idx: usize) -> i64 {
        macro_rules! try_get { ($ty:ty, $conv:expr) => { if let Ok(Some(v)) = row.try_get::<$ty, _>(idx) { return $conv(v); } }; }
        try_get!(i64, |v: i64| v); try_get!(i32, |v: i32| v as i64); try_get!(i16, |v: i16| v as i64);
        try_get!(u8, |v: u8| v as i64); try_get!(bool, |v: bool| if v { 1 } else { 0 });
        try_get!(&str, |v: &str| v.parse::<i64>().unwrap_or(0));
        0
    }

    pub(crate) fn parse_string(row: &Row, idx: usize) -> String {
        if let Ok(Some(v)) = row.try_get::<&str, _>(idx) { return v.to_string(); }
        if let Ok(Some(v)) = row.try_get::<&[u8], _>(idx) { return String::from_utf8_lossy(v).to_string(); }
        String::new()
    }

    pub(crate) async fn fetch_query_result_json(&self, sql: &str) -> DriverResult<(Vec<serde_json::Value>, Vec<QueryColumn>)> {
        if self.supports_for_json && is_for_json_safe(sql) { self.fetch_query_result_for_json(sql).await } else { self.fetch_query_result_direct(sql).await }
    }

    async fn fetch_query_result_direct(&self, sql: &str) -> DriverResult<(Vec<serde_json::Value>, Vec<QueryColumn>)> {
        let mut client = self.pool.get().await.map_err(map_pool_error)?;
        let mut stream = client.simple_query(sql).await.map_err(|e| query_error(e.to_string()))?;
        let mut columns: Vec<QueryColumn> = Vec::new();
        let mut high_precision_cols = HashSet::new();
        let mut data: Vec<serde_json::Value> = Vec::new();
        while let Some(item) = stream.try_next().await.map_err(|e| query_error(e.to_string()))? {
            match item {
                QueryItem::Metadata(meta) if columns.is_empty() => {
                    for col in meta.columns() {
                        let type_str = format!("{:?}", col.column_type());
                        if is_high_precision_mssql_query_type(&type_str) { high_precision_cols.insert(col.name().to_string()); }
                        columns.push(QueryColumn { name: col.name().to_string(), r#type: type_str });
                    }
                }
                QueryItem::Row(row) => {
                    let cells: Vec<_> = row.cells().map(|(_, c)| c).collect();
                    let mut obj = serde_json::Map::new();
                    for (i, col) in columns.iter().enumerate() {
                        if let Some(cell) = cells.get(i) {
                            let mut val = column_data_to_json(cell);
                            if high_precision_cols.contains(&col.name) && val.is_number() { val = serde_json::Value::String(val.to_string()); }
                            obj.insert(col.name.clone(), val);
                        }
                    }
                    data.push(serde_json::Value::Object(obj));
                }
                _ => {}
            }
        }
        Ok((data, columns))
    }

    async fn fetch_query_result_for_json(&self, sql: &str) -> DriverResult<(Vec<serde_json::Value>, Vec<QueryColumn>)> {
        let json_sql = build_for_json_query(sql);
        let mut columns = self.describe_query_result_columns(sql).await.unwrap_or_default();
        let high_precision_cols: HashSet<String> = columns.iter().filter(|col| is_high_precision_mssql_query_type(&col.r#type)).map(|col| col.name.clone()).collect();
        let mut client = self.pool.get().await.map_err(map_pool_error)?;
        let mut stream = client.simple_query(&json_sql).await.map_err(|e| query_error(e.to_string()))?;
        let mut json_text = String::new();
        while let Some(item) = stream.try_next().await.map_err(|e| query_error(e.to_string()))? {
            if let QueryItem::Row(row) = item { json_text.push_str(&Self::parse_string(&row, 0)); }
        }
        if json_text.trim().is_empty() { return Ok((Vec::new(), columns)); }
        let parsed: serde_json::Value = serde_json::from_str(&json_text).map_err(|e| query_error(format!("Failed to parse MSSQL JSON result: {e}")))?;
        let mut data = match parsed {
            serde_json::Value::Array(arr) => arr,
            serde_json::Value::Object(obj) => vec![serde_json::Value::Object(obj)],
            _ => return Err(query_error("MSSQL FOR JSON result is not array/object")),
        };
        for row in &mut data { normalize_mssql_row_json(row, &high_precision_cols)?; }
        columns = normalize_mssql_for_json_columns(columns, &data);
        Ok((data, columns))
    }

    async fn describe_query_result_columns(&self, sql: &str) -> DriverResult<Vec<QueryColumn>> {
        let describe_sql = format!("EXEC sys.sp_describe_first_result_set @tsql = N'{}'", escape_literal(sql));
        let rows = self.fetch_rows(&describe_sql).await?;
        let mut columns = Vec::new();
        for row in rows {
            let is_hidden = Self::parse_i64(&row, 0) == 1;
            if is_hidden { continue; }
            let name = Self::parse_string(&row, 2);
            if name.trim().is_empty() { continue; }
            columns.push(QueryColumn { name, r#type: Self::parse_string(&row, 5) });
        }
        Ok(columns)
    }

    async fn execute_single_statement(&self, sql: &str) -> DriverResult<(Vec<QueryColumn>, Vec<serde_json::Value>, i64)> {
        match classify_mssql_statement(sql) {
            MssqlStatementKind::Read => {
                let (data, columns) = self.fetch_query_result_json(sql).await?;
                Ok((columns, data.clone(), data.len() as i64))
            }
            MssqlStatementKind::AffectedRows => {
                let mut client = self.pool.get().await.map_err(map_pool_error)?;
                let result = client.execute(sql, &[]).await.map_err(|e| query_error(e.to_string()))?;
                Ok((Vec::new(), Vec::new(), result.total() as i64))
            }
            MssqlStatementKind::Other => {
                let mut client = self.pool.get().await.map_err(map_pool_error)?;
                let stream = client.simple_query(sql).await.map_err(|e| query_error(e.to_string()))?;
                let _ = stream.into_results().await.map_err(|e| query_error(e.to_string()))?;
                Ok((Vec::new(), Vec::new(), 0))
            }
        }
    }

    pub(crate) async fn execute_query_impl(&self, sql: String) -> DriverResult<QueryResult> {
        let start = std::time::Instant::now();
        let statements = super::super::split_sql_statements(&sql);
        if statements.is_empty() { return Err(query_error("Empty SQL statement")); }

        if statements.len() == 1 {
            let last_sql = statements.last().unwrap();
            let (columns, data, row_count) = self.execute_single_statement(last_sql).await?;
            return Ok(QueryResult { data, row_count, columns, time_taken_ms: start.elapsed().as_millis() as i64, success: true, error: None, result_sets: None });
        }

        let mut result_sets = Vec::new();
        let mut last_error: Option<String> = None;
        for (idx, statement) in statements.iter().enumerate() {
            match self.execute_single_statement(statement).await {
                Ok((columns, data, row_count)) => {
                    result_sets.push(SingleResultSet { data, row_count, columns, index: idx as u32, statement: statement.clone() });
                }
                Err(e) => { last_error = Some(e.to_string()); break; }
            }
        }
        let duration = start.elapsed();
        if let Some(err) = last_error {
            return Ok(QueryResult { data: vec![], row_count: 0, columns: vec![], time_taken_ms: duration.as_millis() as i64, success: false, error: Some(err), result_sets: Some(result_sets) });
        }
        Ok(QueryResult { data: vec![], row_count: 0, columns: vec![], time_taken_ms: duration.as_millis() as i64, success: true, error: None, result_sets: Some(result_sets) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_high_precision_mssql_query_type() {
        assert!(is_high_precision_mssql_query_type("Int8"));
        assert!(is_high_precision_mssql_query_type("Numericn"));
        assert!(is_high_precision_mssql_query_type("Money"));
        assert!(!is_high_precision_mssql_query_type("Int4"));
    }

    #[test]
    fn test_normalize_mssql_row_json_stringify_high_precision() {
        let mut row = serde_json::json!({"id": 9223372036854775807_i64, "amount": 1234.56, "name": "x"});
        let hp = HashSet::from(["ID".to_string(), "amount".to_string()]);
        normalize_mssql_row_json(&mut row, &hp).unwrap();
        assert_eq!(row.get("id").and_then(|v| v.as_str()), Some("9223372036854775807"));
        assert_eq!(row.get("amount").and_then(|v| v.as_str()), Some("1234.56"));
        assert_eq!(row.get("name").and_then(|v| v.as_str()), Some("x"));
    }

    #[test]
    fn test_mssql_for_json_columns_fall_back_to_row_keys() {
        let rows = vec![serde_json::json!({"id": 1, "name": "Alice"})];
        let columns = vec![QueryColumn { name: "JSON_F52E2B61-18A1-11d1-B105-00805F49916B".to_string(), r#type: "NVarchar".to_string() }];
        let normalized = normalize_mssql_for_json_columns(columns, &rows);
        assert_eq!(normalized.iter().map(|c| c.name.as_str()).collect::<Vec<_>>(), vec!["id", "name"]);
    }

    #[test]
    fn test_classify_mssql_statement_distinguishes_read_and_affected_rows() {
        assert_eq!(classify_mssql_statement("SELECT 1 AS ok"), MssqlStatementKind::Read);
        assert_eq!(classify_mssql_statement("INSERT INTO t(id) VALUES (1)"), MssqlStatementKind::AffectedRows);
        assert_eq!(classify_mssql_statement("CREATE TABLE t(id INT)"), MssqlStatementKind::Other);
    }

    #[test]
    fn test_classify_mssql_sp_executesql_by_inner_statement() {
        assert_eq!(classify_mssql_statement("EXEC sp_executesql N'SELECT id FROM dbo.t WHERE name = N''alice'''"), MssqlStatementKind::Read);
        assert_eq!(classify_mssql_statement("EXEC sp_executesql N'INSERT INTO dbo.t(name) VALUES (N''alice'')'"), MssqlStatementKind::AffectedRows);
    }

    #[test]
    fn test_extract_sp_executesql_text_unescapes_doubled_quotes() {
        assert_eq!(extract_sp_executesql_text("EXEC sp_executesql N'SELECT N''alice'' AS name'").as_deref(), Some("SELECT N'alice' AS name"));
    }

    #[test]
    fn test_build_for_json_query_trims_trailing_semicolon() {
        assert_eq!(build_for_json_query("SELECT id, name FROM dbo.users;"), "SELECT id, name FROM dbo.users FOR JSON PATH, INCLUDE_NULL_VALUES");
    }

    #[test]
    fn test_already_has_for_json_detects_variants() {
        assert!(already_has_for_json("SELECT 1 FOR JSON PATH"));
        assert!(already_has_for_json("SELECT 1 FOR JSON AUTO"));
        assert!(!already_has_for_json("SELECT * FROM performance_json_log"));
        assert!(!already_has_for_json("SELECT 'FOR JSON' AS label"));
    }

    #[test]
    fn test_has_top_level_union_detects_union() {
        assert!(has_top_level_union("SELECT 1 UNION SELECT 2"));
        assert!(!has_top_level_union("SELECT * FROM (SELECT 1 UNION SELECT 2) AS t"));
    }

    #[test]
    fn test_is_for_json_safe() {
        assert!(is_for_json_safe("SELECT * FROM users"));
        assert!(!is_for_json_safe("WITH cte AS (SELECT 1) SELECT * FROM cte"));
        assert!(!is_for_json_safe("SELECT 1 UNION SELECT 2"));
        assert!(!is_for_json_safe("EXEC dbo.MyProc"));
    }

    #[test]
    fn test_build_for_json_query_preserves_existing_for_json() {
        assert_eq!(build_for_json_query("SELECT 1 FOR JSON PATH, ROOT('data')"), "SELECT 1 FOR JSON PATH, ROOT('data')");
    }
}
