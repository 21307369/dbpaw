fn encode_cluster_scan_state(cursors: &HashMap<String, u64>) -> Result<String, String> {
    let json = serde_json::to_string(cursors).map_err(|e| error::to_scan_string(e))?;
    Ok(base64::prelude::BASE64_STANDARD.encode(json.as_bytes()))
}

fn decode_cluster_scan_state(s: &str) -> Result<HashMap<String, u64>, String> {
    let bytes = base64::prelude::BASE64_STANDARD
        .decode(s)
        .map_err(|e| format!("[REDIS_SCAN_ERROR] Invalid cursor: {e}"))?;
    let json =
        String::from_utf8(bytes).map_err(|e| format!("[REDIS_SCAN_ERROR] Invalid cursor: {e}"))?;
    serde_json::from_str(&json).map_err(|e| format!("[REDIS_SCAN_ERROR] Invalid cursor: {e}"))
}

async fn get_cluster_master_nodes(
    conn: &mut RedisConnection,
) -> Result<Vec<(String, u16)>, String> {
    let mut cmd = redis::cmd("CLUSTER");
    cmd.arg("SLOTS");
    let value: Value = conn.query(cmd).await?;

    let slots = match value {
        Value::Array(arr) => arr,
        _ => return Err("[REDIS_SCAN_ERROR] Unexpected CLUSTER SLOTS response".to_string()),
    };

    let mut masters = Vec::new();
    for slot in slots {
        let slot_arr = match slot {
            Value::Array(arr) => arr,
            _ => continue,
        };
        if slot_arr.len() < 3 {
            continue;
        }
        let master_info = match &slot_arr[2] {
            Value::Array(info) => info,
            _ => continue,
        };
        if master_info.len() < 2 {
            continue;
        }
        let host = from_redis_value::<String>(&master_info[0])
            .map_err(|e| error::to_scan_string(e))?;
        let port = from_redis_value::<u16>(&master_info[1])
            .map_err(|e| error::to_scan_string(e))?;
        masters.push((host, port));
    }

    masters.sort();
    masters.dedup();
    Ok(masters)
}

fn parse_node_addr(addr: &str) -> Result<(&str, u16), String> {
    let mut parts = addr.rsplitn(2, ':');
    let port_part = parts
        .next()
        .ok_or_else(|| "[REDIS_SCAN_ERROR] Invalid node addr".to_string())?;
    let host_part = parts
        .next()
        .ok_or_else(|| "[REDIS_SCAN_ERROR] Invalid node addr".to_string())?;
    let port = port_part
        .parse::<u16>()
        .map_err(|_| "[REDIS_SCAN_ERROR] Invalid node port".to_string())?;
    Ok((host_part, port))
}

fn is_dangerous_wildcard(pattern: &str) -> bool {
    let trimmed = pattern.trim();
    if trimmed.is_empty() {
        return true;
    }
    !trimmed.chars().any(|c| c.is_alphanumeric())
}

/// Run SCAN on a single cluster node and return the next cursor + keys.
/// `cursor` is the raw value from the cursors map: 0 means "finished",
/// u64::MAX means "never scanned yet" (translated to 0 for the actual SCAN call).
async fn scan_one_cluster_node(
    conn: &mut RedisConnection,
    addr: &str,
    cursor: u64,
    pattern: &str,
    count: u32,
) -> Result<(u64, Vec<String>), String> {
    if cursor == 0 {
        return Ok((0, Vec::new()));
    }
    let effective_cursor = if cursor == u64::MAX { 0 } else { cursor };
    let (host, port) = parse_node_addr(addr)?;
    let mut cmd = redis::cmd("SCAN");
    cmd.arg(effective_cursor)
        .arg("MATCH")
        .arg(pattern)
        .arg("COUNT")
        .arg(count);
    conn.query_on_node(host, port, cmd)
        .await
        .map_err(|e| error::to_scan_string(e))
}

async fn scan_cluster_keys(
    conn: &mut RedisConnection,
    state: Option<&str>,
    pattern: &str,
    count: u32,
) -> Result<(Vec<String>, String, bool), String> {
    if is_dangerous_wildcard(pattern) {
        return Err("[VALIDATION_ERROR] Cluster scan requires a non-wildcard pattern".to_string());
    }
    let masters = get_cluster_master_nodes(conn).await?;

    let mut cursors: HashMap<String, u64> = match state {
        Some(s) => decode_cluster_scan_state(s)?,
        None => HashMap::new(),
    };

    // Seed any newly-discovered masters.  u64::MAX means "never scanned yet";
    // it is translated to 0 when passed to SCAN so the first call starts
    // every master from the beginning.
    for (host, port) in &masters {
        cursors.entry(format!("{host}:{port}")).or_insert(u64::MAX);
    }

    let mut keys: Vec<String> = Vec::new();
    let mut addresses: Vec<String> = cursors.keys().cloned().collect();
    addresses.sort();

    // Scan every master that still has work to do once per call.
    for addr in &addresses {
        let cursor = cursors.get(addr).copied().unwrap_or(u64::MAX);
        let (next_cursor, node_keys) =
            scan_one_cluster_node(conn, addr, cursor, pattern, count).await?;
        keys.extend(node_keys);
        cursors.insert(addr.clone(), next_cursor);
    }

    // If we still haven't reached the limit and some nodes remain unfinished,
    // perform one more round to be more eager.
    if keys.len() < count as usize {
        for addr in &addresses {
            let cursor = cursors.get(addr).copied().unwrap_or(u64::MAX);
            let (next_cursor, node_keys) =
                scan_one_cluster_node(conn, addr, cursor, pattern, count).await?;
            keys.extend(node_keys);
            cursors.insert(addr.clone(), next_cursor);
            if keys.len() >= count as usize {
                break;
            }
        }
    }

    keys.sort();
    keys.truncate(count as usize);

    let is_partial = cursors.values().any(|c| *c != 0);
    let next_state = encode_cluster_scan_state(&cursors)?;
    Ok((keys, next_state, is_partial))
}

/// Query TYPE and TTL for a list of keys.
/// In cluster mode keys may span different slots, so pipeline is not allowed.
/// In standalone mode we use a pipeline for efficiency.
async fn query_key_metas(
    conn: &mut RedisConnection,
    keys: Vec<String>,
) -> Result<Vec<RedisKeyInfo>, String> {
    if keys.is_empty() {
        return Ok(Vec::new());
    }

    if conn.is_cluster() {
        let mut out = Vec::with_capacity(keys.len());
        for key in keys {
            let mut type_cmd = redis::cmd("TYPE");
            type_cmd.arg(&key);
            let key_type = conn
                .query(type_cmd)
                .await
                .unwrap_or_else(|_| "unknown".to_string());
            let mut ttl_cmd = redis::cmd("TTL");
            ttl_cmd.arg(&key);
            let ttl = conn.query(ttl_cmd).await.unwrap_or(-2);
            out.push(RedisKeyInfo { key, key_type, ttl });
        }
        Ok(out)
    } else {
        let mut pipe = redis::pipe();
        for key in &keys {
            pipe.cmd("TYPE").arg(key);
            pipe.cmd("TTL").arg(key);
        }
        let results: Vec<Value> = conn
            .pipe_query(&mut pipe)
            .await
            .map_err(|e| error::to_scan_string(e))?;
        Ok(keys
            .into_iter()
            .enumerate()
            .map(|(i, key)| {
                let key_type = from_redis_value(results.get(i * 2).unwrap_or(&Value::Nil))
                    .unwrap_or_else(|_| "unknown".to_string());
                let ttl =
                    from_redis_value(results.get(i * 2 + 1).unwrap_or(&Value::Nil)).unwrap_or(-2);
                RedisKeyInfo { key, key_type, ttl }
            })
            .collect())
    }
}

pub async fn scan_keys(
    conn: &mut RedisConnection,
    cursor: Option<String>,
    pattern: Option<String>,
    limit: Option<u32>,
) -> Result<RedisScanResponse, String> {
    let count = limit.unwrap_or(DEFAULT_SCAN_LIMIT).clamp(1, MAX_SCAN_LIMIT);
    let match_pattern = pattern
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .unwrap_or("*");

    let (next_cursor, is_partial, keys): (String, bool, Vec<String>) = if conn.is_cluster() {
        let (keys, next_state, partial) =
            scan_cluster_keys(conn, cursor.as_deref(), match_pattern, count).await?;
        (next_state, partial, keys)
    } else {
        let scan_cursor: u64 = cursor
            .as_deref()
            .unwrap_or("0")
            .parse()
            .map_err(|_| "[VALIDATION_ERROR] Invalid cursor".to_string())?;
        let mut cmd = redis::cmd("SCAN");
        cmd.arg(scan_cursor)
            .arg("MATCH")
            .arg(match_pattern)
            .arg("COUNT")
            .arg(count);
        let (next_cursor, keys): (u64, Vec<String>) = conn
            .query(cmd)
            .await
            .map_err(|e| error::to_scan_string(e))?;
        let partial = next_cursor != 0;
        (next_cursor.to_string(), partial, keys)
    };

    let out = if keys.is_empty() {
        Vec::new()
    } else {
        query_key_metas(conn, keys).await?
    };

    Ok(RedisScanResponse {
        cursor: next_cursor,
        keys: out,
        is_partial,
    })
}
