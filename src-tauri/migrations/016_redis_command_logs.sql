CREATE TABLE IF NOT EXISTS redis_command_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command TEXT NOT NULL,
  connection_id INTEGER,
  database TEXT,
  success INTEGER NOT NULL,
  error TEXT,
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_redis_command_logs_executed_at
ON redis_command_logs (executed_at DESC);
