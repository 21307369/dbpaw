pub mod cassandra;
pub mod clickhouse;
#[cfg(any(
    target_os = "linux",
    target_os = "windows",
    all(target_os = "macos", target_arch = "x86_64")
))]
pub mod db2;
pub mod duckdb;
pub mod mongodb;
pub mod mssql;
pub mod mysql;
pub mod oracle;
pub mod postgres;
pub mod sqlite;

mod registry;
mod traits;

pub(crate) use crate::db::errors::connection::conn_failed_error;
pub(crate) use crate::db::sql::format::{
    format_datetime_utc, format_naive_date, format_naive_datetime, format_naive_time,
};
pub(crate) use crate::db::sql::splitter::{
    first_sql_keyword, normalize_quotes, skip_backtick_quote, skip_block_comment,
    skip_dollar_quote, skip_double_quote, skip_line_comment, skip_single_quote,
    split_sql_statements, strip_trailing_statement_terminator,
};
pub use registry::{connect, is_mysql_family_driver};
pub use traits::{
    DatabaseDriver, DriverCapabilities, DriverResult, EventDriver, ForeignKeyDriver,
    PackageDriver, RoutineDriver, SequenceDriver, SynonymDriver, TypeDriver,
};
