use crate::db::drivers::first_sql_keyword;
use crate::sql::query_guard::{classify_statement, is_single_statement, StatementKind};

/// SQL 安全检查配置
pub struct SqlSafetyConfig {
    pub allow_writes: bool,
    pub allow_dangerous: bool,
    pub max_rows: usize,
}

impl SqlSafetyConfig {
    pub fn from_env() -> Self {
        Self {
            allow_writes: std::env::var("DBPAW_MCP_ALLOW_WRITES")
                .map(|v| v == "1")
                .unwrap_or(false),
            allow_dangerous: std::env::var("DBPAW_MCP_ALLOW_DANGEROUS")
                .map(|v| v == "1")
                .unwrap_or(false),
            max_rows: std::env::var("DBPAW_MCP_MAX_ROWS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(100),
        }
    }
}

/// SQL 安全检查结果
pub enum SqlSafetyCheck {
    /// 允许执行
    Allowed,
    /// 被拒绝，包含原因
    Rejected(String),
}

/// 执行 SQL 安全检查
pub fn check_sql_safety(sql: &str, config: &SqlSafetyConfig) -> SqlSafetyCheck {
    // Layer 1: 空检查
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return SqlSafetyCheck::Rejected("SQL query is empty".to_string());
    }

    // Layer 2: 单语句检查
    if !is_single_statement(trimmed) {
        return SqlSafetyCheck::Rejected(
            "Multiple statements are not allowed. Please execute one statement at a time."
                .to_string(),
        );
    }

    // 获取首关键字
    let keyword = match first_sql_keyword(trimmed) {
        Some(k) => k,
        None => return SqlSafetyCheck::Rejected("Could not parse SQL statement".to_string()),
    };

    // Layer 3: 危险关键字检查
    let statement_kind = classify_statement(trimmed);

    if !config.allow_dangerous && statement_kind == StatementKind::Dangerous {
        return SqlSafetyCheck::Rejected(format!(
            "Dangerous keyword '{}' is not allowed. Set DBPAW_MCP_ALLOW_DANGEROUS=1 to enable.",
            keyword
        ));
    }

    // Layer 4: 只读检查
    if !config.allow_writes {
        if statement_kind == StatementKind::Write {
            return SqlSafetyCheck::Rejected(format!(
                "Write operation '{}' is not allowed. Set DBPAW_MCP_ALLOW_WRITES=1 to enable.",
                keyword
            ));
        }

        // 对于非读关键字，也拒绝
        if !matches!(
            statement_kind,
            StatementKind::Select | StatementKind::ReadOnly
        ) {
            return SqlSafetyCheck::Rejected(format!(
                "Statement '{}' is not allowed in read-only mode. Set DBPAW_MCP_ALLOW_WRITES=1 to enable.",
                keyword
            ));
        }
    }

    // Layer 5: UPDATE/DELETE 必须有 WHERE
    if keyword == "UPDATE" || keyword == "DELETE" {
        let upper = trimmed.to_uppercase();
        if !upper.contains(" WHERE ") && !upper.ends_with(" WHERE") {
            return SqlSafetyCheck::Rejected(
                "UPDATE/DELETE without WHERE clause is not allowed for safety. Please add a WHERE clause."
                    .to_string(),
            );
        }
    }

    SqlSafetyCheck::Allowed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> SqlSafetyConfig {
        SqlSafetyConfig {
            allow_writes: false,
            allow_dangerous: false,
            max_rows: 100,
        }
    }

    fn test_config_writes() -> SqlSafetyConfig {
        SqlSafetyConfig {
            allow_writes: true,
            allow_dangerous: false,
            max_rows: 100,
        }
    }

    fn test_config_dangerous() -> SqlSafetyConfig {
        SqlSafetyConfig {
            allow_writes: true,
            allow_dangerous: true,
            max_rows: 100,
        }
    }

    #[test]
    fn test_empty_sql() {
        let config = test_config();
        assert!(matches!(
            check_sql_safety("", &config),
            SqlSafetyCheck::Rejected(_)
        ));
        assert!(matches!(
            check_sql_safety("   ", &config),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_multiple_statements() {
        let config = test_config();
        assert!(matches!(
            check_sql_safety("SELECT 1; SELECT 2", &config),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_select_allowed() {
        let config = test_config();
        assert!(matches!(
            check_sql_safety("SELECT * FROM users", &config),
            SqlSafetyCheck::Allowed
        ));
    }

    #[test]
    fn test_insert_blocked() {
        let config = test_config();
        assert!(matches!(
            check_sql_safety("INSERT INTO users VALUES (1)", &config),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_insert_allowed_with_writes() {
        let config = test_config_writes();
        assert!(matches!(
            check_sql_safety("INSERT INTO users VALUES (1)", &config),
            SqlSafetyCheck::Allowed
        ));
    }

    #[test]
    fn test_drop_blocked() {
        let config = test_config_writes();
        assert!(matches!(
            check_sql_safety("DROP TABLE users", &config),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_drop_allowed_with_dangerous() {
        let config = test_config_dangerous();
        assert!(matches!(
            check_sql_safety("DROP TABLE users", &config),
            SqlSafetyCheck::Allowed
        ));
    }

    #[test]
    fn test_update_without_where() {
        let config = test_config_writes();
        assert!(matches!(
            check_sql_safety("UPDATE users SET name = 'test'", &config),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_update_with_where() {
        let config = test_config_writes();
        assert!(matches!(
            check_sql_safety("UPDATE users SET name = 'test' WHERE id = 1", &config),
            SqlSafetyCheck::Allowed
        ));
    }

    #[test]
    fn test_with_update_blocked_in_read_only_mode() {
        let config = test_config();
        assert!(matches!(
            check_sql_safety(
                "WITH c AS (SELECT 1) UPDATE users SET name = 'test' WHERE id = 1",
                &config
            ),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_delete_without_where() {
        let config = test_config_writes();
        assert!(matches!(
            check_sql_safety("DELETE FROM users", &config),
            SqlSafetyCheck::Rejected(_)
        ));
    }

    #[test]
    fn test_delete_with_where() {
        let config = test_config_writes();
        assert!(matches!(
            check_sql_safety("DELETE FROM users WHERE id = 1", &config),
            SqlSafetyCheck::Allowed
        ));
    }
}
