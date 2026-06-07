#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisRawResult {
    pub output: String,
}

fn tokenize_command(input: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();
    loop {
        while chars.peek().map_or(false, |c| c.is_whitespace()) {
            chars.next();
        }
        match chars.peek() {
            None => break,
            Some('"') => {
                chars.next();
                let mut tok = String::new();
                loop {
                    match chars.next() {
                        None => return Err("Unterminated double quote in command".to_string()),
                        Some('"') => break,
                        Some('\\') => match chars.next() {
                            None => return Err("Unexpected end after backslash".to_string()),
                            Some(c) => tok.push(c),
                        },
                        Some(c) => tok.push(c),
                    }
                }
                tokens.push(tok);
            }
            Some('\'') => {
                chars.next();
                let mut tok = String::new();
                loop {
                    match chars.next() {
                        None => return Err("Unterminated single quote in command".to_string()),
                        Some('\'') => break,
                        Some(c) => tok.push(c),
                    }
                }
                tokens.push(tok);
            }
            Some(_) => {
                let mut tok = String::new();
                while chars.peek().map_or(false, |c| !c.is_whitespace()) {
                    tok.push(chars.next().unwrap());
                }
                tokens.push(tok);
            }
        }
    }
    Ok(tokens)
}

fn format_redis_value(value: Value) -> String {
    match value {
        Value::Nil => "(nil)".to_string(),
        Value::Okay => "OK".to_string(),
        Value::Int(n) => format!("(integer) {n}"),
        Value::BulkString(bytes) => match String::from_utf8(bytes) {
            Ok(s) => format!("\"{s}\""),
            Err(e) => format!("(binary {} bytes)", e.into_bytes().len()),
        },
        Value::SimpleString(s) => s,
        Value::Array(items) => {
            if items.is_empty() {
                return "(empty array)".to_string();
            }
            items
                .into_iter()
                .enumerate()
                .map(|(i, v)| format!("{}) {}", i + 1, format_redis_value(v)))
                .collect::<Vec<_>>()
                .join("\n")
        }
        Value::Map(pairs) => {
            if pairs.is_empty() {
                return "(empty map)".to_string();
            }
            pairs
                .into_iter()
                .enumerate()
                .flat_map(|(i, (k, v))| {
                    [
                        format!("{}) {}", i * 2 + 1, format_redis_value(k)),
                        format!("{}) {}", i * 2 + 2, format_redis_value(v)),
                    ]
                })
                .collect::<Vec<_>>()
                .join("\n")
        }
        Value::Set(items) => {
            if items.is_empty() {
                return "(empty set)".to_string();
            }
            items
                .into_iter()
                .enumerate()
                .map(|(i, v)| format!("{}) {}", i + 1, format_redis_value(v)))
                .collect::<Vec<_>>()
                .join("\n")
        }
        Value::Double(f) => format!("(double) {f}"),
        Value::Boolean(b) => format!("(boolean) {b}"),
        Value::VerbatimString { text, .. } => format!("\"{text}\""),
        Value::Attribute { data, .. } => format_redis_value(*data),
        Value::Push { data, .. } => {
            if data.is_empty() {
                return "(empty push)".to_string();
            }
            data.into_iter()
                .enumerate()
                .map(|(i, v)| format!("{}) {}", i + 1, format_redis_value(v)))
                .collect::<Vec<_>>()
                .join("\n")
        }
        Value::BigNumber(n) => format!("(big number) {n}"),
        Value::ServerError(e) => format!("(error) {:?}", e),
    }
}
