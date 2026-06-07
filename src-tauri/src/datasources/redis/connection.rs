fn parse_host_port(raw: &str, fallback_port: i64) -> Result<(String, i64), String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("[VALIDATION_ERROR] Redis host is required".to_string());
    }
    if trimmed.starts_with('[') {
        return Ok((trimmed.to_string(), fallback_port));
    }
    let mut parts = trimmed.rsplitn(2, ':');
    let port_part = parts.next().unwrap_or_default();
    let host_part = parts.next();
    if let Some(host) = host_part {
        if !host.is_empty() && port_part.chars().all(|c| c.is_ascii_digit()) {
            let port = port_part
                .parse::<i64>()
                .map_err(|_| "[VALIDATION_ERROR] Redis port is invalid".to_string())?;
            return Ok((host.to_string(), port));
        }
    }
    Ok((trimmed.to_string(), fallback_port))
}

fn build_connection_info_for_host(
    form: &ConnectionForm,
    host: &str,
    db: i64,
) -> Result<ConnectionInfo, String> {
    let (host, port) = parse_host_port(host, form.port.unwrap_or(DEFAULT_REDIS_PORT))?;
    if !(1..=65535).contains(&port) {
        return Err("[VALIDATION_ERROR] Redis port must be between 1 and 65535".to_string());
    }

    let addr = if form.ssl.unwrap_or(false) {
        ConnectionAddr::TcpTls {
            host,
            port: port as u16,
            insecure: false,
            tls_params: None,
        }
    } else {
        ConnectionAddr::Tcp(host, port as u16)
    };

    Ok(ConnectionInfo {
        addr,
        redis: RedisConnectionInfo {
            db,
            username: form
                .username
                .as_deref()
                .filter(|v| !v.is_empty())
                .map(str::to_string),
            password: form
                .password
                .as_deref()
                .filter(|v| !v.is_empty())
                .map(str::to_string),
            protocol: ProtocolVersion::RESP2,
        },
    })
}

fn build_connection_info(form: &ConnectionForm, db: i64) -> Result<ConnectionInfo, String> {
    let host = if let Some(seed_nodes) = form.seed_nodes.as_ref() {
        seed_nodes
            .first()
            .cloned()
            .or_else(|| form.host.clone())
            .ok_or_else(|| "[VALIDATION_ERROR] Redis host is required".to_string())?
    } else {
        form.host
            .clone()
            .ok_or_else(|| "[VALIDATION_ERROR] Redis host is required".to_string())?
    };
    build_connection_info_for_host(form, &host, db)
}

fn build_cluster_nodes(form: &ConnectionForm) -> Result<Vec<ConnectionInfo>, String> {
    let db = selected_database(form, None)?;
    if db != 0 {
        return Err("[VALIDATION_ERROR] Redis Cluster only supports database 0".to_string());
    }
    let nodes: Vec<ConnectionInfo> = form
        .seed_nodes
        .clone()
        .or_else(|| {
            form.host.as_deref().map(|host| {
                host.split(',')
                    .map(str::trim)
                    .filter(|part| !part.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
        })
        .unwrap_or_default()
        .into_iter()
        .map(|part| build_connection_info_for_host(form, &part, 0))
        .collect::<Result<_, _>>()?;
    if nodes.len() < 2 {
        return Err(
            "[VALIDATION_ERROR] Redis Cluster requires at least two seed nodes".to_string(),
        );
    }
    Ok(nodes)
}

fn build_sentinel_node_info(form: &ConnectionForm, db: i64) -> SentinelNodeConnectionInfo {
    let tls_mode = if form.ssl.unwrap_or(false) {
        Some(TlsMode::Secure)
    } else {
        None
    };
    let username = form
        .username
        .as_deref()
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    let password = form
        .password
        .as_deref()
        .filter(|v| !v.is_empty())
        .map(str::to_string);
    SentinelNodeConnectionInfo {
        tls_mode,
        redis_connection_info: Some(RedisConnectionInfo {
            db,
            username,
            password,
            protocol: ProtocolVersion::RESP2,
        }),
    }
}

pub async fn connect(
    form: &ConnectionForm,
    database: Option<&str>,
) -> Result<RedisConnection, String> {
    if is_sentinel_form(form) {
        let sentinel_nodes = form
            .sentinels
            .clone()
            .ok_or("[VALIDATION_ERROR] Sentinel nodes required")?;
        let service_name = form
            .service_name
            .clone()
            .unwrap_or_else(|| "mymaster".to_string());
        let db = selected_database(form, database)?;
        let node_info = build_sentinel_node_info(form, db);

        // Build sentinel node URLs with optional sentinel password
        let sentinel_password = form.sentinel_password.as_deref().filter(|v| !v.is_empty());
        let sentinel_urls: Vec<String> = sentinel_nodes
            .iter()
            .map(|node| {
                if let Some(password) = sentinel_password {
                    format!("redis://:{}@{}", password, node)
                } else {
                    format!("redis://{}", node)
                }
            })
            .collect();

        let mut sentinel = Sentinel::build(sentinel_urls).map_err(|e| conn_failed_error(&e))?;

        let client = sentinel
            .async_master_for(&service_name, Some(&node_info))
            .await
            .map_err(|e| conn_failed_error(&e))?;

        let config = AsyncConnectionConfig::new().set_connection_timeout(connect_timeout(form));
        let conn = client
            .get_multiplexed_async_connection_with_config(&config)
            .await
            .map_err(|e| conn_failed_error(&e))?;
        return Ok(RedisConnection::Standalone(conn));
    }

    if is_cluster_form(form) {
        if let Some(db) = database {
            if parse_database(Some(db))? != 0 {
                return Err("[VALIDATION_ERROR] Redis Cluster only supports database 0".to_string());
            }
        }
        let nodes = build_cluster_nodes(form)?;
        let client = ClusterClient::builder(nodes)
            .connection_timeout(connect_timeout(form))
            .build()
            .map_err(|e| conn_failed_error(&e))?;
        let conn = client
            .get_async_connection()
            .await
            .map_err(|e| conn_failed_error(&e))?;
        return Ok(RedisConnection::Cluster(Arc::new(TokioMutex::new(conn))));
    }

    let db = selected_database(form, database)?;
    let info = build_connection_info(form, db)?;
    let client = redis::Client::open(info).map_err(|e| conn_failed_error(&e))?;
    let config = AsyncConnectionConfig::new().set_connection_timeout(connect_timeout(form));
    let conn = client
        .get_multiplexed_async_connection_with_config(&config)
        .await
        .map_err(|e| conn_failed_error(&e))?;
    Ok(RedisConnection::Standalone(conn))
}

async fn query_on<T: FromRedisValue, C: ConnectionLike + Send + Sync>(
    conn: &mut C,
    cmd: Cmd,
) -> Result<T, String> {
    cmd.query_async::<T>(conn)
        .await
        .map_err(|e| error::to_command_string(e))
}

pub async fn ping(conn: &mut RedisConnection) -> Result<(), String> {
    conn.query::<String>(redis::cmd("PING"))
        .await
        .map(|_| ())
        .map_err(|e| conn_failed_error(&e))
}

pub fn list_databases(
    form: &ConnectionForm,
    db_count: i64,
) -> Result<Vec<RedisDatabaseInfo>, String> {
    if is_cluster_form(form) {
        build_cluster_nodes(form)?;
        return Ok(vec![RedisDatabaseInfo {
            index: 0,
            name: "db0".to_string(),
            selected: true,
            key_count: None,
        }]);
    }

    // Sentinel resolves to a master node, so database selection works like standalone.
    let selected = selected_database(form, None)?;
    let db_count = db_count.clamp(1, 256);
    Ok((0..db_count)
        .map(|index| RedisDatabaseInfo {
            index,
            name: format!("db{index}"),
            selected: index == selected,
            key_count: None,
        })
        .collect())
}

pub async fn server_info(conn: &mut RedisConnection) -> Result<RedisServerInfo, String> {
    let info_str: String = conn
        .query(redis::cmd("INFO"))
        .await
        .map_err(|e| error::to_command_string(e))?;

    let mut sections: HashMap<String, HashMap<String, String>> = HashMap::new();
    let mut current_section = String::new();

    for line in info_str.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            if let Some(name) = line.strip_prefix("# ") {
                current_section = name.to_string();
            }
            continue;
        }
        if let Some((key, value)) = line.split_once(':') {
            sections
                .entry(current_section.clone())
                .or_default()
                .insert(key.to_string(), value.to_string());
        }
    }

    let dbsize: u64 = conn
        .query(redis::cmd("DBSIZE"))
        .await
        .map_err(|e| error::to_command_string(e))?;

    Ok(RedisServerInfo { sections, dbsize })
}

pub async fn server_config(conn: &mut RedisConnection) -> Result<HashMap<String, String>, String> {
    let mut cmd = redis::cmd("CONFIG");
    cmd.arg("GET").arg("*");
    let values: Vec<String> = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;

    let mut config = HashMap::new();
    let mut iter = values.into_iter();
    while let Some(key) = iter.next() {
        if let Some(value) = iter.next() {
            config.insert(key, value);
        }
    }
    Ok(config)
}

pub async fn slowlog_get(
    conn: &mut RedisConnection,
    count: i64,
) -> Result<Vec<RedisSlowlogEntry>, String> {
    let mut cmd = redis::cmd("SLOWLOG");
    cmd.arg("GET").arg(count.max(1));
    let raw: Vec<Vec<Value>> = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;

    let mut entries = Vec::new();
    for item in raw {
        if item.len() < 4 {
            continue;
        }
        let id = match &item[0] {
            Value::Int(v) => *v as u64,
            _ => continue,
        };
        let timestamp = match &item[1] {
            Value::Int(v) => *v,
            _ => continue,
        };
        let duration_ms = match &item[2] {
            Value::Int(v) => *v as u64,
            _ => continue,
        };
        let command = match &item[3] {
            Value::Array(parts) => parts
                .iter()
                .filter_map(|p| match p {
                    Value::BulkString(b) => String::from_utf8(b.clone()).ok(),
                    Value::SimpleString(s) => Some(s.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join(" "),
            _ => format!("{:?}", item[3]),
        };
        entries.push(RedisSlowlogEntry {
            id,
            timestamp,
            duration_ms,
            command,
        });
    }
    Ok(entries)
}
