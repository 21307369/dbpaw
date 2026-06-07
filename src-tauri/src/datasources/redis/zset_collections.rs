pub async fn zrangebyscore(
    conn: &mut RedisConnection,
    key: String,
    min: String,
    max: String,
    offset: Option<u64>,
    limit: Option<u64>,
) -> Result<RedisZRangeByScoreResult, String> {
    validate_key(&key)?;

    let mut count_cmd = redis::cmd("ZCOUNT");
    count_cmd.arg(&key).arg(&min).arg(&max);
    let total: u64 = conn.query(count_cmd).await?;

    let mut cmd = redis::cmd("ZRANGEBYSCORE");
    cmd.arg(&key).arg(&min).arg(&max).arg("WITHSCORES");
    if let (Some(off), Some(lim)) = (offset, limit) {
        cmd.arg("LIMIT").arg(off).arg(lim);
    }
    let raw: Vec<String> = conn.query(cmd).await?;

    let mut members = Vec::new();
    let mut iter = raw.iter();
    while let Some(member) = iter.next() {
        if let Some(score_str) = iter.next() {
            let score: f64 = score_str
                .parse()
                .map_err(|_| format!("[REDIS_ERROR] Cannot parse score: {score_str}"))?;
            members.push(RedisZSetMember {
                member: member.clone(),
                score,
            });
        }
    }

    Ok(RedisZRangeByScoreResult { members, total })
}

pub async fn zrank(
    conn: &mut RedisConnection,
    key: String,
    member: String,
    reverse: bool,
) -> Result<Option<i64>, String> {
    validate_key(&key)?;

    let cmd_name = if reverse { "ZREVRANK" } else { "ZRANK" };
    let mut cmd = redis::cmd(cmd_name);
    cmd.arg(&key).arg(&member);
    let rank: Option<i64> = conn.query(cmd).await?;

    Ok(rank)
}

pub async fn zscore(
    conn: &mut RedisConnection,
    key: String,
    member: String,
) -> Result<Option<f64>, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("ZSCORE");
    cmd.arg(&key).arg(&member);
    let score: Option<f64> = conn.query(cmd).await?;

    Ok(score)
}

pub async fn zmscore(
    conn: &mut RedisConnection,
    key: String,
    members: Vec<String>,
) -> Result<Vec<Option<f64>>, String> {
    validate_key(&key)?;
    if members.is_empty() {
        return Err("[VALIDATION_ERROR] At least one member is required".to_string());
    }

    let mut cmd = redis::cmd("ZMSCORE");
    cmd.arg(&key);
    for m in &members {
        cmd.arg(m);
    }
    let scores: Vec<Option<f64>> = conn.query(cmd).await?;

    Ok(scores)
}

pub async fn zrangebylex(
    conn: &mut RedisConnection,
    key: String,
    min: String,
    max: String,
    offset: Option<u64>,
    limit: Option<u64>,
) -> Result<RedisZRangeByLexResult, String> {
    validate_key(&key)?;

    let mut count_cmd = redis::cmd("ZLEXCOUNT");
    count_cmd.arg(&key).arg(&min).arg(&max);
    let total: u64 = conn.query(count_cmd).await?;

    let mut cmd = redis::cmd("ZRANGEBYLEX");
    cmd.arg(&key).arg(&min).arg(&max);
    if let (Some(off), Some(lim)) = (offset, limit) {
        cmd.arg("LIMIT").arg(off).arg(lim);
    }
    let members: Vec<String> = conn.query(cmd).await?;

    Ok(RedisZRangeByLexResult { members, total })
}

pub async fn zlexcount(
    conn: &mut RedisConnection,
    key: String,
    min: String,
    max: String,
) -> Result<u64, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("ZLEXCOUNT");
    cmd.arg(&key).arg(&min).arg(&max);
    let count: u64 = conn.query(cmd).await?;

    Ok(count)
}

pub async fn zpopmin(
    conn: &mut RedisConnection,
    key: String,
    count: Option<u64>,
) -> Result<Vec<RedisZSetMember>, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("ZPOPMIN");
    cmd.arg(&key);
    if let Some(c) = count {
        cmd.arg(c);
    }
    let raw: Vec<String> = conn.query(cmd).await?;

    let mut members = Vec::new();
    let mut iter = raw.iter();
    while let Some(member) = iter.next() {
        if let Some(score_str) = iter.next() {
            let score: f64 = score_str
                .parse()
                .map_err(|_| format!("[REDIS_ERROR] Cannot parse score: {score_str}"))?;
            members.push(RedisZSetMember {
                member: member.clone(),
                score,
            });
        }
    }

    Ok(members)
}

pub async fn zpopmax(
    conn: &mut RedisConnection,
    key: String,
    count: Option<u64>,
) -> Result<Vec<RedisZSetMember>, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("ZPOPMAX");
    cmd.arg(&key);
    if let Some(c) = count {
        cmd.arg(c);
    }
    let raw: Vec<String> = conn.query(cmd).await?;

    let mut members = Vec::new();
    let mut iter = raw.iter();
    while let Some(member) = iter.next() {
        if let Some(score_str) = iter.next() {
            let score: f64 = score_str
                .parse()
                .map_err(|_| format!("[REDIS_ERROR] Cannot parse score: {score_str}"))?;
            members.push(RedisZSetMember {
                member: member.clone(),
                score,
            });
        }
    }

    Ok(members)
}

pub async fn set_operation(
    conn: &mut RedisConnection,
    keys: Vec<String>,
    op: RedisSetOperation,
) -> Result<Vec<String>, String> {
    if keys.is_empty() {
        return Err("[VALIDATION_ERROR] At least one key is required".to_string());
    }
    for k in &keys {
        validate_key(k)?;
    }

    let cmd_name = match op {
        RedisSetOperation::Inter => "SINTER",
        RedisSetOperation::Union => "SUNION",
        RedisSetOperation::Diff => "SDIFF",
    };
    let mut cmd = redis::cmd(cmd_name);
    for k in &keys {
        cmd.arg(k);
    }
    let members: Vec<String> = conn.query(cmd).await?;

    Ok(members)
}

pub async fn sismember(
    conn: &mut RedisConnection,
    key: String,
    member: String,
) -> Result<bool, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("SISMEMBER");
    cmd.arg(&key).arg(&member);
    let exists: bool = conn.query(cmd).await?;

    Ok(exists)
}

pub async fn smove(
    conn: &mut RedisConnection,
    source: String,
    destination: String,
    member: String,
) -> Result<bool, String> {
    validate_key(&source)?;
    validate_key(&destination)?;

    let mut cmd = redis::cmd("SMOVE");
    cmd.arg(&source).arg(&destination).arg(&member);
    let moved: bool = conn.query(cmd).await?;

    Ok(moved)
}

// ── List advanced operations ────────────────────────────────────────────────

pub async fn lindex(
    conn: &mut RedisConnection,
    key: String,
    index: i64,
) -> Result<Option<String>, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("LINDEX");
    cmd.arg(&key).arg(index);
    let value: Option<String> = conn.query(cmd).await?;

    Ok(value)
}

pub async fn lpos(
    conn: &mut RedisConnection,
    key: String,
    element: String,
    rank: Option<i64>,
    count: Option<u64>,
    maxlen: Option<u64>,
) -> Result<Vec<i64>, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("LPOS");
    cmd.arg(&key).arg(&element);
    if let Some(r) = rank {
        cmd.arg("RANK").arg(r);
    }
    // Always send COUNT so Redis returns an array (not a bare integer).
    // Default to 1 when caller omits count.
    cmd.arg("COUNT").arg(count.unwrap_or(1));
    if let Some(ml) = maxlen {
        cmd.arg("MAXLEN").arg(ml);
    }
    let positions: Vec<i64> = conn.query(cmd).await?;

    Ok(positions)
}

pub async fn ltrim(
    conn: &mut RedisConnection,
    key: String,
    start: i64,
    stop: i64,
) -> Result<bool, String> {
    validate_key(&key)?;

    let mut cmd = redis::cmd("LTRIM");
    cmd.arg(&key).arg(start).arg(stop);
    let _: () = conn.query(cmd).await?;

    Ok(true)
}

pub async fn linsert(
    conn: &mut RedisConnection,
    key: String,
    position: RedisLInsertPosition,
    pivot: String,
    element: String,
) -> Result<i64, String> {
    validate_key(&key)?;

    let pos_str = match position {
        RedisLInsertPosition::Before => "BEFORE",
        RedisLInsertPosition::After => "AFTER",
    };
    let mut cmd = redis::cmd("LINSERT");
    cmd.arg(&key).arg(pos_str).arg(&pivot).arg(&element);
    let len: i64 = conn.query(cmd).await?;

    Ok(len)
}

pub async fn lmove(
    conn: &mut RedisConnection,
    source: String,
    destination: String,
    src_direction: RedisLMoveDirection,
    dst_direction: RedisLMoveDirection,
) -> Result<Option<String>, String> {
    validate_key(&source)?;
    validate_key(&destination)?;

    let src_dir = match src_direction {
        RedisLMoveDirection::Left => "LEFT",
        RedisLMoveDirection::Right => "RIGHT",
    };
    let dst_dir = match dst_direction {
        RedisLMoveDirection::Left => "LEFT",
        RedisLMoveDirection::Right => "RIGHT",
    };
    let mut cmd = redis::cmd("LMOVE");
    cmd.arg(&source).arg(&destination).arg(src_dir).arg(dst_dir);
    let value: Option<String> = conn.query(cmd).await?;

    Ok(value)
}

// ── Stream Consumer Group operations ────────────────────────────────────────
