import { describe, expect, test } from "bun:test";
import { quoteIdentifier } from "./quote";
import type { DbDriver } from "./createTable";

describe("quoteIdentifier", () => {
  test.each([
    ["mysql", "`user table`"],
    ["mariadb", "`user table`"],
    ["tidb", "`user table`"],
    ["starrocks", "`user table`"],
    ["clickhouse", "`user table`"],
    ["mssql", "[user table]"],
    ["postgres", '"user table"'],
    ["sqlite", '"user table"'],
    ["duckdb", '"user table"'],
    ["oracle", '"user table"'],
  ] satisfies [DbDriver, string][])(
    "quotes identifiers for %s",
    (driver, expected) => {
      expect(quoteIdentifier("user table", driver)).toBe(expected);
    },
  );
});
