#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisGeoMember {
    pub member: String,
    pub longitude: f64,
    pub latitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisGeoPosition {
    pub longitude: f64,
    pub latitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisGeoSearchResult {
    pub member: String,
    pub distance: Option<f64>,
    pub hash: Option<u64>,
    pub position: Option<RedisGeoPosition>,
}

pub async fn geo_add(
    conn: &mut RedisConnection,
    key: String,
    members: Vec<RedisGeoMember>,
) -> Result<i64, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("GEOADD");
    cmd.arg(&key);
    for m in &members {
        cmd.arg(m.longitude).arg(m.latitude).arg(&m.member);
    }
    let result: i64 = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(result)
}

pub async fn geo_pos(
    conn: &mut RedisConnection,
    key: String,
    members: Vec<String>,
) -> Result<Vec<Option<RedisGeoPosition>>, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("GEOPOS");
    cmd.arg(&key);
    for m in &members {
        cmd.arg(m);
    }
    let positions: Vec<Option<(f64, f64)>> = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(positions
        .into_iter()
        .map(|p| {
            p.map(|(lon, lat)| RedisGeoPosition {
                longitude: lon,
                latitude: lat,
            })
        })
        .collect())
}

pub async fn geo_dist(
    conn: &mut RedisConnection,
    key: String,
    member1: String,
    member2: String,
    unit: Option<String>,
) -> Result<f64, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("GEODIST");
    cmd.arg(&key).arg(&member1).arg(&member2);
    if let Some(u) = unit {
        cmd.arg(u);
    }
    let result: f64 = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;
    Ok(result)
}

pub async fn geo_search(
    conn: &mut RedisConnection,
    key: String,
    member: Option<String>,
    longitude: Option<f64>,
    latitude: Option<f64>,
    radius: f64,
    unit: String,
    with_coord: bool,
    with_dist: bool,
    with_hash: bool,
    count: Option<u64>,
) -> Result<Vec<RedisGeoSearchResult>, String> {
    validate_key(&key)?;
    let mut cmd = redis::cmd("GEOSEARCH");
    cmd.arg(&key);

    if let Some(m) = member {
        cmd.arg("FROMMEMBER").arg(m);
    } else if let (Some(lon), Some(lat)) = (longitude, latitude) {
        cmd.arg("FROMLONLAT").arg(lon).arg(lat);
    } else {
        return Err(
            "[VALIDATION_ERROR] Either member or longitude+latitude is required".to_string(),
        );
    }

    cmd.arg("BYRADIUS").arg(radius).arg(&unit);

    if with_coord || with_dist || with_hash {
        cmd.arg("WITHCOORD").arg("WITHDIST").arg("WITHHASH");
    }

    if let Some(c) = count {
        cmd.arg("COUNT").arg(c);
    }

    let results: Value = conn
        .query(cmd)
        .await
        .map_err(|e| error::to_command_string(e))?;

    let arr = match results {
        Value::Array(a) => a,
        _ => return Ok(Vec::new()),
    };

    let mut output = Vec::new();
    for item in arr {
        if let Value::Array(inner) = item {
            if inner.is_empty() {
                continue;
            }
            let member_name =
                from_redis_value::<String>(&inner[0]).map_err(|e| error::to_command_string(e))?;
            let mut result = RedisGeoSearchResult {
                member: member_name,
                distance: None,
                hash: None,
                position: None,
            };
            if inner.len() > 1 {
                if let Ok(dist) = from_redis_value::<f64>(&inner[1]) {
                    result.distance = Some(dist);
                }
            }
            if inner.len() > 2 {
                if let Ok(hash) = from_redis_value::<u64>(&inner[2]) {
                    result.hash = Some(hash);
                }
            }
            if inner.len() > 3 {
                if let Value::Array(coord) = &inner[3] {
                    if coord.len() >= 2 {
                        if let (Ok(lon), Ok(lat)) = (
                            from_redis_value::<f64>(&coord[0]),
                            from_redis_value::<f64>(&coord[1]),
                        ) {
                            result.position = Some(RedisGeoPosition {
                                longitude: lon,
                                latitude: lat,
                            });
                        }
                    }
                }
            }
            output.push(result);
        }
    }
    Ok(output)
}
