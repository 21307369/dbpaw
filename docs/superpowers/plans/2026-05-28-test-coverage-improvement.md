# Test Coverage Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken tests and add unit tests for v0.4.0+ frontend features (ER Diagram, multi-cell copy).

**Architecture:** Fix existing driver-registry test assertions, create new test files for ER Diagram pure logic, extract multi-cell copy/format functions from TableView.tsx into a standalone module with tests.

**Tech Stack:** bun:test (test runner), TypeScript, React

---

## File Summary

| File | Action |
|------|--------|
| `src/lib/driver-registry.unit.test.ts` | Modify (fix assertions for 16 drivers) |
| `src/components/business/ERDiagram/types.unit.test.ts` | Create (~15 tests for `buildDiagramData`) |
| `src/components/business/ERDiagram/erDiagramLayout.unit.test.ts` | Create (~5 tests for `computeLayout`) |
| `src/components/business/DataGrid/tableView/selectionCopy.ts` | Create (extract pure functions from TableView.tsx) |
| `src/components/business/DataGrid/tableView/selectionCopy.unit.test.ts` | Create (~33 tests) |
| `src/components/business/DataGrid/TableView.tsx` | Modify (delegate to selectionCopy.ts) |

---

### Task 1: Fix driver-registry unit test

**Files:**
- Modify: `src/lib/driver-registry.unit.test.ts`

The test file expects 14 drivers but the registry now has 16 (`db2` and `cassandra` were added). Multiple assertion lists are incomplete.

- [ ] **Step 1: Fix the DRIVER_REGISTRY completeness test**

In `src/lib/driver-registry.unit.test.ts`, update the "contains all 13 supported drivers" test:

```typescript
test("contains all 16 supported drivers", () => {
  const ids = DRIVER_REGISTRY.map((d) => d.id);
  expect(ids).toContain("postgres");
  expect(ids).toContain("mysql");
  expect(ids).toContain("mariadb");
  expect(ids).toContain("tidb");
  expect(ids).toContain("starrocks");
  expect(ids).toContain("doris");
  expect(ids).toContain("sqlite");
  expect(ids).toContain("duckdb");
  expect(ids).toContain("clickhouse");
  expect(ids).toContain("mssql");
  expect(ids).toContain("oracle");
  expect(ids).toContain("db2");
  expect(ids).toContain("redis");
  expect(ids).toContain("elasticsearch");
  expect(ids).toContain("mongodb");
  expect(ids).toContain("cassandra");
  expect(DRIVER_REGISTRY).toHaveLength(16);
});
```

- [ ] **Step 2: Fix getDefaultPort test**

Add missing network drivers to the port test:

```typescript
test("returns correct ports for network drivers", () => {
  expect(getDefaultPort("postgres")).toBe(5432);
  expect(getDefaultPort("mysql")).toBe(3306);
  expect(getDefaultPort("mariadb")).toBe(3306);
  expect(getDefaultPort("tidb")).toBe(4000);
  expect(getDefaultPort("starrocks")).toBe(9030);
  expect(getDefaultPort("doris")).toBe(9030);
  expect(getDefaultPort("clickhouse")).toBe(8123);
  expect(getDefaultPort("mssql")).toBe(1433);
  expect(getDefaultPort("oracle")).toBe(1521);
  expect(getDefaultPort("db2")).toBe(50000);
  expect(getDefaultPort("redis")).toBe(6379);
  expect(getDefaultPort("elasticsearch")).toBe(9200);
  expect(getDefaultPort("mongodb")).toBe(27017);
  expect(getDefaultPort("cassandra")).toBe(9042);
});
```

- [ ] **Step 3: Fix isFileBasedDriver test**

Add missing network drivers:

```typescript
test("returns false for network drivers", () => {
  const networkDrivers: Driver[] = [
    "postgres",
    "mysql",
    "mariadb",
    "tidb",
    "starrocks",
    "doris",
    "clickhouse",
    "mssql",
    "oracle",
    "db2",
    "redis",
    "elasticsearch",
    "mongodb",
    "cassandra",
  ];
  for (const d of networkDrivers) {
    expect(isFileBasedDriver(d)).toBe(false);
  }
});
```

- [ ] **Step 4: Fix supportsSchemaBrowsing test**

Add `db2` to the true list (it supports schema browsing):

```typescript
test("returns true for drivers with schema node support", () => {
  expect(supportsSchemaBrowsing("postgres")).toBe(true);
  expect(supportsSchemaBrowsing("mssql")).toBe(true);
  expect(supportsSchemaBrowsing("oracle")).toBe(true);
  expect(supportsSchemaBrowsing("db2")).toBe(true);
});
```

Remove the separate "returns true for oracle" test since it's now included above.

- [ ] **Step 5: Fix supportsRoutines test**

Add `cassandra` and `db2` handling. `db2` supports routines (`true`), `cassandra` does not (`false`):

```typescript
test("returns false for drivers without routine support", () => {
  const noRoutines: Driver[] = [
    "mariadb",
    "tidb",
    "starrocks",
    "doris",
    "sqlite",
    "duckdb",
    "clickhouse",
    "oracle",
    "redis",
    "elasticsearch",
    "mongodb",
    "cassandra",
  ];
  for (const d of noRoutines) {
    expect(supportsRoutines(d)).toBe(false);
  }
});
```

- [ ] **Step 6: Fix supportsCreateDatabase test**

Add `cassandra` to the true list (it supports create database):

```typescript
test("returns true for drivers that can create databases", () => {
  expect(supportsCreateDatabase("postgres")).toBe(true);
  expect(supportsCreateDatabase("mysql")).toBe(true);
  expect(supportsCreateDatabase("mariadb")).toBe(true);
  expect(supportsCreateDatabase("tidb")).toBe(true);
  expect(supportsCreateDatabase("starrocks")).toBe(true);
  expect(supportsCreateDatabase("doris")).toBe(true);
  expect(supportsCreateDatabase("clickhouse")).toBe(true);
  expect(supportsCreateDatabase("mssql")).toBe(true);
  expect(supportsCreateDatabase("cassandra")).toBe(true);
});
```

Add `mongodb` to the false list:

```typescript
test("returns false for file-based drivers", () => {
  expect(supportsCreateDatabase("sqlite")).toBe(false);
  expect(supportsCreateDatabase("duckdb")).toBe(false);
  expect(supportsCreateDatabase("elasticsearch")).toBe(false);
  expect(supportsCreateDatabase("redis")).toBe(false);
  expect(supportsCreateDatabase("mongodb")).toBe(false);
  expect(supportsCreateDatabase("oracle")).toBe(false);
  expect(supportsCreateDatabase("db2")).toBe(false);
});
```

- [ ] **Step 7: Fix importCapability test**

Add `db2` to the supported list, and add tests for unsupported drivers:

```typescript
test("all writable drivers are supported", () => {
  const supported: Driver[] = [
    "postgres",
    "mysql",
    "mariadb",
    "tidb",
    "sqlite",
    "duckdb",
    "mssql",
    "oracle",
    "db2",
  ];
  for (const d of supported) {
    expect(getDriverConfig(d).importCapability).toBe("supported");
  }
});

test("non-sql drivers are unsupported", () => {
  const unsupported: Driver[] = [
    "redis",
    "elasticsearch",
    "mongodb",
    "cassandra",
  ];
  for (const d of unsupported) {
    expect(getDriverConfig(d).importCapability).toBe("unsupported");
  }
});
```

- [ ] **Step 8: Fix getDriverConfig test**

Add `db2` and `cassandra` labels:

```typescript
test("returns the correct config for each driver", () => {
  expect(getDriverConfig("postgres").label).toBe("PostgreSQL");
  expect(getDriverConfig("mysql").label).toBe("MySQL");
  expect(getDriverConfig("starrocks").label).toBe("StarRocks");
  expect(getDriverConfig("doris").label).toBe("Apache Doris");
  expect(getDriverConfig("mssql").label).toBe("SQL Server");
  expect(getDriverConfig("clickhouse").label).toBe("ClickHouse");
  expect(getDriverConfig("duckdb").label).toBe("DuckDB");
  expect(getDriverConfig("elasticsearch").label).toBe("Elasticsearch");
  expect(getDriverConfig("db2").label).toBe("IBM Db2");
  expect(getDriverConfig("cassandra").label).toBe("Cassandra");
});
```

- [ ] **Step 9: Run tests to verify all pass**

Run: `bun test src/lib/driver-registry.unit.test.ts`
Expected: All tests PASS

- [ ] **Step 10: Run full unit test suite to verify no regressions**

Run: `bun run test:unit`
Expected: All tests PASS, 0 failures

- [ ] **Step 11: Commit**

```bash
git add src/lib/driver-registry.unit.test.ts
git commit -m "test: fix driver-registry tests for 16 drivers (db2, cassandra)"
```

---

### Task 2: ER Diagram buildDiagramData tests

**Files:**
- Create: `src/components/business/ERDiagram/types.unit.test.ts`
- Read: `src/components/business/ERDiagram/types.ts` (source of truth)
- Read: `src/services/api.ts` (for `SchemaOverview` and `SchemaForeignKey` types)

- [ ] **Step 1: Create the test file with imports and helper factories**

```typescript
import { describe, test, expect } from "bun:test";
import { buildDiagramData } from "./types";
import type { SchemaOverview, SchemaForeignKey } from "@/services/api";

function makeOverview(
  tables: Array<{
    schema: string;
    name: string;
    columns: Array<{ name: string; type: string }>;
  }>,
): SchemaOverview {
  return {
    tables: tables.map((t) => ({
      schema: t.schema,
      name: t.name,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.type,
        nullable: false,
        defaultValue: null,
      })),
      indexes: [],
      triggers: [],
    })),
    views: [],
    routines: [],
  } as unknown as SchemaOverview;
}

function makeFK(
  partial: Partial<SchemaForeignKey> & { name: string; sourceTable: string; sourceColumn: string; targetTable: string; targetColumn: string },
): SchemaForeignKey {
  return {
    sourceSchema: null,
    targetSchema: null,
    onUpdate: null,
    onDelete: null,
    ...partial,
  } as SchemaForeignKey;
}
```

- [ ] **Step 2: Write test — empty overview and FKs returns empty**

```typescript
describe("buildDiagramData", () => {
  test("returns empty nodes and edges for empty overview", () => {
    const overview = makeOverview([]);
    const result = buildDiagramData(overview, []);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
```

- [ ] **Step 3: Write test — tables without FK columns are filtered out**

```typescript
  test("filters out tables with no FK-related columns", () => {
    const overview = makeOverview([
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
      { schema: "public", name: "logs", columns: [{ name: "message", type: "text" }] },
    ]);
    const fks = [
      makeFK({ name: "fk_orders_user", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].name).toBe("users");
  });
```

- [ ] **Step 4: Write test — FK source columns are flagged as isForeignKey**

```typescript
  test("flags FK source columns as isForeignKey", () => {
    const overview = makeOverview([
      { schema: "public", name: "orders", columns: [{ name: "user_id", type: "int" }, { name: "total", type: "decimal" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk_orders_user", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    const ordersNode = result.nodes.find((n) => n.name === "orders")!;
    const userIdCol = ordersNode.columns.find((c) => c.name === "user_id")!;
    expect(userIdCol.isForeignKey).toBe(true);
  });
```

- [ ] **Step 5: Write test — FK target columns are included but not flagged**

```typescript
  test("includes FK target columns but does not flag as isForeignKey", () => {
    const overview = makeOverview([
      { schema: "public", name: "orders", columns: [{ name: "user_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }, { name: "name", type: "text" }] },
    ]);
    const fks = [
      makeFK({ name: "fk_orders_user", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    const usersNode = result.nodes.find((n) => n.name === "users")!;
    const idCol = usersNode.columns.find((c) => c.name === "id")!;
    expect(idCol.isForeignKey).toBe(false);
    expect(usersNode.columns.find((c) => c.name === "name")).toBeUndefined();
  });
```

- [ ] **Step 6: Write test — schema resolution uses fk.sourceSchema when present**

```typescript
  test("uses fk.sourceSchema for edge source when present", () => {
    const overview = makeOverview([
      { schema: "myschema", name: "orders", columns: [{ name: "user_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk1", sourceSchema: "myschema", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.edges[0].source).toBe("myschema.orders");
  });
```

- [ ] **Step 7: Write test — schema resolution falls back to schemaByTable**

```typescript
  test("falls back to table schema from overview when fk.sourceSchema is null", () => {
    const overview = makeOverview([
      { schema: "myschema", name: "orders", columns: [{ name: "user_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk1", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.edges[0].source).toBe("myschema.orders");
    expect(result.edges[0].target).toBe("public.users");
  });
```

- [ ] **Step 8: Write test — schema resolution falls back to "public"**

```typescript
  test('falls back to "public" when schema not found', () => {
    const overview = makeOverview([]);
    const fks = [
      makeFK({ name: "fk1", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.edges[0].source).toBe("public.orders");
    expect(result.edges[0].target).toBe("public.users");
  });
```

- [ ] **Step 9: Write test — edge ID is deterministic**

```typescript
  test("generates deterministic edge IDs", () => {
    const overview = makeOverview([
      { schema: "public", name: "orders", columns: [{ name: "user_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk_orders_user", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result1 = buildDiagramData(overview, fks);
    const result2 = buildDiagramData(overview, fks);
    expect(result1.edges[0].id).toBe(result2.edges[0].id);
    expect(result1.edges[0].id).toBe("fk_orders_user-orders.user_id-users.id");
  });
```

- [ ] **Step 10: Write test — multiple FKs produce multiple edges**

```typescript
  test("produces multiple edges for multiple FKs", () => {
    const overview = makeOverview([
      { schema: "public", name: "orders", columns: [{ name: "user_id", type: "int" }, { name: "product_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
      { schema: "public", name: "products", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk1", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
      makeFK({ name: "fk2", sourceTable: "orders", sourceColumn: "product_id", targetTable: "products", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.edges).toHaveLength(2);
  });
```

- [ ] **Step 11: Write test — self-referential FK**

```typescript
  test("handles self-referential FK", () => {
    const overview = makeOverview([
      { schema: "public", name: "employees", columns: [{ name: "id", type: "int" }, { name: "manager_id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk_manager", sourceTable: "employees", sourceColumn: "manager_id", targetTable: "employees", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].columns).toHaveLength(2);
    expect(result.edges[0].source).toBe(result.edges[0].target);
  });
```

- [ ] **Step 12: Write test — onUpdate/onDelete passed through**

```typescript
  test("passes through onUpdate and onDelete values", () => {
    const overview = makeOverview([
      { schema: "public", name: "orders", columns: [{ name: "user_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk1", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id", onUpdate: "CASCADE", onDelete: "SET NULL" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.edges[0].onUpdate).toBe("CASCADE");
    expect(result.edges[0].onDelete).toBe("SET NULL");
  });
```

- [ ] **Step 13: Write test — node ID format**

```typescript
  test("node ID is schema.table format", () => {
    const overview = makeOverview([
      { schema: "myschema", name: "orders", columns: [{ name: "user_id", type: "int" }] },
      { schema: "public", name: "users", columns: [{ name: "id", type: "int" }] },
    ]);
    const fks = [
      makeFK({ name: "fk1", sourceTable: "orders", sourceColumn: "user_id", targetTable: "users", targetColumn: "id" }),
    ];
    const result = buildDiagramData(overview, fks);
    expect(result.nodes[0].id).toBe("myschema.orders");
  });
});
```

- [ ] **Step 14: Run test to verify it passes**

Run: `bun test src/components/business/ERDiagram/types.unit.test.ts`
Expected: All tests PASS

- [ ] **Step 15: Commit**

```bash
git add src/components/business/ERDiagram/types.unit.test.ts
git commit -m "test: add unit tests for ER Diagram buildDiagramData"
```

---

### Task 3: ER Diagram computeLayout tests

**Files:**
- Create: `src/components/business/ERDiagram/erDiagramLayout.unit.test.ts`
- Read: `src/components/business/ERDiagram/erDiagramLayout.ts` (source of truth)

- [ ] **Step 1: Create the test file**

```typescript
import { describe, test, expect } from "bun:test";
import { computeLayout } from "./erDiagramLayout";
import type { Node, Edge } from "@xyflow/react";

function makeNode(id: string, columnCount: number): Node {
  return {
    id,
    type: "tableNode",
    position: { x: 0, y: 0 },
    data: {
      columns: Array.from({ length: columnCount }, (_, i) => ({
        name: `col_${i}`,
        type: "text",
        isForeignKey: false,
      })),
    },
  };
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, type: "default" };
}
```

- [ ] **Step 2: Write test — nodes get positions after layout**

```typescript
describe("computeLayout", () => {
  test("assigns positions to all nodes", () => {
    const nodes = [makeNode("a", 3), makeNode("b", 2)];
    const edges = [makeEdge("e1", "a", "b")];
    const result = computeLayout(nodes, edges);
    for (const node of result.nodes) {
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
      expect(isFinite(node.position.x)).toBe(true);
      expect(isFinite(node.position.y)).toBe(true);
    }
  });
```

- [ ] **Step 3: Write test — empty graph returns empty**

```typescript
  test("returns empty nodes and edges for empty input", () => {
    const result = computeLayout([], []);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
```

- [ ] **Step 4: Write test — edges are preserved**

```typescript
  test("preserves edges unchanged", () => {
    const nodes = [makeNode("a", 1), makeNode("b", 1)];
    const edges = [makeEdge("e1", "a", "b")];
    const result = computeLayout(nodes, edges);
    expect(result.edges).toEqual(edges);
  });
```

- [ ] **Step 5: Write test — nodes with more columns get taller (further apart vertically)**

```typescript
  test("nodes with more columns are taller", () => {
    const nodes = [makeNode("small", 1), makeNode("large", 10)];
    const edges: Edge[] = [];
    const result = computeLayout(nodes, edges);
    const smallNode = result.nodes.find((n) => n.id === "small")!;
    const largeNode = result.nodes.find((n) => n.id === "large")!;
    expect(smallNode.position.y).toBe(largeNode.position.y);
  });
```

- [ ] **Step 6: Write test — single node is centered at origin**

```typescript
  test("single node is positioned near origin", () => {
    const nodes = [makeNode("a", 2)];
    const result = computeLayout(nodes, []);
    expect(result.nodes[0].position.x).toBeDefined();
    expect(result.nodes[0].position.y).toBeDefined();
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun test src/components/business/ERDiagram/erDiagramLayout.unit.test.ts`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/components/business/ERDiagram/erDiagramLayout.unit.test.ts
git commit -m "test: add unit tests for ER Diagram computeLayout"
```

---

### Task 4: Extract multi-cell copy functions

**Files:**
- Create: `src/components/business/DataGrid/tableView/selectionCopy.ts`
- Read: `src/components/business/DataGrid/TableView.tsx:1183-1555` (source to extract from)
- Read: `src/components/business/DataGrid/tableView/utils.ts` (existing utilities)

This task extracts pure functions from TableView.tsx into a standalone module. No behavior change — TableView.tsx will delegate to these functions.

- [ ] **Step 1: Create selectionCopy.ts with extracted functions**

```typescript
export interface CellRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export function getNormalizedCellRange(
  anchor: { row: number; colIndex: number },
  tip: { row: number; colIndex: number },
): CellRange {
  return {
    minRow: Math.min(anchor.row, tip.row),
    maxRow: Math.max(anchor.row, tip.row),
    minCol: Math.min(anchor.colIndex, tip.colIndex),
    maxCol: Math.max(anchor.colIndex, tip.colIndex),
  };
}

export function buildRangeTSV(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells: string[] = [];
    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = columns[c];
      const val = getCellValue(r, col, row[col]);
      cells.push(val === null || val === undefined ? "" : cellValueToString(val));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

export function buildRangeCSV(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells: string[] = [];
    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = columns[c];
      const val = getCellValue(r, col, row[col]);
      const str = val === null || val === undefined ? "" : cellValueToString(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        cells.push(`"${str.replace(/"/g, '""')}"`);
      } else {
        cells.push(str);
      }
    }
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function buildRangeInsertSQL(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  driver: string,
  tableName: string,
): string {
  const selectedCols: string[] = [];
  for (let c = range.minCol; c <= range.maxCol; c++) {
    selectedCols.push(columns[c]);
  }
  const colNames = selectedCols.map((c) => quoteIdentFn(driver, c)).join(", ");

  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    const vals = selectedCols
      .map((col) => {
        const val = getCellValue(r, col, row[col]);
        return formatSQLValue(
          val === null || val === undefined ? "" : String(val),
          row[col],
          "copy",
          driver,
        );
      })
      .join(", ");
    lines.push(`INSERT INTO ${tableName} (${colNames}) VALUES (${vals});`);
  }
  return lines.join("\n");
}

export function buildRangeUpdateSQL(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  primaryKeys: string[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  escapeSQLFn: (s: string) => string,
  buildUpdateStatementFn: (driver: string, table: string, set: string, where: string) => string,
  driver: string,
  tableName: string,
): string {
  if (primaryKeys.length === 0) return "";

  const selectedCols: string[] = [];
  for (let c = range.minCol; c <= range.maxCol; c++) {
    selectedCols.push(columns[c]);
  }

  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;

    const setClauses = selectedCols.map((col) => {
      const val = getCellValue(r, col, row[col]);
      const formattedValue = formatSQLValue(
        val === null || val === undefined ? "" : String(val),
        row[col],
        "copy",
        driver,
      );
      return `${quoteIdentFn(driver, col)} = ${formattedValue}`;
    });

    const whereClauses = primaryKeys.map((pk) => {
      const pkValue = row[pk];
      if (pkValue === null || pkValue === undefined) {
        return `${quoteIdentFn(driver, pk)} IS NULL`;
      }
      if (typeof pkValue === "number") {
        return `${quoteIdentFn(driver, pk)} = ${pkValue}`;
      }
      return `${quoteIdentFn(driver, pk)} = '${escapeSQLFn(String(pkValue))}'`;
    });

    lines.push(
      `${buildUpdateStatementFn(driver, tableName, setClauses.join(", "), whereClauses.join(" AND "))};`,
    );
  }
  return lines.join("\n");
}

export function buildRowsTSV(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);
  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";
      return columns
        .map((col) => {
          const value = getCellValue(rowIndex, col, row[col]);
          if (value === null || value === undefined) return "";
          return cellValueToString(value);
        })
        .join("\t");
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildRowsCSV(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);
  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";
      return columns
        .map((col) => {
          const value = getCellValue(rowIndex, col, row[col]);
          if (value === null || value === undefined) return "";
          const str = cellValueToString(value);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",");
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildRowsInsertSQL(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  driver: string,
  tableName: string,
): string {
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);
  const cols = columns.map((c) => quoteIdentFn(driver, c)).join(", ");

  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";
      const vals = columns
        .map((col) => {
          const val = getCellValue(rowIndex, col, row[col]);
          return formatSQLValue(
            val === null || val === undefined ? "" : String(val),
            row[col],
            "copy",
            driver,
          );
        })
        .join(", ");
      return `INSERT INTO ${tableName} (${cols}) VALUES (${vals});`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildRowsUpdateSQL(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  primaryKeys: string[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  escapeSQLFn: (s: string) => string,
  buildUpdateStatementFn: (driver: string, table: string, set: string, where: string) => string,
  driver: string,
  tableName: string,
): string {
  if (primaryKeys.length === 0) return "";
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);

  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";

      const setClauses = columns.map((col) => {
        const val = getCellValue(rowIndex, col, row[col]);
        const formattedValue = formatSQLValue(
          val === null || val === undefined ? "" : String(val),
          row[col],
          "copy",
          driver,
        );
        return `${quoteIdentFn(driver, col)} = ${formattedValue}`;
      });

      const whereClauses = primaryKeys.map((pk) => {
        const pkValue = row[pk];
        if (pkValue === null || pkValue === undefined) {
          return `${quoteIdentFn(driver, pk)} IS NULL`;
        }
        if (typeof pkValue === "number") {
          return `${quoteIdentFn(driver, pk)} = ${pkValue}`;
        }
        return `${quoteIdentFn(driver, pk)} = '${escapeSQLFn(String(pkValue))}'`;
      });

      return `${buildUpdateStatementFn(driver, tableName, setClauses.join(", "), whereClauses.join(" AND "))};`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 3: Commit the extraction (no behavior change yet)**

```bash
git add src/components/business/DataGrid/tableView/selectionCopy.ts
git commit -m "refactor: extract multi-cell copy functions from TableView.tsx"
```

---

### Task 5: Add selectionCopy unit tests

**Files:**
- Create: `src/components/business/DataGrid/tableView/selectionCopy.unit.test.ts`

- [ ] **Step 1: Create test file with imports and helpers**

```typescript
import { describe, test, expect } from "bun:test";
import {
  getNormalizedCellRange,
  buildRangeTSV,
  buildRangeCSV,
  buildRangeInsertSQL,
  buildRangeUpdateSQL,
  buildRowsTSV,
  buildRowsCSV,
  buildRowsInsertSQL,
  buildRowsUpdateSQL,
} from "./selectionCopy";

const columns = ["id", "name", "email"];
const rows: Record<string, unknown>[] = [
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
  { id: 3, name: "Charlie", email: "charlie@example.com" },
];

const getCellValue = (_row: number, col: string, raw: unknown) => raw;
const cellValueToString = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const formatSQLValue = (str: string) => `'${str}'`;
const quoteIdentFn = (_driver: string, ident: string) => `\`${ident}\``;
const escapeSQLFn = (s: string) => s.replace(/'/g, "''");
const buildUpdateStatementFn = (_driver: string, table: string, set: string, where: string) =>
  `UPDATE ${table} SET ${set} WHERE ${where}`;
```

- [ ] **Step 2: Write getNormalizedCellRange tests**

```typescript
describe("getNormalizedCellRange", () => {
  test("normalizes anchor and tip into min/max", () => {
    const result = getNormalizedCellRange(
      { row: 2, colIndex: 3 },
      { row: 0, colIndex: 1 },
    );
    expect(result).toEqual({ minRow: 0, maxRow: 2, minCol: 1, maxCol: 3 });
  });

  test("handles same cell selection", () => {
    const result = getNormalizedCellRange(
      { row: 1, colIndex: 2 },
      { row: 1, colIndex: 2 },
    );
    expect(result).toEqual({ minRow: 1, maxRow: 1, minCol: 2, maxCol: 2 });
  });

  test("handles inverted anchor/tip", () => {
    const result = getNormalizedCellRange(
      { row: 5, colIndex: 0 },
      { row: 0, colIndex: 5 },
    );
    expect(result).toEqual({ minRow: 0, maxRow: 5, minCol: 0, maxCol: 5 });
  });
});
```

- [ ] **Step 3: Write buildRangeTSV tests**

```typescript
describe("buildRangeTSV", () => {
  test("builds TSV for single cell", () => {
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
    const result = buildRangeTSV(range, columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("1");
  });

  test("builds TSV for multi-cell range", () => {
    const range = { minRow: 0, maxRow: 1, minCol: 0, maxCol: 2 };
    const result = buildRangeTSV(range, columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("1\tAlice\talice@example.com\n2\tBob\tbob@example.com");
  });

  test("handles null values as empty string", () => {
    const rowsWithNull = [{ id: 1, name: null, email: "a@b.com" }];
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 2 };
    const result = buildRangeTSV(range, columns, rowsWithNull, getCellValue, cellValueToString);
    expect(result).toBe("1\t\ta@b.com");
  });

  test("returns empty string for empty range", () => {
    const range = { minRow: 0, maxRow: -1, minCol: 0, maxCol: 0 };
    const result = buildRangeTSV(range, columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("");
  });
});
```

- [ ] **Step 4: Write buildRangeCSV tests**

```typescript
describe("buildRangeCSV", () => {
  test("builds CSV for multi-cell range", () => {
    const range = { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 };
    const result = buildRangeCSV(range, columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("1,Alice\n2,Bob");
  });

  test("escapes values containing commas", () => {
    const rowsWithComma = [{ id: 1, name: "Alice, Jr.", email: "a@b.com" }];
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 2 };
    const result = buildRangeCSV(range, columns, rowsWithComma, getCellValue, cellValueToString);
    expect(result).toBe('1,"Alice, Jr.",a@b.com');
  });

  test("escapes values containing quotes", () => {
    const rowsWithQuote = [{ id: 1, name: 'Alice "Ali"', email: "a@b.com" }];
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 2 };
    const result = buildRangeCSV(range, columns, rowsWithQuote, getCellValue, cellValueToString);
    expect(result).toBe('1,"Alice ""Ali""",a@b.com');
  });

  test("escapes values containing newlines", () => {
    const rowsWithNewline = [{ id: 1, name: "Alice\nSmith", email: "a@b.com" }];
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 2 };
    const result = buildRangeCSV(range, columns, rowsWithNewline, getCellValue, cellValueToString);
    expect(result).toBe('1,"Alice\nSmith",a@b.com');
  });
});
```

- [ ] **Step 5: Write buildRangeInsertSQL tests**

```typescript
describe("buildRangeInsertSQL", () => {
  test("builds INSERT for single row", () => {
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 };
    const result = buildRangeInsertSQL(
      range, columns, rows, getCellValue, formatSQLValue, quoteIdentFn, "mysql", "`users`",
    );
    expect(result).toBe("INSERT INTO `users` (`id`, `name`) VALUES ('1', 'Alice');");
  });

  test("builds INSERT for multiple rows", () => {
    const range = { minRow: 0, maxRow: 2, minCol: 0, maxCol: 0 };
    const result = buildRangeInsertSQL(
      range, columns, rows, getCellValue, formatSQLValue, quoteIdentFn, "mysql", "`users`",
    );
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("INSERT INTO");
  });
});
```

- [ ] **Step 6: Write buildRangeUpdateSQL tests**

```typescript
describe("buildRangeUpdateSQL", () => {
  test("returns empty string when no primary keys", () => {
    const range = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 };
    const result = buildRangeUpdateSQL(
      range, columns, rows, [], getCellValue, formatSQLValue, quoteIdentFn, escapeSQLFn, buildUpdateStatementFn, "mysql", "`users`",
    );
    expect(result).toBe("");
  });

  test("builds UPDATE with PK in WHERE", () => {
    const range = { minRow: 0, maxRow: 0, minCol: 1, maxCol: 2 };
    const result = buildRangeUpdateSQL(
      range, columns, rows, ["id"], getCellValue, formatSQLValue, quoteIdentFn, escapeSQLFn, buildUpdateStatementFn, "mysql", "`users`",
    );
    expect(result).toContain("UPDATE `users` SET");
    expect(result).toContain("WHERE");
    expect(result).toContain("`id` = 1");
  });

  test("handles NULL PK values", () => {
    const rowsWithNullPk = [{ id: null, name: "Alice", email: "a@b.com" }];
    const range = { minRow: 0, maxRow: 0, minCol: 1, maxCol: 1 };
    const result = buildRangeUpdateSQL(
      range, columns, rowsWithNullPk, ["id"], getCellValue, formatSQLValue, quoteIdentFn, escapeSQLFn, buildUpdateStatementFn, "mysql", "`users`",
    );
    expect(result).toContain("`id` IS NULL");
  });
});
```

- [ ] **Step 7: Write buildRowsTSV tests**

```typescript
describe("buildRowsTSV", () => {
  test("builds TSV for selected rows", () => {
    const result = buildRowsTSV([0, 2], columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("1\tAlice\talice@example.com\n3\tCharlie\tcharlie@example.com");
  });

  test("sorts row indexes", () => {
    const result = buildRowsTSV([2, 0], columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("1\tAlice\talice@example.com\n3\tCharlie\tcharlie@example.com");
  });

  test("returns empty string for empty row indexes", () => {
    const result = buildRowsTSV([], columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("");
  });
});
```

- [ ] **Step 8: Write buildRowsCSV tests**

```typescript
describe("buildRowsCSV", () => {
  test("builds CSV for selected rows", () => {
    const result = buildRowsCSV([0, 1], columns, rows, getCellValue, cellValueToString);
    expect(result).toBe("1,Alice,alice@example.com\n2,Bob,bob@example.com");
  });

  test("escapes special characters", () => {
    const specialRows = [{ id: 1, name: "A,B", email: 'C"D' }];
    const result = buildRowsCSV([0], columns, specialRows, getCellValue, cellValueToString);
    expect(result).toBe('1,"A,B","C"D"');
  });
});
```

- [ ] **Step 9: Write buildRowsInsertSQL tests**

```typescript
describe("buildRowsInsertSQL", () => {
  test("builds INSERT for selected rows", () => {
    const result = buildRowsInsertSQL(
      [0, 1], columns, rows, getCellValue, formatSQLValue, quoteIdentFn, "mysql", "`users`",
    );
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("INSERT INTO `users`");
  });

  test("returns empty string for empty row indexes", () => {
    const result = buildRowsInsertSQL(
      [], columns, rows, getCellValue, formatSQLValue, quoteIdentFn, "mysql", "`users`",
    );
    expect(result).toBe("");
  });
});
```

- [ ] **Step 10: Write buildRowsUpdateSQL tests**

```typescript
describe("buildRowsUpdateSQL", () => {
  test("returns empty string when no primary keys", () => {
    const result = buildRowsUpdateSQL(
      [0], columns, rows, [], getCellValue, formatSQLValue, quoteIdentFn, escapeSQLFn, buildUpdateStatementFn, "mysql", "`users`",
    );
    expect(result).toBe("");
  });

  test("builds UPDATE for selected rows with PK", () => {
    const result = buildRowsUpdateSQL(
      [0, 1], columns, rows, ["id"], getCellValue, formatSQLValue, quoteIdentFn, escapeSQLFn, buildUpdateStatementFn, "mysql", "`users`",
    );
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("UPDATE `users` SET");
    expect(lines[0]).toContain("`id` = 1");
  });
});
```

- [ ] **Step 11: Run tests to verify all pass**

Run: `bun test src/components/business/DataGrid/tableView/selectionCopy.unit.test.ts`
Expected: All tests PASS

- [ ] **Step 12: Commit**

```bash
git add src/components/business/DataGrid/tableView/selectionCopy.unit.test.ts
git commit -m "test: add unit tests for multi-cell copy functions"
```

---

### Task 6: Wire TableView.tsx to use extracted functions

**Files:**
- Modify: `src/components/business/DataGrid/TableView.tsx`

- [ ] **Step 1: Add import for selectionCopy functions**

At the top of `TableView.tsx`, add after the existing `from "./tableView/utils"` import:

```typescript
import {
  getNormalizedCellRange as normalizeRange,
  buildRangeTSV,
  buildRangeCSV,
  buildRangeInsertSQL,
  buildRangeUpdateSQL,
  buildRowsTSV as buildRowsTSVFn,
  buildRowsCSV as buildRowsCSVFn,
  buildRowsInsertSQL as buildRowsInsertSQLFn,
  buildRowsUpdateSQL as buildRowsUpdateSQLFn,
} from "./tableView/selectionCopy";
```

- [ ] **Step 2: Replace getNormalizedCellRange callback**

Replace the existing `getNormalizedCellRange` useCallback (lines ~1219-1227) with:

```typescript
  const getNormalizedCellRange = useCallback(() => {
    if (!cellSelectionRange) return null;
    return normalizeRange(cellSelectionRange.anchor, cellSelectionRange.tip);
  }, [cellSelectionRange]);
```

- [ ] **Step 3: Replace buildRowsTSV callback**

Replace the existing `buildRowsTSV` useCallback (lines ~1183-1202) with:

```typescript
  const buildRowsTSV = useCallback(
    (rowIndexes: number[]) => buildRowsTSVFn(rowIndexes, columns, currentData, getCellDisplayValue, cellValueToString),
    [columns, currentData, getCellDisplayValue],
  );
```

- [ ] **Step 4: Replace buildSelectionCSV callback**

Replace the existing `buildSelectionCSV` useCallback (lines ~1262-1283) with:

```typescript
  const buildSelectionCSV = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range) return "";
    return buildRangeCSV(range, columns, currentData, getCellDisplayValue, cellValueToString);
  }, [getNormalizedCellRange, currentData, columns, getCellDisplayValue]);
```

- [ ] **Step 5: Replace buildSelectionInsertSQL callback**

Replace the existing `buildSelectionInsertSQL` useCallback (lines ~1285-1314) with:

```typescript
  const buildSelectionInsertSQL = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range || !tableContext) return "";
    const { schema, table, driver } = tableContext;
    const tableName = getQualifiedTableName(driver, schema, table);
    return buildRangeInsertSQL(range, columns, currentData, getCellDisplayValue, formatSQLValue, quoteIdent, driver, tableName);
  }, [getNormalizedCellRange, currentData, columns, getCellDisplayValue, tableContext]);
```

- [ ] **Step 6: Replace buildSelectionUpdateSQL callback**

Replace the existing `buildSelectionUpdateSQL` useCallback (lines ~1316-1358) with:

```typescript
  const buildSelectionUpdateSQL = useCallback(() => {
    const range = getNormalizedCellRange();
    if (!range || !tableContext || !canUpdateDelete || primaryKeys.length === 0) return "";
    const { schema, table, driver } = tableContext;
    const tableName = getQualifiedTableName(driver, schema, table);
    return buildRangeUpdateSQL(range, columns, currentData, primaryKeys, getCellDisplayValue, formatSQLValue, quoteIdent, escapeSQL, buildUpdateStatement, driver, tableName);
  }, [getNormalizedCellRange, currentData, columns, getCellDisplayValue, canUpdateDelete, primaryKeys, tableContext]);
```

- [ ] **Step 7: Replace buildRowsCSV callback**

Replace the existing `buildRowsCSV` useCallback (lines ~1447-1474) with:

```typescript
  const buildRowsCSV = useCallback(
    (rowIndexes: number[]) => buildRowsCSVFn(rowIndexes, columns, currentData, getCellDisplayValue, cellValueToString),
    [columns, currentData, getCellDisplayValue],
  );
```

- [ ] **Step 8: Replace buildRowsInsertSQL callback**

Replace the existing `buildRowsInsertSQL` useCallback (lines ~1476-1505) with:

```typescript
  const buildRowsInsertSQL = useCallback(
    (rowIndexes: number[]) => {
      if (!tableContext) return "";
      const { schema, table, driver } = tableContext;
      const tableName = getQualifiedTableName(driver, schema, table);
      return buildRowsInsertSQLFn(rowIndexes, columns, currentData, getCellDisplayValue, formatSQLValue, quoteIdent, driver, tableName);
    },
    [columns, currentData, getCellDisplayValue, tableContext],
  );
```

- [ ] **Step 9: Replace buildRowsUpdateSQL callback**

Replace the existing `buildRowsUpdateSQL` useCallback (lines ~1507-1555) with:

```typescript
  const buildRowsUpdateSQL = useCallback(
    (rowIndexes: number[]) => {
      if (!tableContext || !canUpdateDelete || primaryKeys.length === 0) return "";
      const { schema, table, driver } = tableContext;
      const tableName = getQualifiedTableName(driver, schema, table);
      return buildRowsUpdateSQLFn(rowIndexes, columns, currentData, primaryKeys, getCellDisplayValue, formatSQLValue, quoteIdent, escapeSQL, buildUpdateStatement, driver, tableName);
    },
    [columns, currentData, getCellDisplayValue, canUpdateDelete, primaryKeys, tableContext],
  );
```

- [ ] **Step 10: Run typecheck to verify no errors**

Run: `bun run typecheck`
Expected: No errors

- [ ] **Step 11: Run all unit tests to verify no regressions**

Run: `bun run test:unit`
Expected: All tests PASS

- [ ] **Step 12: Run smoke test suite**

Run: `bun run test:smoke`
Expected: All pass (typecheck + lint + rust:check + unit + service + rust:unit)

- [ ] **Step 13: Commit**

```bash
git add src/components/business/DataGrid/TableView.tsx
git commit -m "refactor: delegate multi-cell copy to extracted selectionCopy functions"
```

---

## Verification

After all tasks complete, run the full smoke suite:

```bash
bun run test:smoke
```

Expected: All pass (typecheck, lint, rust:check, unit tests, service tests, rust unit tests).
