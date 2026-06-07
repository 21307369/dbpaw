pub async fn get_key(conn: &mut RedisConnection, key: String) -> Result<RedisKeyValue, String> {
    validate_key(&key)?;

    let mut pipe1 = redis::pipe();
    pipe1.cmd("TYPE").arg(&key).cmd("TTL").arg(&key);
    let (key_type, ttl): (String, i64) = conn
        .pipe_query(&mut pipe1)
        .await
        .map_err(|e| error::to_command_string(e))?;

    let page = PAGE_SIZE - 1;
    let (value, value_total_len, value_offset, is_binary, extra): (
        RedisValue,
        Option<u64>,
        u64,
        bool,
        Option<RedisKeyExtra>,
    ) = match key_type.as_str() {
        "none" => (RedisValue::None, None, 0, false, None),
        "string" => {
            // HyperLogLog detection must happen before GET, because HLL
            // internal encoding is binary and would set is_binary=true.
            let mut extra = None;
            let mut hll_cmd = redis::cmd("PFCOUNT");
            hll_cmd.arg(&key);
            match conn.query::<i64>(hll_cmd).await {
                Ok(count) if count >= 0 => {
                    extra = Some(build_hll_extra(count as u64));
                }
                _ => {}
            }

            let mut cmd = redis::cmd("GET");
            cmd.arg(&key);
            let bytes: Vec<u8> = conn.query(cmd).await.unwrap_or_default();
            let (text, is_binary) = match String::from_utf8(bytes) {
                Ok(s) => (s, false),
                Err(e) => {
                    let encoded = base64::prelude::BASE64_STANDARD.encode(e.into_bytes());
                    (encoded, true)
                }
            };

            (RedisValue::String(text), None, 0, is_binary, extra)
        }
        "hash" => {
            let mut pipe = redis::pipe();
            pipe.cmd("HLEN")
                .arg(&key)
                .cmd("HSCAN")
                .arg(&key)
                .arg(0u64)
                .arg("COUNT")
                .arg(PAGE_SIZE);
            let (total, (next_cursor, fields)): (u64, (u64, BTreeMap<String, String>)) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            (
                RedisValue::Hash(fields),
                Some(total),
                next_cursor,
                false,
                None,
            )
        }
        "list" => {
            let mut pipe = redis::pipe();
            pipe.cmd("LLEN")
                .arg(&key)
                .cmd("LRANGE")
                .arg(&key)
                .arg(0)
                .arg(page);
            let (total, items): (u64, Vec<String>) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            let next_offset = (items.len() as u64).min(total);
            (
                RedisValue::List(items),
                Some(total),
                next_offset,
                false,
                None,
            )
        }
        "set" => {
            let mut pipe = redis::pipe();
            pipe.cmd("SCARD")
                .arg(&key)
                .cmd("SSCAN")
                .arg(&key)
                .arg(0u64)
                .arg("COUNT")
                .arg(PAGE_SIZE);
            let (total, (next_cursor, members)): (u64, (u64, Vec<String>)) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            (
                RedisValue::Set(members),
                Some(total),
                next_cursor,
                false,
                None,
            )
        }
        "zset" => {
            let mut pipe = redis::pipe();
            pipe.cmd("ZCARD")
                .arg(&key)
                .cmd("ZRANGE")
                .arg(&key)
                .arg(0)
                .arg(page)
                .arg("WITHSCORES");
            let (total, members): (u64, Vec<(String, f64)>) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            let next_offset = (members.len() as u64).min(total);
            let mut extra = None;
            if let Some(first) = members.first() {
                let mut geo_cmd = redis::cmd("GEOPOS");
                geo_cmd.arg(&key).arg(&first.0);
                if let Ok(positions) = conn.query::<Vec<Option<(f64, f64)>>>(geo_cmd).await {
                    if positions.iter().any(|p| p.is_some()) {
                        extra = Some(build_geo_extra(total));
                    }
                }
            }
            (
                RedisValue::ZSet(
                    members
                        .into_iter()
                        .map(|(member, score)| RedisZSetMember { member, score })
                        .collect(),
                ),
                Some(total),
                next_offset,
                false,
                extra,
            )
        }
        "stream" => {
            let view = fetch_stream_view_internal(conn, &key, "-", "+", PAGE_SIZE as u32).await?;
            let extra = Some(build_stream_extra(
                view.stream_info.clone(),
                view.groups.clone(),
            ));
            (
                RedisValue::Stream(view.entries),
                Some(view.total_len),
                view.total_len.min(PAGE_SIZE as u64),
                false,
                extra,
            )
        }
        "ReJSON-RL" | "json" | "JSON" => {
            let mut cmd = redis::cmd("JSON.GET");
            cmd.arg(&key).arg(".");
            match conn.query::<String>(cmd).await {
                Ok(json_str) => (RedisValue::Json(json_str), None, 0, false, None),
                Err(e) if e.to_string().to_lowercase().contains("unknown command") => {
                    let mut cmd = redis::cmd("GET");
                    cmd.arg(&key);
                    let bytes: Vec<u8> = conn.query(cmd).await.unwrap_or_default();
                    let (text, is_binary) = match String::from_utf8(bytes) {
                        Ok(s) => (s, false),
                        Err(e) => {
                            let encoded = base64::prelude::BASE64_STANDARD.encode(e.into_bytes());
                            (encoded, true)
                        }
                    };
                    let extra = Some(build_json_module_missing_extra());
                    (RedisValue::Json(text), None, 0, is_binary, extra)
                }
                Err(e) => return Err(error::to_command_string(e)),
            }
        }
        other => {
            return Err(format!(
                "[UNSUPPORTED] Redis type '{other}' is not supported"
            ))
        }
    };

    let object_encoding = {
        let mut cmd = redis::cmd("OBJECT");
        cmd.arg("ENCODING").arg(&key);
        conn.query::<String>(cmd).await.ok()
    };

    let memory_usage = {
        let mut cmd = redis::cmd("MEMORY");
        cmd.arg("USAGE").arg(&key);
        conn.query::<i64>(cmd).await.ok().map(|v| v.max(0) as u64)
    };

    let object_idletime = {
        let mut cmd = redis::cmd("OBJECT");
        cmd.arg("IDLETIME").arg(&key);
        conn.query::<i64>(cmd).await.ok()
    };

    let object_refcount = {
        let mut cmd = redis::cmd("OBJECT");
        cmd.arg("REFCOUNT").arg(&key);
        conn.query::<i64>(cmd).await.ok()
    };

    let key_exists = {
        let mut cmd = redis::cmd("EXISTS");
        cmd.arg(&key);
        conn.query::<i64>(cmd).await.ok().map(|v| v > 0)
    };

    Ok(RedisKeyValue {
        key,
        key_type,
        ttl,
        value,
        value_total_len,
        value_offset,
        is_binary,
        extra,
        object_encoding,
        memory_usage,
        object_idletime,
        object_refcount,
        key_exists,
    })
}

pub async fn get_key_page(
    conn: &mut RedisConnection,
    key: String,
    offset: u64,
    limit: u32,
) -> Result<RedisKeyValue, String> {
    validate_key(&key)?;
    let limit = limit.clamp(1, MAX_SCAN_LIMIT);

    let mut pipe1 = redis::pipe();
    pipe1.cmd("TYPE").arg(&key).cmd("TTL").arg(&key);
    let (key_type, ttl): (String, i64) = conn
        .pipe_query(&mut pipe1)
        .await
        .map_err(|e| error::to_command_string(e))?;

    let end = offset.saturating_add(limit as u64).saturating_sub(1);

    let (value, value_total_len, value_offset, extra): (
        RedisValue,
        Option<u64>,
        u64,
        Option<RedisKeyExtra>,
    ) = match key_type.as_str() {
        "list" => {
            let mut pipe = redis::pipe();
            pipe.cmd("LLEN")
                .arg(&key)
                .cmd("LRANGE")
                .arg(&key)
                .arg(offset)
                .arg(end);
            let (total, items): (u64, Vec<String>) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            let next_offset = offset.saturating_add(items.len() as u64).min(total);
            (RedisValue::List(items), Some(total), next_offset, None)
        }
        "zset" => {
            let mut pipe = redis::pipe();
            pipe.cmd("ZCARD")
                .arg(&key)
                .cmd("ZRANGE")
                .arg(&key)
                .arg(offset)
                .arg(end)
                .arg("WITHSCORES");
            let (total, members): (u64, Vec<(String, f64)>) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            let next_offset = offset.saturating_add(members.len() as u64).min(total);
            let mut extra = None;
            if let Some(first) = members.first() {
                let mut geo_cmd = redis::cmd("GEOPOS");
                geo_cmd.arg(&key).arg(&first.0);
                if let Ok(positions) = conn.query::<Vec<Option<(f64, f64)>>>(geo_cmd).await {
                    if positions.iter().any(|p| p.is_some()) {
                        extra = Some(build_geo_extra(total));
                    }
                }
            }
            (
                RedisValue::ZSet(
                    members
                        .into_iter()
                        .map(|(member, score)| RedisZSetMember { member, score })
                        .collect(),
                ),
                Some(total),
                next_offset,
                extra,
            )
        }
        "hash" => {
            let mut pipe = redis::pipe();
            pipe.cmd("HLEN")
                .arg(&key)
                .cmd("HSCAN")
                .arg(&key)
                .arg(offset)
                .arg("COUNT")
                .arg(limit);
            let (total, (next_cursor, fields)): (u64, (u64, BTreeMap<String, String>)) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            (RedisValue::Hash(fields), Some(total), next_cursor, None)
        }
        "set" => {
            let mut pipe = redis::pipe();
            pipe.cmd("SCARD")
                .arg(&key)
                .cmd("SSCAN")
                .arg(&key)
                .arg(offset)
                .arg("COUNT")
                .arg(limit);
            let (total, (next_cursor, members)): (u64, (u64, Vec<String>)) =
                conn.pipe_query(&mut pipe).await.unwrap_or_default();
            (RedisValue::Set(members), Some(total), next_cursor, None)
        }
        "string" | "none" | "stream" | "ReJSON-RL" | "json" | "JSON" => {
            return get_key(conn, key).await;
        }
        other => {
            return Err(format!(
                "[UNSUPPORTED] Redis type '{other}' is not supported"
            ))
        }
    };

    let object_encoding = {
        let mut cmd = redis::cmd("OBJECT");
        cmd.arg("ENCODING").arg(&key);
        conn.query::<String>(cmd).await.ok()
    };

    let memory_usage = {
        let mut cmd = redis::cmd("MEMORY");
        cmd.arg("USAGE").arg(&key);
        conn.query::<i64>(cmd).await.ok().map(|v| v.max(0) as u64)
    };

    let object_idletime = {
        let mut cmd = redis::cmd("OBJECT");
        cmd.arg("IDLETIME").arg(&key);
        conn.query::<i64>(cmd).await.ok()
    };

    let object_refcount = {
        let mut cmd = redis::cmd("OBJECT");
        cmd.arg("REFCOUNT").arg(&key);
        conn.query::<i64>(cmd).await.ok()
    };

    let key_exists = {
        let mut cmd = redis::cmd("EXISTS");
        cmd.arg(&key);
        conn.query::<i64>(cmd).await.ok().map(|v| v > 0)
    };

    Ok(RedisKeyValue {
        key,
        key_type,
        ttl,
        value,
        value_total_len,
        value_offset,
        is_binary: false,
        extra,
        object_encoding,
        memory_usage,
        object_idletime,
        object_refcount,
        key_exists,
    })
}

pub async fn set_key(
    conn: &mut RedisConnection,
    payload: RedisSetKeyPayload,
) -> Result<RedisMutationResult, String> {
    validate_key(&payload.key)?;
    validate_value_for_write(&payload.value)?;
    let mut del_cmd = redis::cmd("DEL");
    del_cmd.arg(&payload.key);
    let _: i64 = conn.query(del_cmd).await.unwrap_or(0);

    let ttl_handled_atomically = matches!(payload.value, RedisValue::String(_));
    match payload.value {
        RedisValue::String(value) => {
            let mut cmd = redis::cmd("SET");
            cmd.arg(&payload.key).arg(value);
            // Atomic SET options: PX (ms) takes precedence over EX (s).
            if let Some(px) = payload.set_px {
                if px > 0 {
                    cmd.arg("PX").arg(px);
                }
            } else if let Some(ttl) = payload.ttl_seconds {
                if ttl > 0 {
                    cmd.arg("EX").arg(ttl);
                }
            }
            if payload.set_keepttl.unwrap_or(false) {
                cmd.arg("KEEPTTL");
            }
            if payload.set_nx.unwrap_or(false) {
                cmd.arg("NX");
            } else if payload.set_xx.unwrap_or(false) {
                cmd.arg("XX");
            }
            conn.query::<()>(cmd).await?;
        }
        RedisValue::Hash(fields) => {
            let mut cmd = redis::cmd("HSET");
            cmd.arg(&payload.key);
            for (field, value) in fields {
                cmd.arg(field).arg(value);
            }
            conn.query::<i64>(cmd).await?;
        }
        RedisValue::List(items) => {
            let mut cmd = redis::cmd("RPUSH");
            cmd.arg(&payload.key).arg(items);
            conn.query::<i64>(cmd).await?;
        }
        RedisValue::Set(items) => {
            let mut cmd = redis::cmd("SADD");
            cmd.arg(&payload.key).arg(items);
            conn.query::<i64>(cmd).await?;
        }
        RedisValue::ZSet(items) => {
            for item in items {
                let mut cmd = redis::cmd("ZADD");
                cmd.arg(&payload.key).arg(item.score).arg(item.member);
                conn.query::<i64>(cmd).await?;
            }
        }
        RedisValue::Stream(entries) => {
            for entry in entries {
                let mut cmd = redis::cmd("XADD");
                cmd.arg(&payload.key).arg(&entry.id);
                for (field, value) in entry.fields {
                    cmd.arg(field).arg(value);
                }
                conn.query::<String>(cmd).await?;
            }
        }
        RedisValue::Json(json_str) => {
            let mut cmd = redis::cmd("JSON.SET");
            cmd.arg(&payload.key).arg(".").arg(json_str);
            conn.query::<()>(cmd).await?;
        }
        RedisValue::None => unreachable!("validated above"),
    }

    if !ttl_handled_atomically {
        if let Some(ttl) = payload.ttl_seconds {
            if ttl > 0 {
                let mut cmd = redis::cmd("EXPIRE");
                cmd.arg(&payload.key).arg(ttl);
                conn.query::<bool>(cmd).await?;
            }
        }
    }

    Ok(RedisMutationResult {
        success: true,
        affected: 1,
    })
}

pub async fn delete_key(
    conn: &mut RedisConnection,
    key: String,
) -> Result<RedisMutationResult, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("DEL");
    cmd.arg(key);
    let affected: i64 = conn.query(cmd).await?;
    Ok(RedisMutationResult {
        success: true,
        affected,
    })
}

pub async fn patch_key(
    conn: &mut RedisConnection,
    payload: RedisKeyPatchPayload,
) -> Result<RedisMutationResult, String> {
    validate_key(&payload.key)?;
    let key = &payload.key;

    if let Some(fields) = payload.hash_set {
        if !fields.is_empty() {
            let mut cmd = redis::cmd("HSET");
            cmd.arg(key);
            for (f, v) in fields {
                cmd.arg(f).arg(v);
            }
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(fields) = payload.hash_del {
        if !fields.is_empty() {
            let mut cmd = redis::cmd("HDEL");
            cmd.arg(key);
            for f in fields {
                cmd.arg(f);
            }
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(members) = payload.set_add {
        if !members.is_empty() {
            let mut cmd = redis::cmd("SADD");
            cmd.arg(key).arg(members);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(members) = payload.set_rem {
        if !members.is_empty() {
            let mut cmd = redis::cmd("SREM");
            cmd.arg(key).arg(members);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(members) = payload.zset_add {
        if !members.is_empty() {
            let mut cmd = redis::cmd("ZADD");
            cmd.arg(key);
            for m in members {
                cmd.arg(m.score).arg(m.member);
            }
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(members) = payload.zset_rem {
        if !members.is_empty() {
            let mut cmd = redis::cmd("ZREM");
            cmd.arg(key).arg(members);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(items) = payload.list_rpush {
        if !items.is_empty() {
            let mut cmd = redis::cmd("RPUSH");
            cmd.arg(key).arg(items);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(items) = payload.list_lpush {
        if !items.is_empty() {
            let mut cmd = redis::cmd("LPUSH");
            cmd.arg(key).arg(items);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(items) = payload.list_set {
        for item in items {
            let mut cmd = redis::cmd("LSET");
            cmd.arg(key).arg(item.index).arg(item.value);
            conn.query::<()>(cmd).await?;
        }
    }
    if let Some(values) = payload.list_rem {
        for value in values {
            let mut cmd = redis::cmd("LREM");
            cmd.arg(key).arg(0).arg(value);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(count) = payload.list_lpop {
        if count > 0 {
            let mut cmd = redis::cmd("LPOP");
            cmd.arg(key).arg(count);
            conn.query::<()>(cmd).await?;
        }
    }
    if let Some(count) = payload.list_rpop {
        if count > 0 {
            let mut cmd = redis::cmd("RPOP");
            cmd.arg(key).arg(count);
            conn.query::<()>(cmd).await?;
        }
    }
    if let Some(entries) = payload.stream_add {
        if !entries.is_empty() {
            for entry in entries {
                let mut cmd = redis::cmd("XADD");
                cmd.arg(key).arg(&entry.id);
                for (field, value) in entry.fields {
                    cmd.arg(field).arg(value);
                }
                conn.query::<String>(cmd).await?;
            }
        }
    }
    if let Some(ids) = payload.stream_del {
        if !ids.is_empty() {
            let mut cmd = redis::cmd("XDEL");
            cmd.arg(key).arg(ids);
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(bits) = payload.bitmap_set {
        for bit in bits {
            let mut cmd = redis::cmd("SETBIT");
            cmd.arg(key)
                .arg(bit.offset)
                .arg(if bit.value { 1 } else { 0 });
            conn.query::<i64>(cmd).await?;
        }
    }
    if let Some(ref amount) = payload.string_incr_by {
        let mut cmd = redis::cmd("INCRBYFLOAT");
        cmd.arg(key).arg(amount);
        conn.query::<String>(cmd).await?;
    }
    if let Some(amount) = payload.string_incr_by_int {
        let mut cmd = redis::cmd("INCRBY");
        cmd.arg(key).arg(amount);
        conn.query::<i64>(cmd).await?;
    }
    if let Some(ref fields) = payload.hash_incr_by {
        for (field, amount) in fields {
            let mut cmd = redis::cmd("HINCRBYFLOAT");
            cmd.arg(key).arg(field).arg(amount);
            conn.query::<String>(cmd).await?;
        }
    }
    if let Some(ref members) = payload.zset_incr_by {
        for m in members {
            let mut cmd = redis::cmd("ZINCRBY");
            cmd.arg(key).arg(m.score).arg(&m.member);
            conn.query::<String>(cmd).await?;
        }
    }

    match payload.ttl_seconds {
        Some(ttl) if ttl > 0 => {
            let mut cmd = redis::cmd("EXPIRE");
            cmd.arg(key).arg(ttl);
            conn.query::<bool>(cmd).await?;
        }
        Some(_) => {
            // Caller sends 0 or negative to explicitly remove TTL.
            let mut cmd = redis::cmd("PERSIST");
            cmd.arg(key);
            conn.query::<bool>(cmd).await?;
        }
        None => {
            // None means "leave TTL unchanged" — no action.
        }
    }

    Ok(RedisMutationResult {
        success: true,
        affected: 1,
    })
}

pub async fn rename_key(
    conn: &mut RedisConnection,
    old_key: String,
    new_key: String,
    force: bool,
) -> Result<RedisMutationResult, String> {
    validate_key(&old_key)?;
    validate_key(&new_key)?;
    let cmd_name = if force { "RENAME" } else { "RENAMENX" };
    let mut cmd = redis::cmd(cmd_name);
    cmd.arg(&old_key).arg(&new_key);
    let renamed: i64 = conn.query(cmd).await?;
    if renamed == 0 && !force {
        return Err(format!(
            "[REDIS_ERROR] Key '{}' already exists. RENAMENX refused to overwrite.",
            new_key
        ));
    }
    Ok(RedisMutationResult {
        success: true,
        affected: 1,
    })
}

pub async fn set_ttl(
    conn: &mut RedisConnection,
    key: String,
    ttl_seconds: Option<i64>,
) -> Result<RedisMutationResult, String> {
    validate_key(&key)?;
    let changed: bool = match ttl_seconds {
        Some(ttl) if ttl > 0 => {
            let mut cmd = redis::cmd("EXPIRE");
            cmd.arg(key).arg(ttl);
            conn.query(cmd).await?
        }
        _ => {
            let mut cmd = redis::cmd("PERSIST");
            cmd.arg(key);
            conn.query(cmd).await?
        }
    };
    Ok(RedisMutationResult {
        success: true,
        affected: if changed { 1 } else { 0 },
    })
}

pub async fn bitmap_get_bit(
    conn: &mut RedisConnection,
    key: String,
    offset: u64,
) -> Result<bool, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("GETBIT");
    cmd.arg(&key).arg(offset);
    let result: i64 = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(result != 0)
}

pub async fn bitmap_count(
    conn: &mut RedisConnection,
    key: String,
    start: Option<i64>,
    end: Option<i64>,
) -> Result<u64, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("BITCOUNT");
    cmd.arg(&key);
    if let (Some(s), Some(e)) = (start, end) {
        cmd.arg(s).arg(e);
    }
    let count: i64 = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(count as u64)
}

pub async fn bitmap_pos(
    conn: &mut RedisConnection,
    key: String,
    bit: bool,
    start: Option<u64>,
    end: Option<u64>,
    count: Option<u64>,
) -> Result<Vec<u64>, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("BITPOS");
    cmd.arg(&key).arg(if bit { 1 } else { 0 });
    if let Some(s) = start {
        cmd.arg(s);
        if let Some(e) = end {
            cmd.arg(e);
        }
    }
    if let Some(c) = count {
        cmd.arg("COUNT").arg(c);
    }
    let positions: Vec<i64> = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(positions.into_iter().map(|p| p as u64).collect())
}

pub async fn hll_pfadd(
    conn: &mut RedisConnection,
    key: String,
    elements: Vec<String>,
) -> Result<bool, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("PFADD");
    cmd.arg(&key);
    for elem in &elements {
        cmd.arg(elem);
    }
    let result: i64 = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(result != 0)
}

