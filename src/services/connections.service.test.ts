import { describe, expect, test } from "bun:test";
import { invokeMock } from "./mocks";

describe("Connections模块", () => {
  test("get_connections - 获取连接列表", async () => {
    const result = await invokeMock<any[]>("get_connections");
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("dbType");
  });

  test("create_connection - 创建连接", async () => {
    const result = await invokeMock<any>("create_connection", {
      form: {
        driver: "postgres",
        name: "Test Connection",
        host: "localhost",
        port: 5432,
        database: "testdb",
        username: "postgres",
      }
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
    expect(result.name).toBe("Test Connection");
  });

  test("update_connection - 更新连接", async () => {
    const result = await invokeMock<any>("update_connection", {
      id: 1,
      form: {
        driver: "postgres",
        name: "Updated Connection",
        host: "localhost",
        port: 5432,
        database: "testdb",
        username: "postgres",
      }
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
    expect(result.name).toBe("Updated Connection");
  });

  test("delete_connection - 删除连接", async () => {
    const result = await invokeMock<void>("delete_connection", { id: 1 });
    expect(result).toBeDefined();
  });

  test("create_database_by_id - 创建数据库", async () => {
    const result = await invokeMock<void>("create_database_by_id", {
      id: 1,
      payload: { name: "new_database" }
    });
    expect(result).toBeDefined();
  });

  test("get_mysql_charsets_by_id - 获取MySQL字符集", async () => {
    const result = await invokeMock<string[]>("get_mysql_charsets_by_id", { id: 1 });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("utf8mb4");
  });

  test("get_mysql_collations_by_id - 获取MySQL排序规则", async () => {
    const result = await invokeMock<string[]>("get_mysql_collations_by_id", {
      id: 1,
      charset: "utf8mb4"
    });
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test("test_connection_ephemeral - 测试临时连接", async () => {
    const result = await invokeMock<any>("test_connection_ephemeral", {
      form: {
        driver: "postgres",
        host: "localhost",
        port: 5432,
        database: "testdb",
        username: "postgres",
      }
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");
    expect(result.success).toBe(true);
  });
});
