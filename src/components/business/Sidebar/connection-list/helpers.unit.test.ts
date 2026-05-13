import { describe, expect, test } from "bun:test";
import {
  sanitizeConnectionErrorMessage,
  getExportDefaultName,
  getExportFilter,
  getConnectionStatusLabel,
  mergeConnections,
  type ConnectionLike,
} from "./helpers";

describe("sanitizeConnectionErrorMessage", () => {
  test("strips leading bracketed tags", () => {
    expect(sanitizeConnectionErrorMessage("[ERROR] connection refused")).toBe(
      "connection refused",
    );
  });

  test("strips multiple consecutive bracketed tags", () => {
    expect(
      sanitizeConnectionErrorMessage("[DB][CONN] authentication failed"),
    ).toBe("authentication failed");
  });

  test("leaves messages without leading tags unchanged", () => {
    expect(sanitizeConnectionErrorMessage("timeout after 30s")).toBe(
      "timeout after 30s",
    );
  });

  test("trims whitespace after stripping tags", () => {
    expect(sanitizeConnectionErrorMessage("[TAG]   message  ")).toBe("message");
  });

  test("returns empty string for empty input", () => {
    expect(sanitizeConnectionErrorMessage("")).toBe("");
  });

  test("does not strip tags that appear mid-message", () => {
    expect(
      sanitizeConnectionErrorMessage("failed: [REASON] bad password"),
    ).toBe("failed: [REASON] bad password");
  });
});

describe("getExportDefaultName", () => {
  test("uses .csv extension for csv format", () => {
    const name = getExportDefaultName("users", "csv");
    expect(name).toMatch(/^users_.*\.csv$/);
  });

  test("uses .json extension for json format", () => {
    const name = getExportDefaultName("orders", "json");
    expect(name).toMatch(/^orders_.*\.json$/);
  });

  test("uses .sql extension for sql_dml format", () => {
    const name = getExportDefaultName("users", "sql_dml");
    expect(name).toMatch(/^users_.*\.sql$/);
  });

  test("uses .sql extension for sql_ddl format", () => {
    const name = getExportDefaultName("users", "sql_ddl");
    expect(name).toMatch(/^users_.*\.sql$/);
  });

  test("uses .sql extension for sql_full format", () => {
    const name = getExportDefaultName("users", "sql_full");
    expect(name).toMatch(/^users_.*\.sql$/);
  });

  test("includes table name as prefix", () => {
    const name = getExportDefaultName("my_table", "sql_dml");
    expect(name.startsWith("my_table_")).toBe(true);
  });

  test("supports database names for sql export defaults", () => {
    const name = getExportDefaultName("analytics", "sql_full");
    expect(name).toMatch(/^analytics_.*\.sql$/);
  });

  test("supports export mode suffixes in generated names", () => {
    const name = getExportDefaultName("analytics_ddl", "sql_ddl");
    expect(name).toMatch(/^analytics_ddl_.*\.sql$/);
  });
});

describe("getExportFilter", () => {
  test("returns csv filter for csv format", () => {
    const filter = getExportFilter("csv");
    expect(filter).toEqual([{ name: "CSV", extensions: ["csv"] }]);
  });

  test("returns json filter for json format", () => {
    const filter = getExportFilter("json");
    expect(filter).toEqual([{ name: "JSON", extensions: ["json"] }]);
  });

  test("returns sql filter for sql_dml format", () => {
    const filter = getExportFilter("sql_dml");
    expect(filter).toEqual([{ name: "SQL", extensions: ["sql"] }]);
  });

  test("returns sql filter for sql_ddl format", () => {
    const filter = getExportFilter("sql_ddl");
    expect(filter).toEqual([{ name: "SQL", extensions: ["sql"] }]);
  });

  test("returns sql filter for sql_full format", () => {
    const filter = getExportFilter("sql_full");
    expect(filter).toEqual([{ name: "SQL", extensions: ["sql"] }]);
  });
});

describe("getConnectionStatusLabel", () => {
  test("returns 'Connected' for success state", () => {
    expect(getConnectionStatusLabel({ connectState: "success" })).toBe(
      "Connected",
    );
  });

  test("returns 'Connection failed' for error state without message", () => {
    expect(getConnectionStatusLabel({ connectState: "error" })).toBe(
      "Connection failed",
    );
  });

  test("includes error message when provided", () => {
    expect(
      getConnectionStatusLabel({
        connectState: "error",
        connectError: "timeout",
      }),
    ).toBe("Connection failed: timeout");
  });

  test("returns 'Connecting' for connecting state", () => {
    expect(getConnectionStatusLabel({ connectState: "connecting" })).toBe(
      "Connecting",
    );
  });

  test("returns 'Not connected' for idle state", () => {
    expect(getConnectionStatusLabel({ connectState: "idle" })).toBe(
      "Not connected",
    );
  });
});

describe("mergeConnections", () => {
  const makeConnection = (
    id: string,
    overrides: Partial<ConnectionLike> = {},
  ): ConnectionLike => ({
    id,
    databases: [],
    connectState: "idle",
    isConnected: false,
    ...overrides,
  });

  test("preserves databases from previous connections", () => {
    const prev = [
      makeConnection("1", {
        databases: [{ name: "db1" }, { name: "db2" }],
        connectState: "success",
        isConnected: true,
      }),
    ];
    const next = [makeConnection("1")];

    const result = mergeConnections(next, prev);
    expect(result[0].databases).toEqual([{ name: "db1" }, { name: "db2" }]);
  });

  test("preserves connectState from previous connections", () => {
    const prev = [
      makeConnection("1", { connectState: "success", isConnected: true }),
    ];
    const next = [makeConnection("1", { connectState: "idle" })];

    const result = mergeConnections(next, prev);
    expect(result[0].connectState).toBe("success");
    expect(result[0].isConnected).toBe(true);
  });

  test("uses new connection data when no previous match exists", () => {
    const prev = [makeConnection("1", { databases: [{ name: "old_db" }] })];
    const next = [makeConnection("2")];

    const result = mergeConnections(next, prev);
    expect(result[0].id).toBe("2");
    expect(result[0].databases).toEqual([]);
    expect(result[0].connectState).toBe("idle");
  });

  test("updates metadata from new connection while preserving state", () => {
    const prev = [
      makeConnection("1", {
        databases: [{ name: "db1" }],
        connectState: "success",
        isConnected: true,
      }),
    ];
    const next = [makeConnection("1")];

    const result = mergeConnections(next, prev);
    expect(result[0].databases).toEqual([{ name: "db1" }]);
    expect(result[0].connectState).toBe("success");
    expect(result[0].isConnected).toBe(true);
  });

  test("handles multiple connections correctly", () => {
    const prev = [
      makeConnection("1", {
        databases: [{ name: "db1" }],
        connectState: "success",
        isConnected: true,
      }),
      makeConnection("2", {
        connectState: "error",
        isConnected: false,
      }),
    ];
    const next = [
      makeConnection("1"),
      makeConnection("2"),
      makeConnection("3"),
    ];

    const result = mergeConnections(next, prev);
    expect(result).toHaveLength(3);
    expect(result[0].databases).toEqual([{ name: "db1" }]);
    expect(result[0].connectState).toBe("success");
    expect(result[1].connectState).toBe("error");
    expect(result[2].databases).toEqual([]);
    expect(result[2].connectState).toBe("idle");
  });

  test("handles empty previous connections", () => {
    const next = [makeConnection("1")];
    const result = mergeConnections(next, []);
    expect(result).toHaveLength(1);
    expect(result[0].databases).toEqual([]);
  });

  test("handles empty new connections", () => {
    const prev = [makeConnection("1")];
    const result = mergeConnections([], prev);
    expect(result).toHaveLength(0);
  });
});
