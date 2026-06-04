export async function mockRedisListDatabases(_id: number): Promise<any[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [
    { index: 0, name: "0", selected: true, keyCount: 10 },
    { index: 1, name: "1", selected: false, keyCount: 5 },
  ];
}

export async function mockRedisScanKeys(_params: any): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    cursor: "0",
    keys: [
      { key: "user:1", keyType: "string", ttl: -1 },
      { key: "user:2", keyType: "hash", ttl: 3600 },
      { key: "session:abc", keyType: "string", ttl: 1800 },
    ],
    isPartial: false,
  };
}

export async function mockRedisGetKey(
  _id: number,
  _database: string | undefined,
  _key: string,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    key: _key,
    keyType: "string",
    ttl: -1,
    value: { kind: "string", value: "mock-value" },
    valueTotalLen: 11,
    valueOffset: 0,
    isBinary: false,
    extra: null,
    objectEncoding: "raw",
    memoryUsage: 56,
    objectIdletime: 0,
    objectRefcount: 1,
    keyExists: true,
  };
}

export async function mockRedisSetKey(
  _id: number,
  _database: string | undefined,
  _payload: any,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { success: true, affected: 1 };
}

export async function mockRedisDeleteKey(
  _id: number,
  _database: string | undefined,
  _key: string,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { success: true, affected: 1 };
}

export async function mockRedisRenameKey(
  _id: number,
  _database: string | undefined,
  _oldKey: string,
  _newKey: string,
  _force?: boolean,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { success: true, affected: 1 };
}

export async function mockRedisSetTtl(
  _id: number,
  _database: string | undefined,
  _key: string,
  _ttlSeconds?: number | null,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { success: true, affected: 1 };
}

export async function mockRedisServerInfo(
  _id: number,
  _database: string | undefined,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    sections: {
      server: {
        redis_version: "7.0.0",
        redis_mode: "standalone",
        os: "Linux",
      },
      stats: {
        total_connections_received: "100",
        total_commands_processed: "1000",
      },
    },
    dbsize: 15,
  };
}

export async function mockRedisServerConfig(
  _id: number,
  _database: string | undefined,
): Promise<Record<string, string>> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    "maxmemory": "1073741824",
    "maxmemory-policy": "allkeys-lru",
    "timeout": "300",
  };
}

export async function mockRedisSlowlogGet(
  _id: number,
  _database: string | undefined,
  _count?: number,
): Promise<any[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return [
    {
      id: 1,
      timestamp: Math.floor(Date.now() / 1000) - 60,
      durationMs: 15,
      command: "KEYS *",
    },
    {
      id: 2,
      timestamp: Math.floor(Date.now() / 1000) - 120,
      durationMs: 25,
      command: "LRANGE mylist 0 -1",
    },
  ];
}

export async function mockRedisExecuteRaw(
  _id: number,
  _database: string | undefined,
  _command: string,
): Promise<any> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { output: "PONG" };
}

export function handleRedis(cmd: string, args?: any): Promise<any> | null {
  switch (cmd) {
    case "redis_list_databases":
      return mockRedisListDatabases(args.id);
    case "redis_scan_keys":
      return mockRedisScanKeys(args);
    case "redis_get_key":
      return mockRedisGetKey(args.id, args.database, args.key);
    case "redis_set_key":
      return mockRedisSetKey(args.id, args.database, args.payload);
    case "redis_delete_key":
      return mockRedisDeleteKey(args.id, args.database, args.key);
    case "redis_rename_key":
      return mockRedisRenameKey(
        args.id,
        args.database,
        args.oldKey,
        args.newKey,
        args.force,
      );
    case "redis_set_ttl":
      return mockRedisSetTtl(
        args.id,
        args.database,
        args.key,
        args.ttlSeconds,
      );
    case "redis_server_info":
      return mockRedisServerInfo(args.id, args.database);
    case "redis_server_config":
      return mockRedisServerConfig(args.id, args.database);
    case "redis_slowlog_get":
      return mockRedisSlowlogGet(args.id, args.database, args.count);
    case "redis_execute_raw":
      return mockRedisExecuteRaw(args.id, args.database, args.command);
    default:
      return null;
  }
}
