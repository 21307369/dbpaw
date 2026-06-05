use serde_json::Value;

pub(super) fn sql_value(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(v) => {
            if *v {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        _ => format!("'{}'", value.to_string().replace('\'', "''")),
    }
}

pub(super) fn quote_ident(name: &str, driver: &str) -> String {
    if driver.eq_ignore_ascii_case("mysql")
        || driver.eq_ignore_ascii_case("tidb")
        || driver.eq_ignore_ascii_case("mariadb")
        || driver.eq_ignore_ascii_case("clickhouse")
    {
        format!("`{}`", name.replace('`', "``"))
    } else if driver.eq_ignore_ascii_case("mssql") {
        format!("[{}]", name.replace(']', "]]"))
    } else {
        format!("\"{}\"", name.replace('"', "\"\""))
    }
}

pub(super) fn quote_target(schema: Option<&str>, table: &str, driver: &str) -> String {
    let normalized_schema = schema
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(|s| {
            if driver.eq_ignore_ascii_case("duckdb")
                && (s.eq_ignore_ascii_case("main") || s.eq_ignore_ascii_case("public"))
            {
                None
            } else {
                Some(s)
            }
        });

    match normalized_schema {
        Some(schema_name) => format!(
            "{}.{}",
            quote_ident(schema_name, driver),
            quote_ident(table, driver)
        ),
        None => quote_ident(table, driver),
    }
}
