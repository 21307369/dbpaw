use crate::error::AppError;
use std::fs;
use std::path::Path;

pub(super) const MAX_IMPORT_FILE_SIZE_BYTES: u64 = 20 * 1024 * 1024;
pub(super) const MAX_IMPORT_STATEMENTS: usize = 50_000;

#[derive(Debug, Clone)]
pub(super) struct ImportExecutionUnit {
    pub(super) sql: String,
    pub(super) batch_index: usize,
    pub(super) preview: String,
}

#[derive(Debug, Clone)]
pub(super) struct PreparedImportPlan {
    pub(super) units: Vec<ImportExecutionUnit>,
    pub(super) script_managed_transaction: bool,
}

pub(super) fn should_use_outer_import_transaction(
    normalized_driver: &str,
    import_plan: &PreparedImportPlan,
) -> bool {
    if import_plan.script_managed_transaction {
        return false;
    }

    // MSSQL imports are executed batch-by-batch through pooled connections.
    // Wrapping those batches in a separate outer transaction is not reliable in
    // the current driver model because transaction state does not persist across
    // independent execute_query calls.
    normalized_driver != "mssql"
}

pub(super) fn import_transaction_sql<'a>(
    normalized_driver: &'a str,
    original_driver: &str,
) -> Result<(&'a str, &'a str, &'a str), String> {
    match normalized_driver {
        "mysql" | "mariadb" | "tidb" => Ok(("START TRANSACTION", "COMMIT", "ROLLBACK")),
        "starrocks" | "doris" => Err(AppError::unsupported(format!(
            "Driver {} does not support transactional SQL import in this flow",
            original_driver
        ))),
        "postgres" | "sqlite" | "duckdb" => Ok(("BEGIN", "COMMIT", "ROLLBACK")),
        "mssql" => Ok((
            "BEGIN TRANSACTION",
            "COMMIT TRANSACTION",
            "ROLLBACK TRANSACTION",
        )),
        "oracle" => Ok(("SELECT 1 FROM DUAL", "COMMIT", "ROLLBACK")),
        "db2" => Ok(("BEGIN", "COMMIT", "ROLLBACK")),
        "clickhouse" => {
            Err(AppError::unsupported("Driver clickhouse is read-only in this import flow"))
        }
        _ => Err(AppError::unsupported(format!(
            "Driver {} is not supported for SQL import",
            original_driver
        ))),
    }
}

pub(super) fn normalize_driver_name(driver: &str) -> String {
    let normalized = driver.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "postgresql" | "pgsql" => "postgres".to_string(),
        _ => normalized,
    }
}

pub(super) fn prepare_import_plan(
    sql: &str,
    normalized_driver: &str,
) -> Result<PreparedImportPlan, AppError> {
    let units = if normalized_driver == "mssql" {
        let batches = parse_mssql_batches(sql)?;
        batches
            .into_iter()
            .enumerate()
            .map(|(idx, batch)| ImportExecutionUnit {
                preview: build_statement_preview(&batch),
                sql: batch,
                batch_index: idx + 1,
            })
            .collect::<Vec<_>>()
    } else {
        parse_sql_statements(sql, normalized_driver)?
            .into_iter()
            .enumerate()
            .map(|(idx, statement)| ImportExecutionUnit {
                preview: build_statement_preview(&statement),
                sql: statement,
                batch_index: idx + 1,
            })
            .collect::<Vec<_>>()
    };

    let script_managed_transaction = units
        .iter()
        .any(|unit| statement_controls_transaction(&unit.sql, normalized_driver));

    Ok(PreparedImportPlan {
        units,
        script_managed_transaction,
    })
}

fn build_statement_preview(statement: &str) -> String {
    let compact = statement.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = String::new();
    for (idx, ch) in compact.chars().enumerate() {
        if idx >= 160 {
            preview.push_str("...");
            break;
        }
        preview.push(ch);
    }
    if preview.is_empty() {
        "<empty>".to_string()
    } else {
        preview
    }
}

fn leading_sql_tokens(sql: &str, max_tokens: usize) -> Vec<String> {
    let chars: Vec<char> = sql.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0usize;

    while i < chars.len() && tokens.len() < max_tokens {
        let ch = chars[i];
        let next = chars.get(i + 1).copied();

        if ch.is_whitespace() || ch == ';' {
            i += 1;
            continue;
        }

        if ch == '-' && next == Some('-') {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }

        if ch == '/' && next == Some('*') {
            i += 2;
            while i + 1 < chars.len() && !(chars[i] == '*' && chars[i + 1] == '/') {
                i += 1;
            }
            if i + 1 < chars.len() {
                i += 2;
            }
            continue;
        }

        if ch.is_ascii_alphabetic() {
            let start = i;
            i += 1;
            while i < chars.len() && (chars[i].is_ascii_alphabetic() || chars[i] == '_') {
                i += 1;
            }
            tokens.push(
                chars[start..i]
                    .iter()
                    .collect::<String>()
                    .to_ascii_lowercase(),
            );
            continue;
        }

        i += 1;
    }

    tokens
}

pub(super) fn statement_controls_transaction(statement: &str, normalized_driver: &str) -> bool {
    let tokens = leading_sql_tokens(statement, 2);
    if tokens.is_empty() {
        return false;
    }

    let first = tokens[0].as_str();
    let second = tokens.get(1).map(|s| s.as_str()).unwrap_or("");

    match first {
        "commit" | "rollback" => true,
        "start" => second == "transaction",
        "begin" => {
            if normalized_driver == "mssql" {
                second == "transaction" || second == "tran"
            } else {
                true
            }
        }
        _ => false,
    }
}

fn parse_mssql_go_line_count(line: &str) -> Option<usize> {
    let trimmed = line.trim();
    let prefix = trimmed.get(..2)?;
    if !prefix.eq_ignore_ascii_case("go") {
        return None;
    }
    let rest = trimmed[2..].trim();
    if rest.is_empty() {
        return Some(1);
    }
    if rest.chars().all(|ch| ch.is_ascii_digit()) {
        let count = rest.parse::<usize>().ok()?;
        if count > 0 {
            return Some(count);
        }
    }
    None
}

fn update_mssql_line_state(state: &mut SqlScanState, line: &str) {
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0usize;

    while i < chars.len() {
        match state {
            SqlScanState::Normal => {
                let ch = chars[i];
                let next = chars.get(i + 1).copied();
                if ch == '-' && next == Some('-') {
                    *state = SqlScanState::LineComment;
                    break;
                }
                if ch == '/' && next == Some('*') {
                    *state = SqlScanState::BlockComment;
                    i += 2;
                    continue;
                }
                if ch == '\'' {
                    *state = SqlScanState::SingleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '"' {
                    *state = SqlScanState::DoubleQuoted;
                    i += 1;
                    continue;
                }
                i += 1;
            }
            SqlScanState::SingleQuoted => {
                if chars[i] == '\'' {
                    if chars.get(i + 1) == Some(&'\'') {
                        i += 2;
                        continue;
                    }
                    *state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::DoubleQuoted => {
                if chars[i] == '"' {
                    if chars.get(i + 1) == Some(&'"') {
                        i += 2;
                        continue;
                    }
                    *state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BlockComment => {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    *state = SqlScanState::Normal;
                    i += 2;
                    continue;
                }
                i += 1;
            }
            SqlScanState::LineComment => {
                break;
            }
            SqlScanState::BacktickQuoted | SqlScanState::DollarQuoted(_) => {
                *state = SqlScanState::Normal;
            }
        }
    }

    if matches!(state, SqlScanState::LineComment) {
        *state = SqlScanState::Normal;
    }
}

pub(super) fn parse_mssql_batches(sql: &str) -> Result<Vec<String>, AppError> {
    let mut out = Vec::new();
    let mut current = String::new();
    let mut state = SqlScanState::Normal;

    for line in sql.split_inclusive('\n') {
        if matches!(state, SqlScanState::Normal) {
            let plain_line = line.trim_end_matches(|ch| ch == '\r' || ch == '\n');
            if let Some(go_count) = parse_mssql_go_line_count(plain_line) {
                let statement = current.trim();
                if !statement.is_empty() {
                    for _ in 0..go_count {
                        out.push(statement);
                    }
                }
                current.clear();
                continue;
            }
        }

        update_mssql_line_state(&mut state, line);
        current.push_str(line);
    }

    match state {
        SqlScanState::Normal | SqlScanState::LineComment => {}
        SqlScanState::BlockComment => {
            return Err(AppError::internal("Unterminated block comment in SQL file"));
        }
        SqlScanState::SingleQuoted
        | SqlScanState::DoubleQuoted
        | SqlScanState::BacktickQuoted
        | SqlScanState::DollarQuoted(_) => {
            return Err(AppError::internal("Unterminated string literal in SQL file"));
        }
    }

    let tail = current.trim();
    if !tail.is_empty() {
        out.push(tail);
    }
    Ok(out)
}

pub(super) fn validate_import_path(path: &Path) -> Result<(), AppError> {
    if path.as_os_str().is_empty() {
        return Err(AppError::validation("Invalid import path"));
    }
    if path.is_dir() {
        return Err(AppError::validation("Import path points to a directory"));
    }
    if !path.exists() {
        return Err(AppError::validation("Import file does not exist"));
    }
    let Some(ext) = path.extension().and_then(|v| v.to_str()) else {
        return Err(AppError::validation("Import file must use .sql extension"));
    };
    if !ext.eq_ignore_ascii_case("sql") {
        return Err(AppError::validation("Import file must use .sql extension"));
    }
    Ok(())
}

pub(super) fn validate_import_file_size(path: &Path) -> Result<(), AppError> {
    let metadata = fs::metadata(path)
        .map_err(|e| AppError::internal(format!("failed to read file metadata: {e}")))?;
    if metadata.len() > MAX_IMPORT_FILE_SIZE_BYTES {
        return Err(AppError::validation(format!(
            "file is too large (max {} bytes)",
            MAX_IMPORT_FILE_SIZE_BYTES
        )));
    }
    Ok(())
}

#[derive(Debug, Clone)]
enum SqlScanState {
    Normal,
    SingleQuoted,
    DoubleQuoted,
    BacktickQuoted,
    DollarQuoted(String),
    LineComment,
    BlockComment,
}

fn starts_with_chars(chars: &[char], idx: usize, needle: &[char]) -> bool {
    if idx + needle.len() > chars.len() {
        return false;
    }
    for (offset, ch) in needle.iter().enumerate() {
        if chars[idx + offset] != *ch {
            return false;
        }
    }
    true
}

fn starts_with_chars_ignore_ascii_case(chars: &[char], idx: usize, needle: &str) -> bool {
    let mut needle_chars = needle.chars();
    let needle_len = needle.len();
    if idx + needle_len > chars.len() {
        return false;
    }
    for offset in 0..needle_len {
        let needle_ch = match needle_chars.next() {
            Some(c) => c,
            None => return false,
        };
        if !chars[idx + offset].eq_ignore_ascii_case(&needle_ch) {
            return false;
        }
    }
    true
}

fn line_start_index(chars: &[char], idx: usize) -> usize {
    let mut start = idx;
    while start > 0 && chars[start - 1] != '\n' {
        start -= 1;
    }
    start
}

fn parse_mysql_delimiter_command(chars: &[char], idx: usize) -> Option<(String, usize)> {
    let line_start = line_start_index(chars, idx);
    let mut cursor = line_start;
    while cursor < chars.len() && matches!(chars[cursor], ' ' | '\t' | '\r') {
        cursor += 1;
    }
    if cursor != idx {
        return None;
    }

    if !starts_with_chars_ignore_ascii_case(chars, cursor, "DELIMITER") {
        return None;
    }

    let mut after_keyword = cursor + "DELIMITER".len();
    if after_keyword < chars.len() && chars[after_keyword] != ' ' && chars[after_keyword] != '\t' {
        return None;
    }
    while after_keyword < chars.len() && matches!(chars[after_keyword], ' ' | '\t') {
        after_keyword += 1;
    }
    if after_keyword >= chars.len() || matches!(chars[after_keyword], '\n' | '\r') {
        return None;
    }

    let mut line_end = after_keyword;
    while line_end < chars.len() && !matches!(chars[line_end], '\n' | '\r') {
        line_end += 1;
    }

    let delimiter: String = chars[after_keyword..line_end]
        .iter()
        .collect::<String>()
        .trim()
        .to_string();
    if delimiter.is_empty() {
        return None;
    }

    let mut next_idx = line_end;
    if next_idx < chars.len() && chars[next_idx] == '\r' {
        next_idx += 1;
    }
    if next_idx < chars.len() && chars[next_idx] == '\n' {
        next_idx += 1;
    }

    Some((delimiter, next_idx))
}

fn sqlite_trigger_state(sql: &str) -> (bool, bool) {
    let chars: Vec<char> = sql.chars().collect();
    let mut state = SqlScanState::Normal;
    let mut i = 0usize;
    let mut tokens = Vec::new();
    let mut trigger_begin_seen = false;
    let mut trigger_block_depth = 0i32;
    let mut case_depth = 0i32;
    let mut last_word: Option<String> = None;

    while i < chars.len() {
        match &state {
            SqlScanState::Normal => {
                let ch = chars[i];
                let next = chars.get(i + 1).copied();
                if ch == '-' && next == Some('-') {
                    state = SqlScanState::LineComment;
                    i += 2;
                    continue;
                }
                if ch == '/' && next == Some('*') {
                    state = SqlScanState::BlockComment;
                    i += 2;
                    continue;
                }
                if ch == '\'' {
                    state = SqlScanState::SingleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '"' {
                    state = SqlScanState::DoubleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '`' {
                    state = SqlScanState::BacktickQuoted;
                    i += 1;
                    continue;
                }
                if ch.is_ascii_alphabetic() || ch == '_' {
                    let start = i;
                    i += 1;
                    while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                        i += 1;
                    }
                    let token = chars[start..i]
                        .iter()
                        .collect::<String>()
                        .to_ascii_lowercase();
                    tokens.push(token.clone());

                    if trigger_begin_seen {
                        match token.as_str() {
                            "case" => case_depth += 1,
                            "begin" => trigger_block_depth += 1,
                            "end" => {
                                if case_depth > 0 {
                                    case_depth -= 1;
                                } else if trigger_block_depth > 0 {
                                    trigger_block_depth -= 1;
                                }
                            }
                            _ => {}
                        }
                    } else if token == "begin" {
                        let is_create_trigger = matches!(
                            tokens.as_slice(),
                            [first, second, ..] if first == "create"
                                && (second == "trigger"
                                    || ((second == "temp" || second == "temporary")
                                        && tokens.get(2).map(String::as_str) == Some("trigger")))
                        );
                        if is_create_trigger {
                            trigger_begin_seen = true;
                            trigger_block_depth = 1;
                        }
                    }

                    last_word = Some(token);
                    continue;
                }
                i += 1;
            }
            SqlScanState::SingleQuoted => {
                if chars[i] == '\\' && chars.get(i + 1).is_some() {
                    i += 2;
                    continue;
                }
                if chars[i] == '\'' {
                    if chars.get(i + 1) == Some(&'\'') {
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::DoubleQuoted => {
                if chars[i] == '"' {
                    if chars.get(i + 1) == Some(&'"') {
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BacktickQuoted => {
                if chars[i] == '`' {
                    if chars.get(i + 1) == Some(&'`') {
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::LineComment => {
                if chars[i] == '\n' {
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BlockComment => {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    state = SqlScanState::Normal;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            SqlScanState::DollarQuoted(_) => {
                state = SqlScanState::Normal;
            }
        }
    }

    let is_trigger = trigger_begin_seen;
    let ready_to_terminate = is_trigger
        && trigger_block_depth == 0
        && case_depth == 0
        && last_word.as_deref() == Some("end");
    (is_trigger, ready_to_terminate)
}

fn oracle_plsql_state(sql: &str) -> (bool, bool) {
    let chars: Vec<char> = sql.chars().collect();
    let mut state = SqlScanState::Normal;
    let mut i = 0usize;
    let mut tokens = Vec::new();
    let mut block_depth = 0i32;
    let mut case_depth = 0i32;
    let mut last_word: Option<String> = None;
    let mut is_oracle_block = false;

    while i < chars.len() {
        match &state {
            SqlScanState::Normal => {
                let ch = chars[i];
                let next = chars.get(i + 1).copied();
                if ch == '-' && next == Some('-') {
                    state = SqlScanState::LineComment;
                    i += 2;
                    continue;
                }
                if ch == '/' && next == Some('*') {
                    state = SqlScanState::BlockComment;
                    i += 2;
                    continue;
                }
                if ch == '\'' {
                    state = SqlScanState::SingleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '"' {
                    state = SqlScanState::DoubleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '`' {
                    state = SqlScanState::BacktickQuoted;
                    i += 1;
                    continue;
                }
                if ch.is_ascii_alphabetic() || ch == '_' {
                    let start = i;
                    i += 1;
                    while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '_') {
                        i += 1;
                    }
                    let token = chars[start..i]
                        .iter()
                        .collect::<String>()
                        .to_ascii_lowercase();
                    tokens.push(token.clone());

                    if !is_oracle_block {
                        let second = tokens.get(1).map(String::as_str);
                        let third = tokens.get(2).map(String::as_str);
                        let fourth = tokens.get(3).map(String::as_str);
                        is_oracle_block = matches!(
                            tokens.first().map(String::as_str),
                            Some("declare") | Some("begin")
                        ) || (tokens.first().map(String::as_str)
                            == Some("create")
                            && second == Some("or")
                            && third == Some("replace")
                            && matches!(
                                fourth,
                                Some("function")
                                    | Some("procedure")
                                    | Some("trigger")
                                    | Some("package")
                                    | Some("type")
                            ));
                    }

                    if is_oracle_block {
                        match token.as_str() {
                            "case" => case_depth += 1,
                            "begin" => block_depth += 1,
                            "end" => {
                                if case_depth > 0 {
                                    case_depth -= 1;
                                } else if block_depth > 0 {
                                    block_depth -= 1;
                                }
                            }
                            _ => {}
                        }
                    }

                    last_word = Some(token);
                    continue;
                }
                i += 1;
            }
            SqlScanState::SingleQuoted => {
                if chars[i] == '\\' && chars.get(i + 1).is_some() {
                    i += 2;
                    continue;
                }
                if chars[i] == '\'' {
                    if chars.get(i + 1) == Some(&'\'') {
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::DoubleQuoted => {
                if chars[i] == '"' {
                    if chars.get(i + 1) == Some(&'"') {
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BacktickQuoted => {
                if chars[i] == '`' {
                    if chars.get(i + 1) == Some(&'`') {
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::LineComment => {
                if chars[i] == '\n' {
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BlockComment => {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    state = SqlScanState::Normal;
                    i += 2;
                } else {
                    i += 1;
                }
            }
            SqlScanState::DollarQuoted(_) => {
                state = SqlScanState::Normal;
            }
        }
    }

    let ready_to_terminate = is_oracle_block
        && block_depth == 0
        && case_depth == 0
        && last_word.as_deref() == Some("end");
    (is_oracle_block, ready_to_terminate)
}

fn parse_oracle_slash_terminator(chars: &[char], idx: usize) -> Option<usize> {
    let line_start = line_start_index(chars, idx);
    let mut cursor = line_start;
    while cursor < chars.len() && matches!(chars[cursor], ' ' | '\t' | '\r') {
        cursor += 1;
    }
    if cursor != idx || chars.get(idx) != Some(&'/') {
        return None;
    }

    let mut line_end = idx + 1;
    while line_end < chars.len() && !matches!(chars[line_end], '\n' | '\r') {
        if !matches!(chars[line_end], ' ' | '\t') {
            return None;
        }
        line_end += 1;
    }

    let mut next_idx = line_end;
    if next_idx < chars.len() && chars[next_idx] == '\r' {
        next_idx += 1;
    }
    if next_idx < chars.len() && chars[next_idx] == '\n' {
        next_idx += 1;
    }

    Some(next_idx)
}

pub(super) fn parse_sql_statements(sql: &str, driver: &str) -> Result<Vec<String>, AppError> {
    let mysql_style_hash_comment = matches!(driver, "mysql" | "mariadb" | "tidb");
    let mysql_style_delimiter = mysql_style_hash_comment;
    let sqlite_style_trigger = driver == "sqlite";
    let oracle_style_block = driver == "oracle";
    let chars: Vec<char> = sql.chars().collect();
    let mut out = Vec::new();
    let mut current = String::new();
    let mut state = SqlScanState::Normal;
    let mut delimiter = ";".to_string();
    let mut delimiter_chars: Vec<char> = vec![';'];
    let mut i = 0usize;

    while i < chars.len() {
        match &state {
            SqlScanState::Normal => {
                if mysql_style_delimiter {
                    if let Some((next_delimiter, next_idx)) =
                        parse_mysql_delimiter_command(&chars, i)
                    {
                        delimiter = next_delimiter;
                        delimiter_chars = delimiter.chars().collect();
                        i = next_idx;
                        continue;
                    }
                }
                if oracle_style_block {
                    if let Some(next_idx) = parse_oracle_slash_terminator(&chars, i) {
                        let (is_block, ready_to_terminate) = oracle_plsql_state(current.trim());
                        if is_block && ready_to_terminate {
                            let statement = current.trim();
                            if !statement.is_empty() {
                                out.push(statement);
                            }
                            current.clear();
                            i = next_idx;
                            continue;
                        }
                    }
                }

                let ch = chars[i];
                let next = chars.get(i + 1).copied();

                if starts_with_chars(&chars, i, &delimiter_chars) {
                    if sqlite_style_trigger && delimiter == ";" {
                        let (is_trigger, ready_to_terminate) = sqlite_trigger_state(current.trim());
                        if is_trigger && !ready_to_terminate {
                            current.push(ch);
                            i += delimiter_chars.len();
                            continue;
                        }
                    }
                    if oracle_style_block && delimiter == ";" {
                        let (is_block, _) = oracle_plsql_state(current.trim());
                        if is_block {
                            current.push(ch);
                            i += delimiter_chars.len();
                            continue;
                        }
                    }
                    let statement = current.trim();
                    if !statement.is_empty() {
                        out.push(statement);
                    }
                    current.clear();
                    i += delimiter_chars.len();
                    continue;
                }

                if ch == '-' && next == Some('-') {
                    state = SqlScanState::LineComment;
                    i += 2;
                    continue;
                }
                if mysql_style_hash_comment && ch == '#' {
                    state = SqlScanState::LineComment;
                    i += 1;
                    continue;
                }
                if ch == '/' && next == Some('*') {
                    state = SqlScanState::BlockComment;
                    i += 2;
                    continue;
                }
                if ch == '\'' {
                    current.push(ch);
                    state = SqlScanState::SingleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '"' {
                    current.push(ch);
                    state = SqlScanState::DoubleQuoted;
                    i += 1;
                    continue;
                }
                if ch == '`' {
                    current.push(ch);
                    state = SqlScanState::BacktickQuoted;
                    i += 1;
                    continue;
                }
                if ch == '$' {
                    if let Some((tag, end_idx)) = parse_dollar_quote_tag(&chars, i) {
                        current.push_str(&tag);
                        state = SqlScanState::DollarQuoted(tag);
                        i = end_idx + 1;
                        continue;
                    }
                }
                current.push(ch);
                i += 1;
            }
            SqlScanState::SingleQuoted => {
                let ch = chars[i];
                current.push(ch);
                if ch == '\\' {
                    if let Some(next) = chars.get(i + 1) {
                        current.push(*next);
                        i += 2;
                        continue;
                    }
                }
                if ch == '\'' {
                    if chars.get(i + 1) == Some(&'\'') {
                        current.push('\'');
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::DoubleQuoted => {
                let ch = chars[i];
                current.push(ch);
                if ch == '"' {
                    if chars.get(i + 1) == Some(&'"') {
                        current.push('"');
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BacktickQuoted => {
                let ch = chars[i];
                current.push(ch);
                if ch == '`' {
                    if chars.get(i + 1) == Some(&'`') {
                        current.push('`');
                        i += 2;
                        continue;
                    }
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::DollarQuoted(tag) => {
                if starts_with_tag(&chars, i, tag) {
                    current.push_str(tag);
                    i += tag.chars().count();
                    state = SqlScanState::Normal;
                    continue;
                }
                current.push(chars[i]);
                i += 1;
            }
            SqlScanState::LineComment => {
                if chars[i] == '\n' {
                    current.push('\n');
                    state = SqlScanState::Normal;
                }
                i += 1;
            }
            SqlScanState::BlockComment => {
                if chars[i] == '*' && chars.get(i + 1) == Some(&'/') {
                    state = SqlScanState::Normal;
                    i += 2;
                } else {
                    i += 1;
                }
            }
        }
    }

    match state {
        SqlScanState::Normal | SqlScanState::LineComment => {}
        SqlScanState::BlockComment => {
            return Err(AppError::internal("Unterminated block comment in SQL file"));
        }
        SqlScanState::SingleQuoted
        | SqlScanState::DoubleQuoted
        | SqlScanState::BacktickQuoted
        | SqlScanState::DollarQuoted(_) => {
            return Err(AppError::internal("Unterminated string literal in SQL file"));
        }
    }

    let tail = current.trim();
    if !tail.is_empty() {
        out.push(tail);
    }
    Ok(out)
}

fn parse_dollar_quote_tag(chars: &[char], start: usize) -> Option<(String, usize)> {
    if chars.get(start) != Some(&'$') {
        return None;
    }
    let mut idx = start + 1;
    while idx < chars.len() && (chars[idx].is_ascii_alphanumeric() || chars[idx] == '_') {
        idx += 1;
    }
    if idx < chars.len() && chars[idx] == '$' {
        let tag: String = chars[start..=idx].iter().collect();
        return Some((tag, idx));
    }
    None
}

fn starts_with_tag(chars: &[char], idx: usize, tag: &str) -> bool {
    let tag_chars: Vec<char> = tag.chars().collect();
    if idx + tag_chars.len() > chars.len() {
        return false;
    }
    for (offset, ch) in tag_chars.iter().enumerate() {
        if chars[idx + offset] != *ch {
            return false;
        }
    }
    true
}

pub(super) fn truncate_error_message(message: &str) -> String {
    const MAX_CHARS: usize = 500;
    let mut out = String::new();
    for (idx, ch) in message.chars().enumerate() {
        if idx >= MAX_CHARS {
            out.push_str("...");
            break;
        }
        out.push(ch);
    }
    out
}
