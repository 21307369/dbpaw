import { describe, expect, test } from "bun:test";
import { invokeMock } from "./mocks";

describe("MongoDB模块", () => {
  test("mongodb_test_connection - 测试连接", async () => {
    const result = await invokeMock<any>("mongodb_test_connection", { id: 1 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("version");
  });

  test("mongodb_test_connection_ephemeral - 测试临时连接", async () => {
    const result = await invokeMock<any>("mongodb_test_connection_ephemeral", {
      form: {
        driver: "mongodb",
        host: "localhost",
        port: 27017,
        database: "testdb",
      }
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success");
    expect(result.success).toBe(true);
  });

  test("mongodb_list_databases - 列出数据库", async () => {
    const result = await invokeMock<any[]>("mongodb_list_databases", { id: 1 });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
  });

  test("mongodb_list_collections - 列出集合", async () => {
    const result = await invokeMock<any[]>("mongodb_list_collections", {
      id: 1,
      database: "testdb"
    });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("name");
  });
});
