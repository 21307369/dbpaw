pub async fn xgroup_create(
    conn: &mut RedisConnection,
    key: String,
    group: String,
    start_id: String,
    mkstream: bool,
) -> Result<bool, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("XGROUP");
    cmd.arg("CREATE").arg(&key).arg(&group).arg(&start_id);
    if mkstream {
        cmd.arg("MKSTREAM");
    }
    let result: String = conn.query(cmd).await?;
    Ok(result == "OK")
}

pub async fn xgroup_del(
    conn: &mut RedisConnection,
    key: String,
    group: String,
) -> Result<bool, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("XGROUP");
    cmd.arg("DESTROY").arg(&key).arg(&group);
    let result: bool = conn.query(cmd).await?;
    Ok(result)
}

pub async fn xgroup_setid(
    conn: &mut RedisConnection,
    key: String,
    group: String,
    start_id: String,
) -> Result<bool, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("XGROUP");
    cmd.arg("SETID").arg(&key).arg(&group).arg(&start_id);
    let result: String = conn.query(cmd).await?;
    Ok(result == "OK")
}

pub async fn xack(
    conn: &mut RedisConnection,
    key: String,
    group: String,
    ids: Vec<String>,
) -> Result<i64, String> {
    validate_key(&key)?;
    if ids.is_empty() {
        return Err("[VALIDATION_ERROR] At least one ID is required".to_string());
    }

    let mut cmd = redis::cmd("XACK");
    cmd.arg(&key).arg(&group);
    for id in &ids {
        cmd.arg(id);
    }
    let count: i64 = conn.query(cmd).await?;
    Ok(count)
}

pub async fn xpending(
    conn: &mut RedisConnection,
    key: String,
    group: String,
    start: Option<String>,
    end: Option<String>,
    count: Option<i64>,
    consumer: Option<String>,
) -> Result<RedisXPendingResult, String> {
    validate_key(&key)?;

    if start.is_some() && end.is_some() && count.is_some() {
        // Range mode: XPENDING key group start end count [consumer]
        let mut cmd = redis::cmd("XPENDING");
        cmd.arg(&key)
            .arg(&group)
            .arg(start.as_deref().unwrap())
            .arg(end.as_deref().unwrap())
            .arg(count.unwrap());
        if let Some(ref c) = consumer {
            cmd.arg(c);
        }
        let raw: Value = conn.query(cmd).await?;
        let entries = parse_xpending_entries(&raw)?;
        Ok(RedisXPendingResult::Entries(entries))
    } else {
        // Summary mode: XPENDING key group
        let mut cmd = redis::cmd("XPENDING");
        cmd.arg(&key).arg(&group);
        let raw: Value = conn.query(cmd).await?;
        let summary = parse_xpending_summary(&raw)?;
        Ok(RedisXPendingResult::Summary(summary))
    }
}

fn parse_xpending_summary(raw: &Value) -> Result<RedisXPendingSummary, String> {
    // XPENDING without range returns [count, min_id, max_id, [[consumer, count], ...]]
    let items = match raw {
        Value::Array(arr) if arr.len() >= 4 => arr,
        _ => return Err("[PARSE_ERROR] Unexpected XPENDING summary format".to_string()),
    };
    let count: i64 = from_redis_value(&items[0]).unwrap_or(0);
    let min_id: String = from_redis_value(&items[1]).unwrap_or_default();
    let max_id: String = from_redis_value(&items[2]).unwrap_or_default();
    let mut consumers = Vec::new();
    if let Value::Array(ref groups) = items[3] {
        for g in groups {
            if let Value::Array(ref pair) = g {
                if pair.len() >= 2 {
                    let name: String = from_redis_value(&pair[0]).unwrap_or_default();
                    let cnt: i64 = from_redis_value(&pair[1]).unwrap_or(0);
                    consumers.push((name, cnt));
                }
            }
        }
    }
    Ok(RedisXPendingSummary {
        count,
        min_id,
        max_id,
        consumers,
    })
}

fn parse_xpending_entries(raw: &Value) -> Result<Vec<RedisXPendingEntry>, String> {
    // XPENDING with range returns array of [id, consumer, idle_ms, delivery_count]
    let items = match raw {
        Value::Array(arr) => arr,
        _ => return Err("[PARSE_ERROR] Unexpected XPENDING entries format".to_string()),
    };
    let mut entries = Vec::new();
    for item in items {
        if let Value::Array(ref cols) = item {
            if cols.len() >= 4 {
                entries.push(RedisXPendingEntry {
                    id: from_redis_value(&cols[0]).unwrap_or_default(),
                    consumer: from_redis_value(&cols[1]).unwrap_or_default(),
                    idle_ms: from_redis_value(&cols[2]).unwrap_or(0),
                    delivery_count: from_redis_value(&cols[3]).unwrap_or(0),
                });
            }
        }
    }
    Ok(entries)
}

pub async fn xclaim(
    conn: &mut RedisConnection,
    key: String,
    group: String,
    consumer: String,
    min_idle_ms: i64,
    ids: Vec<String>,
) -> Result<Vec<RedisXClaimEntry>, String> {
    validate_key(&key)?;
    if ids.is_empty() {
        return Err("[VALIDATION_ERROR] At least one ID is required".to_string());
    }

    let mut cmd = redis::cmd("XCLAIM");
    cmd.arg(&key).arg(&group).arg(&consumer).arg(min_idle_ms);
    for id in &ids {
        cmd.arg(id);
    }
    let raw: Value = conn.query(cmd).await?;
    parse_xclaim_entries(&raw)
}

fn parse_xclaim_entries(raw: &Value) -> Result<Vec<RedisXClaimEntry>, String> {
    // XCLAIM returns same format as XRANGE: [[id, [field, value, ...]], ...]
    let items = match raw {
        Value::Array(arr) => arr,
        _ => return Err("[PARSE_ERROR] Unexpected XCLAIM format".to_string()),
    };
    let mut entries = Vec::new();
    for item in items {
        if let Value::Array(ref cols) = item {
            if cols.len() >= 2 {
                let id: String = from_redis_value(&cols[0]).unwrap_or_default();
                let fields = parse_stream_fields(&cols[1]);
                entries.push(RedisXClaimEntry {
                    id,
                    fields,
                    idle_ms: None,
                    delivery_count: None,
                });
            }
        }
    }
    Ok(entries)
}

fn parse_stream_fields(val: &Value) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    if let Value::Array(ref items) = val {
        let mut iter = items.iter();
        while let (Some(k), Some(v)) = (iter.next(), iter.next()) {
            if let (Ok(key), Ok(val)) =
                (from_redis_value::<String>(k), from_redis_value::<String>(v))
            {
                map.insert(key, val);
            }
        }
    }
    map
}

pub async fn xtrim(
    conn: &mut RedisConnection,
    key: String,
    strategy: String,
    threshold: String,
    approximate: Option<bool>,
) -> Result<i64, String> {
    validate_key(&key)?;

    let strategy_upper = strategy.to_uppercase();
    if strategy_upper != "MAXLEN" && strategy_upper != "MINID" {
        return Err(format!(
            "[VALIDATION_ERROR] Invalid strategy '{}': must be MAXLEN or MINID",
            strategy
        ));
    }

    let mut cmd = redis::cmd("XTRIM");
    cmd.arg(&key).arg(&strategy_upper);
    if approximate.unwrap_or(false) {
        cmd.arg("~");
    }
    cmd.arg(&threshold);
    let count: i64 = conn.query(cmd).await?;
    Ok(count)
}

pub async fn xreadgroup(
    conn: &mut RedisConnection,
    key: String,
    group: String,
    consumer: String,
    start_id: String,
    count: Option<i64>,
) -> Result<Vec<RedisStreamEntry>, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("XREADGROUP");
    cmd.arg("GROUP").arg(&group).arg(&consumer);
    if let Some(c) = count {
        cmd.arg("COUNT").arg(c);
    }
    cmd.arg("STREAMS").arg(&key).arg(&start_id);
    let raw: Value = conn.query(cmd).await?;
    // XREADGROUP returns [[stream_name, [[id, [field, value, ...]], ...]]] or Nil
    match raw {
        Value::Nil => Ok(Vec::new()),
        Value::Array(ref streams) => {
            if let Some(Value::Array(ref stream_data)) = streams.first() {
                if stream_data.len() >= 2 {
                    return Ok(parse_xrange_value(stream_data[1].clone()));
                }
            }
            Ok(Vec::new())
        }
        _ => Ok(Vec::new()),
    }
}

// ── Raw command execution ───────────────────────────────────────────────────
