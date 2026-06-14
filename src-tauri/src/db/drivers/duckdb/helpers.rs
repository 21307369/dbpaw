use crate::db::drivers::DriverResult;
use crate::error::AppError;
use crate::models::ConnectionForm;
use chrono::{DateTime, Duration, NaiveDate, NaiveTime, Utc};
use duckdb::{
    types::{TimeUnit, Value as DuckValue, ValueRef},
    Row,
};

pub fn build_file_path(form: &ConnectionForm) -> DriverResult<String> {
    form.file_path
        .clone()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or(AppError::validation("file_path cannot be empty"))
}

pub fn quote_ident(ident: &str) -> String {
    format!("\"{}\"", ident.replace('"', "\"\""))
}

pub fn quote_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

pub fn duckdb_schema_name(schema: &str) -> String {
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

pub fn duckdb_table_ref(schema: &str, table: &str) -> String {
    let schema_name = duckdb_schema_name(schema);
    if schema_name == "main" {
        quote_ident(table)
    } else {
        format!("{}.{}", quote_ident(&schema_name), quote_ident(table))
    }
}

pub fn sql_contains_keyword(sql: &str, keyword: &str) -> bool {
    let keyword_bytes = keyword.as_bytes();
    if keyword_bytes.is_empty() {
        return false;
    }

    let sql_bytes = sql.as_bytes();
    let keyword_len = keyword_bytes.len();
    if sql_bytes.len() < keyword_len {
        return false;
    }

    for i in 0..=(sql_bytes.len() - keyword_len) {
        let before_ok = i == 0 || !sql_bytes[i - 1].is_ascii_alphabetic();
        if !before_ok {
            continue;
        }

        let after_idx = i + keyword_len;
        let after_ok = after_idx == sql_bytes.len() || !sql_bytes[after_idx].is_ascii_alphabetic();
        if !after_ok {
            continue;
        }

        if sql_bytes[i..after_idx].eq_ignore_ascii_case(keyword_bytes) {
            return true;
        }
    }

    false
}

pub fn number_from_f64(v: f64) -> serde_json::Value {
    serde_json::Number::from_f64(v)
        .map(serde_json::Value::Number)
        .unwrap_or_else(|| serde_json::Value::String(v.to_string()))
}

pub fn format_date32(days_since_epoch: i32) -> String {
    let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).expect("valid epoch date");
    epoch
        .checked_add_signed(Duration::days(days_since_epoch.into()))
        .unwrap_or(epoch)
        .format("%F")
        .to_string()
}

pub fn format_timestamp(unit: TimeUnit, value: i64) -> String {
    let micros = unit.to_micros(value);
    let seconds = micros.div_euclid(1_000_000);
    let nanos = (micros.rem_euclid(1_000_000) as u32) * 1_000;
    DateTime::<Utc>::from_timestamp(seconds, nanos)
        .map(|dt| dt.naive_utc().format("%F %T%.f").to_string())
        .unwrap_or_else(|| value.to_string())
}

pub fn format_time64(unit: TimeUnit, value: i64) -> String {
    let micros = unit.to_micros(value);
    let micros_per_day = 86_400_i64 * 1_000_000_i64;
    let normalized_micros = micros.rem_euclid(micros_per_day);
    let seconds = (normalized_micros / 1_000_000) as u32;
    let nanos = ((normalized_micros % 1_000_000) as u32) * 1_000;
    NaiveTime::from_num_seconds_from_midnight_opt(seconds, nanos)
        .map(|t| t.format("%T%.f").to_string())
        .unwrap_or_else(|| value.to_string())
}

pub fn duckdb_value_key_to_string(value: &DuckValue) -> String {
    match duckdb_value_to_json(value) {
        serde_json::Value::String(v) => v,
        serde_json::Value::Number(v) => v.to_string(),
        serde_json::Value::Bool(v) => v.to_string(),
        serde_json::Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

pub fn duckdb_value_to_json(value: &DuckValue) -> serde_json::Value {
    match value {
        DuckValue::Null => serde_json::Value::Null,
        DuckValue::Boolean(v) => serde_json::Value::Bool(*v),
        DuckValue::TinyInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::SmallInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::Int(v) => serde_json::Value::String(v.to_string()),
        DuckValue::BigInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::HugeInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::UTinyInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::USmallInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::UInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::UBigInt(v) => serde_json::Value::String(v.to_string()),
        DuckValue::Float(v) => number_from_f64((*v).into()),
        DuckValue::Double(v) => number_from_f64(*v),
        DuckValue::Decimal(v) => serde_json::Value::String(v.to_string()),
        DuckValue::Timestamp(unit, v) => serde_json::Value::String(format_timestamp(*unit, *v)),
        DuckValue::Date32(v) => serde_json::Value::String(format_date32(*v)),
        DuckValue::Time64(unit, v) => serde_json::Value::String(format_time64(*unit, *v)),
        DuckValue::Text(v) => serde_json::Value::String(v.to_string()),
        DuckValue::Blob(v) => serde_json::Value::String(String::from_utf8_lossy(v).to_string()),
        DuckValue::Interval {
            months,
            days,
            nanos,
        } => {
            let mut obj = serde_json::Map::new();
            obj.insert("months".to_string(), serde_json::Value::from(*months));
            obj.insert("days".to_string(), serde_json::Value::from(*days));
            obj.insert(
                "nanos".to_string(),
                serde_json::Value::String(nanos.to_string()),
            );
            serde_json::Value::Object(obj)
        }
        DuckValue::List(items) | DuckValue::Array(items) => {
            serde_json::Value::Array(items.iter().map(duckdb_value_to_json).collect())
        }
        DuckValue::Enum(v) => serde_json::Value::String(v.to_string()),
        DuckValue::Struct(fields) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in fields.iter() {
                obj.insert(k.clone(), duckdb_value_to_json(v));
            }
            serde_json::Value::Object(obj)
        }
        DuckValue::Map(entries) => {
            let mut obj = serde_json::Map::new();
            for (k, v) in entries.iter() {
                obj.insert(duckdb_value_key_to_string(k), duckdb_value_to_json(v));
            }
            serde_json::Value::Object(obj)
        }
        DuckValue::Union(v) => duckdb_value_to_json(v),
    }
}

pub fn duckdb_value_ref_type_name(value: &ValueRef<'_>) -> &'static str {
    match value {
        ValueRef::Null => "NULL",
        ValueRef::Boolean(_) => "BOOLEAN",
        ValueRef::TinyInt(_) => "TINYINT",
        ValueRef::SmallInt(_) => "SMALLINT",
        ValueRef::Int(_) => "INTEGER",
        ValueRef::BigInt(_) => "BIGINT",
        ValueRef::HugeInt(_) => "HUGEINT",
        ValueRef::UTinyInt(_) => "UTINYINT",
        ValueRef::USmallInt(_) => "USMALLINT",
        ValueRef::UInt(_) => "UINTEGER",
        ValueRef::UBigInt(_) => "UBIGINT",
        ValueRef::Float(_) => "FLOAT",
        ValueRef::Double(_) => "DOUBLE",
        ValueRef::Decimal(_) => "DECIMAL",
        ValueRef::Timestamp(_, _) => "TIMESTAMP",
        ValueRef::Date32(_) => "DATE",
        ValueRef::Time64(_, _) => "TIME",
        ValueRef::Text(_) => "TEXT",
        ValueRef::Blob(_) => "BLOB",
        ValueRef::Interval { .. } => "INTERVAL",
        ValueRef::List(_, _) => "LIST",
        ValueRef::Enum(_, _) => "ENUM",
        ValueRef::Struct(_, _) => "STRUCT",
        ValueRef::Array(_, _) => "ARRAY",
        ValueRef::Map(_, _) => "MAP",
        ValueRef::Union(_, _) => "UNION",
    }
}

pub fn duckdb_cell_to_json(
    row: &Row<'_>,
    idx: usize,
    column_name: &str,
) -> DriverResult<serde_json::Value> {
    let value = match row.get_ref(idx) {
        Ok(v) => v,
        Err(e) => {
            return Err(AppError::query_failed(format!(
                "Failed to decode DuckDB column '{}' at index {}: {}",
                column_name, idx, e
            )));
        }
    };

    Ok(match value {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Boolean(v) => serde_json::Value::Bool(v),
        ValueRef::TinyInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::SmallInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::Int(v) => serde_json::Value::String(v.to_string()),
        ValueRef::BigInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::HugeInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::UTinyInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::USmallInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::UInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::UBigInt(v) => serde_json::Value::String(v.to_string()),
        ValueRef::Float(v) => number_from_f64(v.into()),
        ValueRef::Double(v) => number_from_f64(v),
        ValueRef::Decimal(v) => serde_json::Value::String(v.to_string()),
        ValueRef::Timestamp(unit, v) => serde_json::Value::String(format_timestamp(unit, v)),
        ValueRef::Date32(v) => serde_json::Value::String(format_date32(v)),
        ValueRef::Time64(unit, v) => serde_json::Value::String(format_time64(unit, v)),
        ValueRef::Text(v) => serde_json::Value::String(String::from_utf8_lossy(v).to_string()),
        ValueRef::Blob(v) => serde_json::Value::String(String::from_utf8_lossy(v).to_string()),
        ValueRef::Interval {
            months,
            days,
            nanos,
        } => {
            let mut obj = serde_json::Map::new();
            obj.insert("months".to_string(), serde_json::Value::from(months));
            obj.insert("days".to_string(), serde_json::Value::from(days));
            obj.insert(
                "nanos".to_string(),
                serde_json::Value::String(nanos.to_string()),
            );
            serde_json::Value::Object(obj)
        }
        ValueRef::List(_, _)
        | ValueRef::Enum(_, _)
        | ValueRef::Struct(_, _)
        | ValueRef::Array(_, _)
        | ValueRef::Map(_, _)
        | ValueRef::Union(_, _) => duckdb_value_to_json(&value.to_owned()),
    })
}
