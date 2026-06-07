fn parse_xrange_value(value: Value) -> Vec<RedisStreamEntry> {
    let arr = match value {
        Value::Array(a) => a,
        _ => return Vec::new(),
    };
    arr.into_iter()
        .filter_map(|entry| {
            let inner = match entry {
                Value::Array(a) if a.len() >= 2 => a,
                _ => return None,
            };
            let id = from_redis_value::<String>(&inner[0]).ok()?;
            let fields_arr = match &inner[1] {
                Value::Array(a) => a,
                _ => return None,
            };
            let mut fields = BTreeMap::new();
            for chunk in fields_arr.chunks_exact(2) {
                let k = from_redis_value::<String>(&chunk[0]).ok()?;
                let v = from_redis_value::<String>(&chunk[1]).ok()?;
                fields.insert(k, v);
            }
            Some(RedisStreamEntry { id, fields })
        })
        .collect()
}

fn parse_stream_info(value: Value) -> Option<RedisStreamInfo> {
    let arr = match value {
        Value::Array(a) => a,
        _ => return None,
    };
    let mut map: HashMap<String, Value> = HashMap::new();
    let mut iter = arr.into_iter();
    while let (Some(k), Some(v)) = (iter.next(), iter.next()) {
        if let Ok(key) = from_redis_value::<String>(&k) {
            map.insert(key.to_lowercase().replace('-', "_"), v);
        }
    }
    let get_u64 = |k: &str| -> u64 {
        map.get(k)
            .and_then(|v| from_redis_value::<u64>(v).ok())
            .unwrap_or(0)
    };
    let get_string = |k: &str| -> String {
        map.get(k)
            .and_then(|v| from_redis_value::<String>(v).ok())
            .unwrap_or_default()
    };
    let parse_entry = |v: &Value| -> Option<RedisStreamEntry> {
        let a = match v {
            Value::Array(a) if a.len() >= 2 => a.clone(),
            _ => return None,
        };
        let id = from_redis_value::<String>(&a[0]).ok()?;
        let fields_arr = match &a[1] {
            Value::Array(a) => a,
            _ => return None,
        };
        let mut fields = BTreeMap::new();
        for chunk in fields_arr.chunks_exact(2) {
            let k = from_redis_value::<String>(&chunk[0]).ok()?;
            let v = from_redis_value::<String>(&chunk[1]).ok()?;
            fields.insert(k, v);
        }
        Some(RedisStreamEntry { id, fields })
    };
    Some(RedisStreamInfo {
        length: get_u64("length"),
        radix_tree_keys: get_u64("radix_tree_keys"),
        radix_tree_nodes: get_u64("radix_tree_nodes"),
        groups: get_u64("groups"),
        last_generated_id: get_string("last_generated_id"),
        first_entry: map.get("first_entry").and_then(parse_entry),
        last_entry: map.get("last_entry").and_then(parse_entry),
    })
}

fn parse_stream_groups(value: Value) -> Vec<RedisStreamGroupInfo> {
    let rows = match value {
        Value::Array(a) => a,
        _ => return Vec::new(),
    };
    rows.into_iter()
        .filter_map(|row| {
            let cols = match row {
                Value::Array(a) => a,
                _ => return None,
            };
            let mut map: HashMap<String, Value> = HashMap::new();
            let mut iter = cols.into_iter();
            while let (Some(k), Some(v)) = (iter.next(), iter.next()) {
                if let Ok(key) = from_redis_value::<String>(&k) {
                    map.insert(key.to_lowercase().replace('-', "_"), v);
                }
            }
            let get_u64 = |k: &str| -> Option<u64> {
                map.get(k).and_then(|v| from_redis_value::<u64>(v).ok())
            };
            let get_string = |k: &str| -> String {
                map.get(k)
                    .and_then(|v| from_redis_value::<String>(v).ok())
                    .unwrap_or_default()
            };
            Some(RedisStreamGroupInfo {
                name: get_string("name"),
                consumers: get_u64("consumers").unwrap_or(0),
                pending: get_u64("pending").unwrap_or(0),
                last_delivered_id: get_string("last_delivered_id"),
                entries_read: get_u64("entries_read"),
                lag: get_u64("lag"),
            })
        })
        .collect()
}

fn build_hll_extra(count: u64) -> RedisKeyExtra {
    RedisKeyExtra {
        subtype: Some("hyperloglog".to_string()),
        stream_info: None,
        stream_groups: None,
        hll_count: Some(count),
        geo_count: None,
        bitmap_count: None,
    }
}

fn build_geo_extra(total: u64) -> RedisKeyExtra {
    RedisKeyExtra {
        subtype: Some("geo".to_string()),
        stream_info: None,
        stream_groups: None,
        hll_count: None,
        geo_count: Some(total),
        bitmap_count: None,
    }
}

fn build_json_module_missing_extra() -> RedisKeyExtra {
    RedisKeyExtra {
        subtype: Some("json-module-missing".to_string()),
        stream_info: None,
        stream_groups: None,
        hll_count: None,
        geo_count: None,
        bitmap_count: None,
    }
}

fn build_stream_extra(
    stream_info: Option<RedisStreamInfo>,
    stream_groups: Vec<RedisStreamGroupInfo>,
) -> RedisKeyExtra {
    RedisKeyExtra {
        subtype: None,
        stream_info,
        stream_groups: Some(stream_groups),
        hll_count: None,
        geo_count: None,
        bitmap_count: None,
    }
}

async fn fetch_stream_view_internal(
    conn: &mut RedisConnection,
    key: &str,
    start_id: &str,
    end_id: &str,
    count: u32,
) -> Result<RedisStreamView, String> {
    let fetch_count = count.saturating_add(1);
    let mut pipe = redis::pipe();
    pipe.cmd("XRANGE")
        .arg(key)
        .arg(start_id)
        .arg(end_id)
        .arg("COUNT")
        .arg(fetch_count)
        .cmd("XINFO")
        .arg("STREAM")
        .arg(key)
        .cmd("XINFO")
        .arg("GROUPS")
        .arg(key);

    let (entries_raw, info_raw, groups_raw): (Value, Value, Value) = conn
        .pipe_query(&mut pipe)
        .await
        .map_err(|e| error::to_command_string(e))?;

    let mut entries = parse_xrange_value(entries_raw);
    let has_more = entries.len() > count as usize;
    if has_more {
        entries.truncate(count as usize);
    }
    let stream_info = parse_stream_info(info_raw);
    let groups = parse_stream_groups(groups_raw);
    let total_len = stream_info.as_ref().map(|info| info.length).unwrap_or(0);
    let next_start_id = if has_more {
        entries.last().map(|entry| format!("({}", entry.id))
    } else {
        None
    };

    Ok(RedisStreamView {
        entries,
        total_len,
        start_id: start_id.to_string(),
        end_id: end_id.to_string(),
        count,
        next_start_id,
        stream_info,
        groups,
    })
}

pub async fn get_stream_range(
    conn: &mut RedisConnection,
    key: String,
    start_id: String,
    count: u32,
) -> Result<Vec<RedisStreamEntry>, String> {
    validate_key(&key)?;
    let count = count.clamp(1, MAX_SCAN_LIMIT);
    let mut cmd = redis::cmd("XRANGE");
    cmd.arg(&key)
        .arg(&start_id)
        .arg("+")
        .arg("COUNT")
        .arg(count);
    let value: Value = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(parse_xrange_value(value))
}

pub async fn get_stream_view(
    conn: &mut RedisConnection,
    key: String,
    start_id: String,
    end_id: String,
    count: u32,
) -> Result<RedisStreamView, String> {
    validate_key(&key)?;
    let count = count.clamp(1, MAX_SCAN_LIMIT);
    let normalized_start = if start_id.trim().is_empty() {
        "-".to_string()
    } else {
        start_id.trim().to_string()
    };
    let normalized_end = if end_id.trim().is_empty() {
        "+".to_string()
    } else {
        end_id.trim().to_string()
    };

    fetch_stream_view_internal(conn, &key, &normalized_start, &normalized_end, count).await
}
