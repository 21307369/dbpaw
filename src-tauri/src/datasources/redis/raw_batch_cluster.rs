pub async fn execute_raw(
    conn: &mut RedisConnection,
    command: String,
) -> Result<RedisRawResult, String> {
    let tokens = tokenize_command(&command)?;
    if tokens.is_empty() {
        return Err("[VALIDATION_ERROR] Command cannot be empty".to_string());
    }
    let mut cmd = redis::cmd(&tokens[0]);
    for arg in &tokens[1..] {
        cmd.arg(arg.as_str());
    }
    let value: Value = conn.query(cmd).await?;
    Ok(RedisRawResult {
        output: format_redis_value(value),
    })
}

// ── Batch operations ────────────────────────────────────────────────────────

pub async fn batch_key_ops(
    conn: &mut RedisConnection,
    operations: Vec<RedisBatchKeyOp>,
) -> Result<Vec<RedisBatchKeyOpResult>, String> {
    if operations.is_empty() {
        return Ok(Vec::new());
    }

    let mut results = Vec::with_capacity(operations.len());

    // Build a pipeline for the batch
    let mut pipe = redis::pipe();
    for op in &operations {
        match op.op.as_str() {
            "del" => {
                pipe.cmd("DEL").arg(&op.key);
            }
            "unlink" => {
                pipe.cmd("UNLINK").arg(&op.key);
            }
            "expire" => {
                let ttl = op.ttl_seconds.unwrap_or(0);
                pipe.cmd("EXPIRE").arg(&op.key).arg(ttl);
            }
            "persist" => {
                pipe.cmd("PERSIST").arg(&op.key);
            }
            _ => {
                return Err(format!(
                    "[VALIDATION_ERROR] Unknown batch operation: {}",
                    op.op
                ));
            }
        }
    }

    let raw_values: Vec<Value> = conn.pipe_query(&mut pipe).await?;

    for (i, val) in raw_values.into_iter().enumerate() {
        let op = &operations[i];
        let (affected, success) = match val {
            Value::Int(n) => (n, true),
            Value::Nil => (0, false),
            _ => (0, false),
        };
        results.push(RedisBatchKeyOpResult {
            key: op.key.clone(),
            op: op.op.clone(),
            success,
            affected,
        });
    }

    Ok(results)
}

pub async fn mget_keys(
    conn: &mut RedisConnection,
    keys: Vec<String>,
) -> Result<Vec<RedisMgetEntry>, String> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }

    let mut cmd = redis::cmd("MGET");
    for k in &keys {
        cmd.arg(k);
    }
    let raw_values: Vec<Value> = conn.query(cmd).await?;

    let results: Vec<RedisMgetEntry> = keys
        .into_iter()
        .zip(raw_values.into_iter())
        .map(|(key, val)| match val {
            Value::BulkString(bytes) => {
                let value = String::from_utf8(bytes).unwrap_or_else(|e| {
                    // Binary data — represent as lossy UTF-8
                    String::from_utf8_lossy(e.as_bytes()).into_owned()
                });
                RedisMgetEntry {
                    key,
                    value: Some(value),
                    exists: true,
                }
            }
            Value::Nil => RedisMgetEntry {
                key,
                value: None,
                exists: false,
            },
            other => RedisMgetEntry {
                key,
                value: Some(format_redis_value(other)),
                exists: true,
            },
        })
        .collect();

    Ok(results)
}

pub async fn mset_keys(
    conn: &mut RedisConnection,
    entries: Vec<(String, String)>,
) -> Result<RedisMutationResult, String> {
    if entries.is_empty() {
        return Ok(RedisMutationResult {
            success: true,
            affected: 0,
        });
    }

    let mut cmd = redis::cmd("MSET");
    for (k, v) in &entries {
        cmd.arg(k).arg(v);
    }
    let _: String = conn.query(cmd).await?;

    Ok(RedisMutationResult {
        success: true,
        affected: entries.len() as i64,
    })
}

pub async fn cluster_info(conn: &mut RedisConnection) -> Result<RedisClusterInfo, String> {
    let mut pipe = redis::pipe();
    pipe.cmd("CLUSTER").arg("INFO");
    pipe.cmd("CLUSTER").arg("NODES");
    let (info_raw, nodes_raw): (String, String) = conn.pipe_query(&mut pipe).await?;

    let info = parse_cluster_info_text(&info_raw);
    let nodes = parse_cluster_nodes_text(&nodes_raw);

    Ok(RedisClusterInfo { info, nodes })
}

/// Parse `CLUSTER INFO` output (lines of `key:value`) into a map.
fn parse_cluster_info_text(raw: &str) -> HashMap<String, String> {
    let mut info = HashMap::new();
    for line in raw.lines() {
        if let Some((k, v)) = line.split_once(':') {
            info.insert(k.trim().to_string(), v.trim().to_string());
        }
    }
    info
}

/// Parse `CLUSTER NODES` output into a list of `RedisClusterNode`.
fn parse_cluster_nodes_text(raw: &str) -> Vec<RedisClusterNode> {
    let mut nodes = Vec::new();
    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // Format: <id> <addr> <flags> <master_id> <ping_sent> <pong_recv> <config_epoch> <link_state> <slot_range>...
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 8 {
            continue;
        }
        let flags: Vec<String> = parts[2].split(',').map(|s| s.to_string()).collect();
        let master_id = if parts[3] == "-" {
            None
        } else {
            Some(parts[3].to_string())
        };
        let slot_range = if parts.len() > 8 {
            Some(parts[8..].join(" "))
        } else {
            None
        };
        nodes.push(RedisClusterNode {
            id: parts[0].to_string(),
            addr: parts[1].to_string(),
            flags,
            master_id,
            ping_sent: parts[4].parse().unwrap_or(0),
            pong_recv: parts[5].parse().unwrap_or(0),
            config_epoch: parts[6].parse().unwrap_or(0),
            link_state: parts[7].to_string(),
            slot_range,
        });
    }
    nodes
}

