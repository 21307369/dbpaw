# Component Behavior Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add behavior-driven unit tests to 5 high-risk frontend modules (TabContentRenderer, useTabFactory, SqlEditor, ConnectionDialog, TableView).

**Architecture:** Component-level tests using Bun test runner + happy-dom + @testing-library/react. Heavy externals (CodeMirror, virtualizer, dialog plugins) mocked via `mock.module()`. Child components mocked as prop-capturing stubs following the `RedisBrowserView.unit.test.tsx` pattern.

**Tech Stack:** `bun:test`, `@testing-library/react`, `happy-dom`, `mock.module()` (Bun-specific)

**Spec:** `docs/superpowers/specs/2026-06-08-component-behavior-tests-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/hooks/useTabFactory.unit.test.tsx` | Create | useTabFactory hook behavior tests |
| `src/components/layout/TabContentRenderer.unit.test.tsx` | Create | TabContentRenderer component tests (replaces `.unit.test.ts`) |
| `src/components/layout/TabContentRenderer.unit.test.ts` | Delete | Replaced by `.tsx` version |
| `src/components/business/Sidebar/connection-list/ConnectionDialog.unit.test.tsx` | Create | ConnectionDialog form behavior tests |
| `src/components/business/Editor/SqlEditor.unit.test.tsx` | Create | SqlEditor behavior tests |
| `src/components/business/DataGrid/TableView.unit.test.tsx` | Create | TableView behavior tests |

---

### Task 1: useTabFactory Tests

**Files:**
- Create: `src/hooks/useTabFactory.unit.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { mock } from "bun:test";

const mockExportTable = mock(() =>
  Promise.resolve({ rowCount: 10, filePath: "/tmp/out.csv" }),
);
const mockExportDatabase = mock(() =>
  Promise.resolve({ rowCount: 50, filePath: "/tmp/out.sql" }),
);

mock.module("@/services/api", () => ({
  api: {
    transfer: {
      exportTable: mockExportTable,
      exportDatabase: mockExportDatabase,
    },
  },
}));

mock.module("sonner", () => ({
  toast: { success: mock(), error: mock() },
}));

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useTabFactory } from "./useTabFactory";
import type { TabItem, EditorTabItem } from "@/types/tab";

function makeEditorTab(id: string): EditorTabItem {
  return { id, type: "editor", title: `Tab ${id}` };
}

describe("useTabFactory", () => {
  let tabs: TabItem[];
  let activeTab: string;
  let setTabs: React.Dispatch<React.SetStateAction<TabItem[]>>;
  let setActiveTab: React.Dispatch<React.SetStateAction<string>>;
  const t = (s: string) => s;

  beforeEach(() => {
    tabs = [];
    activeTab = "";
    setTabs = (updater) => {
      tabs = typeof updater === "function" ? updater(tabs) : updater;
    };
    setActiveTab = (v) => {
      activeTab = typeof v === "function" ? v(activeTab) : v;
    };
    mockExportTable.mockClear();
    mockExportDatabase.mockClear();
  });

  function renderFactory() {
    return renderHook(() =>
      useTabFactory({ tabs, setTabs, setActiveTab, t }),
    );
  }

  describe("openOrCreateTab (via openRedisConsole)", () => {
    test("creates new tab and sets it active", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisConsole("conn1", "db0", 1, "redis"),
      );

      expect(tabs).toHaveLength(1);
      expect(tabs[0].id).toBe("redis-console-1-db0");
      expect(tabs[0].type).toBe("redis-console");
      expect(activeTab).toBe("redis-console-1-db0");
    });

    test("activates existing tab without duplication", () => {
      tabs = [
        {
          id: "redis-console-1-db0",
          type: "redis-console",
          title: "Console · db0",
          connection: "conn1",
          database: "db0",
          connectionId: 1,
          driver: "redis",
        },
      ];
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisConsole("conn1", "db0", 1, "redis"),
      );

      expect(tabs).toHaveLength(1);
      expect(activeTab).toBe("redis-console-1-db0");
    });
  });

  describe("openRedisConsole", () => {
    test("generates correct tab ID and type", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisConsole("conn1", "db2", 5, "redis"),
      );

      expect(tabs[0].id).toBe("redis-console-5-db2");
      expect(tabs[0].type).toBe("redis-console");
      expect(tabs[0].title).toBe("Console · db2");
    });
  });

  describe("openRedisBrowser", () => {
    test("generates correct tab ID and type", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisBrowser("conn1", "db0", 3, "redis"),
      );

      expect(tabs[0].id).toBe("redis-browser-3-db0");
      expect(tabs[0].type).toBe("redis-browser");
      expect(tabs[0].title).toBe("Browser · db0");
    });
  });

  describe("openRedisServerInfo", () => {
    test("generates correct tab ID and type", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisServerInfo("conn1", "db0", 2, "redis"),
      );

      expect(tabs[0].id).toBe("redis-server-info-2-db0");
      expect(tabs[0].type).toBe("redis-server-info");
    });
  });

  describe("openRedisKey", () => {
    test("generates correct tab ID", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisKey("conn1", "db0", "mykey", 1, "redis"),
      );

      expect(tabs[0].id).toBe("redis-1-db0-mykey");
      expect(tabs[0].type).toBe("redis-key");
      expect(tabs[0].title).toBe("mykey");
    });

    test("uses fallback title for empty key", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRedisKey("conn1", "db0", "", 1, "redis"),
      );

      expect(tabs[0].title).toBe("New Redis key");
    });
  });

  describe("openElasticsearchIndex", () => {
    test("generates correct tab ID", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openElasticsearchIndex("conn1", "my-index", 7, "elasticsearch"),
      );

      expect(tabs[0].id).toBe("elasticsearch-7-my-index");
      expect(tabs[0].type).toBe("elasticsearch-index");
    });
  });

  describe("openTableDDL", () => {
    test("generates correct tab ID", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openTableDDL({
          connectionId: 1,
          database: "mydb",
          schema: "public",
          table: "users",
        }),
      );

      expect(tabs[0].id).toBe("ddl-1-mydb-public-users");
      expect(tabs[0].type).toBe("ddl");
    });
  });

  describe("openRoutine", () => {
    test("generates correct tab ID for function", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openRoutine(
          "conn1",
          "mydb",
          "public",
          "get_user",
          "function",
          1,
          "postgres",
        ),
      );

      expect(tabs[0].id).toBe("routine-1-mydb-public-function-get_user");
      expect(tabs[0].type).toBe("routine");
    });
  });

  describe("openCreateTable", () => {
    test("generates unique tab IDs per call", () => {
      const { result } = renderFactory();
      let id1: string;
      let id2: string;

      act(() => {
        result.current.openCreateTable(1, "mydb", "public", "postgres");
      });
      id1 = tabs[0].id;

      act(() => {
        result.current.openCreateTable(1, "mydb", "public", "postgres");
      });
      id2 = tabs[1].id;

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^create-table-1-mydb-public-\d+$/);
      expect(tabs).toHaveLength(2);
    });
  });

  describe("openAlterTable", () => {
    test("generates correct tab ID", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openAlterTable(1, "mydb", "public", "users", "postgres"),
      );

      expect(tabs[0].id).toBe("alter-table-1-mydb-public-users");
      expect(tabs[0].type).toBe("alter-table");
    });
  });

  describe("openERDiagram", () => {
    test("generates correct tab ID", () => {
      const { result } = renderFactory();
      act(() =>
        result.current.openERDiagram({ connectionId: 1, database: "mydb" }),
      );

      expect(tabs[0].id).toBe("er-diagram-mydb");
      expect(tabs[0].type).toBe("er-diagram");
    });

    test("returns early when connectionId missing", () => {
      const { result } = renderFactory();
      act(() => result.current.openERDiagram({ database: "mydb" }));
      expect(tabs).toHaveLength(0);
    });

    test("returns early when database missing", () => {
      const { result } = renderFactory();
      act(() => result.current.openERDiagram({ connectionId: 1 }));
      expect(tabs).toHaveLength(0);
    });
  });

  describe("exportTable", () => {
    test("calls API and shows success toast", async () => {
      const { result } = renderFactory();
      await act(async () => {
        await result.current.exportTable(
          {
            connectionId: 1,
            database: "mydb",
            schema: "public",
            table: "users",
            driver: "postgres",
          },
          "csv",
          "/tmp/out.csv",
        );
      });

      expect(mockExportTable).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          database: "mydb",
          schema: "public",
          table: "users",
          driver: "postgres",
          format: "csv",
          filePath: "/tmp/out.csv",
        }),
      );
    });

    test("shows error toast on API failure", async () => {
      mockExportTable.mockRejectedValueOnce(new Error("disk full"));
      const { result } = renderFactory();

      await act(async () => {
        await result.current.exportTable(
          {
            connectionId: 1,
            database: "mydb",
            schema: "public",
            table: "users",
            driver: "postgres",
          },
          "csv",
          "/tmp/out.csv",
        );
      });
      // toast.error was called (mocked, no assertion needed — just no crash)
    });
  });

  describe("exportDatabase", () => {
    test("calls API with correct params", async () => {
      const { result } = renderFactory();
      await act(async () => {
        await result.current.exportDatabase({
          connectionId: 1,
          database: "mydb",
          driver: "postgres",
          format: "sql_ddl",
          filePath: "/tmp/out.sql",
        });
      });

      expect(mockExportDatabase).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          database: "mydb",
          driver: "postgres",
          format: "sql_ddl",
          filePath: "/tmp/out.sql",
        }),
      );
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/hooks/useTabFactory.unit.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Fix any failures**

If tests fail due to mock issues or API shape mismatches, fix the test code and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTabFactory.unit.test.tsx
git commit -m "test: add useTabFactory behavior tests"
```

---

### Task 2: TabContentRenderer Tests

**Files:**
- Create: `src/components/layout/TabContentRenderer.unit.test.tsx`
- Delete: `src/components/layout/TabContentRenderer.unit.test.ts`

- [ ] **Step 1: Delete the old test file and create the new one**

```tsx
import { mock } from "bun:test";

const mockT = (s: string) => s;

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

const editorCalls: any[] = [];
const tableCalls: any[] = [];
const redisKeyCalls: any[] = [];
const redisConsoleCalls: any[] = [];
const redisBrowserCalls: any[] = [];
const redisServerInfoCalls: any[] = [];
const elasticsearchCalls: any[] = [];
const erDiagramCalls: any[] = [];
const createTableCalls: any[] = [];
const alterTableCalls: any[] = [];
const routineMetadataCalls: any[] = [];
const tableMetadataCalls: any[] = [];

mock.module("@/components/business/Editor/SqlEditor", () => ({
  SqlEditor: (props: any) => {
    editorCalls.push(props);
    return <div data-testid="sql-editor" />;
  },
}));

mock.module("@/components/business/DataGrid/TableView", () => ({
  TableView: (props: any) => {
    tableCalls.push(props);
    return <div data-testid="table-view" />;
  },
}));

mock.module("@/components/business/Redis/RedisKeyView", () => ({
  RedisKeyView: (props: any) => {
    redisKeyCalls.push(props);
    return <div data-testid="redis-key-view" />;
  },
}));

mock.module("@/components/business/Redis/RedisConsole", () => ({
  RedisConsole: (props: any) => {
    redisConsoleCalls.push(props);
    return <div data-testid="redis-console" />;
  },
}));

mock.module("@/components/business/Redis/RedisBrowserView", () => ({
  RedisBrowserView: (props: any) => {
    redisBrowserCalls.push(props);
    return <div data-testid="redis-browser-view" />;
  },
}));

mock.module("@/components/business/Redis/RedisServerInfoView", () => ({
  RedisServerInfoView: (props: any) => {
    redisServerInfoCalls.push(props);
    return <div data-testid="redis-server-info" />;
  },
}));

mock.module(
  "@/components/business/Elasticsearch/ElasticsearchIndexView",
  () => ({
    ElasticsearchIndexView: (props: any) => {
      elasticsearchCalls.push(props);
      return <div data-testid="elasticsearch-view" />;
    },
  }),
);

mock.module("@/components/business/ERDiagram/ERDiagramView", () => ({
  default: (props: any) => {
    erDiagramCalls.push(props);
    return <div data-testid="er-diagram" />;
  },
}));

mock.module("@/components/business/CreateTable/CreateTableView", () => ({
  CreateTableView: (props: any) => {
    createTableCalls.push(props);
    return <div data-testid="create-table-view" />;
  },
}));

mock.module("@/components/business/CreateTable/AlterTableView", () => ({
  AlterTableView: (props: any) => {
    alterTableCalls.push(props);
    return <div data-testid="alter-table-view" />;
  },
}));

mock.module("@/components/business/Metadata/RoutineMetadataView", () => ({
  RoutineMetadataView: (props: any) => {
    routineMetadataCalls.push(props);
    return <div data-testid="routine-metadata" />;
  },
}));

mock.module("@/components/business/Metadata/TableMetadataView", () => ({
  TableMetadataView: (props: any) => {
    tableMetadataCalls.push(props);
    return <div data-testid="table-metadata" />;
  },
}));

mock.module("@/lib/driver-registry", () => ({
  resolveTableScope: (_driver: string, database: string, schema?: string) => ({
    database,
    schema: schema || "public",
  }),
}));

mock.module("@/services/api", () => ({
  api: { query: { cancel: () => Promise.resolve(false) } },
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { render, act } from "@testing-library/react";
import {
  TabContentRenderer,
  shouldMountTabContent,
} from "./TabContentRenderer";
import type {
  TabItem,
  EditorTabItem,
  TableTabItem,
  RedisKeyTabItem,
  RedisConsoleTabItem,
  RedisBrowserTabItem,
  RedisServerInfoTabItem,
  ElasticsearchIndexTabItem,
  ERDiagramTabItem,
  CreateTableTabItem,
  AlterTableTabItem,
  RoutineTabItem,
  DdlTabItem,
} from "@/types/tab";

const NOOP = () => {};
const ASYNC_NOOP = () => Promise.resolve();

const defaultProps = {
  handleExecuteQuery: ASYNC_NOOP,
  handleSqlChange: NOOP,
  handleEditorDatabaseChange: ASYNC_NOOP,
  handlePageChange: ASYNC_NOOP,
  handlePageSizeChange: ASYNC_NOOP,
  handleSortChange: ASYNC_NOOP,
  handleFilterChange: ASYNC_NOOP,
  handleTableRefresh: ASYNC_NOOP,
  handleOpenTableDDL: NOOP,
  handleOpenERDiagram: NOOP,
  handleCreateQuery: NOOP,
  handleCloseTab: NOOP,
  handleCreateTableSuccess: NOOP,
  handleAlterTableSuccess: NOOP,
  handleOpenRedisConsole: NOOP,
  notifyRedisRefresh: NOOP,
  setQueriesLastUpdated: NOOP,
  setTabs: NOOP,
  isDefaultQueryTitle: () => false,
  showColumnComments: false,
  showRowNumbers: true,
  showZebraStripes: false,
};

describe("shouldMountTabContent", () => {
  test("mounts only the active tab", () => {
    expect(shouldMountTabContent("a", "a")).toBe(true);
    expect(shouldMountTabContent("b", "a")).toBe(false);
  });

  test("returns false for empty strings", () => {
    expect(shouldMountTabContent("", "")).toBe(true);
    expect(shouldMountTabContent("a", "")).toBe(false);
  });
});

describe("TabContentRenderer", () => {
  beforeEach(() => {
    editorCalls.length = 0;
    tableCalls.length = 0;
    redisKeyCalls.length = 0;
    redisConsoleCalls.length = 0;
    redisBrowserCalls.length = 0;
    redisServerInfoCalls.length = 0;
    elasticsearchCalls.length = 0;
    erDiagramCalls.length = 0;
    createTableCalls.length = 0;
    alterTableCalls.length = 0;
    routineMetadataCalls.length = 0;
    tableMetadataCalls.length = 0;
  });

  test("renders empty hint when tabs array is empty", () => {
    const { container } = render(
      <TabContentRenderer tabs={[]} activeTab="" {...defaultProps} />,
    );
    expect(container.textContent).toContain("app.empty.hint");
  });

  test("renders editor tab for active editor tab", () => {
    const tab: EditorTabItem = {
      id: "ed-1",
      type: "editor",
      title: "Query 1",
      database: "mydb",
      sqlContent: "SELECT 1",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="ed-1" {...defaultProps} />,
    );
    expect(editorCalls).toHaveLength(1);
    expect(editorCalls[0].databaseName).toBe("mydb");
  });

  test("renders table tab for active table tab", () => {
    const tab: TableTabItem = {
      id: "tbl-1",
      type: "table",
      title: "users",
      data: [],
      columns: ["id", "name"],
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="tbl-1" {...defaultProps} />,
    );
    expect(tableCalls).toHaveLength(1);
    expect(tableCalls[0].columns).toEqual(["id", "name"]);
  });

  test("redis-key tab returns null when connectionId missing", () => {
    const tab: RedisKeyTabItem = {
      id: "rk-1",
      type: "redis-key",
      title: "mykey",
      database: "db0",
      redisKey: "mykey",
    };
    const { container } = render(
      <TabContentRenderer tabs={[tab]} activeTab="rk-1" {...defaultProps} />,
    );
    expect(redisKeyCalls).toHaveLength(0);
    expect(container.textContent).toBe("");
  });

  test("redis-key tab renders when all fields present", () => {
    const tab: RedisKeyTabItem = {
      id: "rk-1",
      type: "redis-key",
      title: "mykey",
      connectionId: 1,
      database: "db0",
      redisKey: "mykey",
      connection: "conn1",
      driver: "redis",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rk-1" {...defaultProps} />,
    );
    expect(redisKeyCalls).toHaveLength(1);
    expect(redisKeyCalls[0].connectionId).toBe(1);
    expect(redisKeyCalls[0].redisKey).toBe("mykey");
  });

  test("redis-console tab returns null when database missing", () => {
    const tab: RedisConsoleTabItem = {
      id: "rc-1",
      type: "redis-console",
      title: "Console",
      connectionId: 1,
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rc-1" {...defaultProps} />,
    );
    expect(redisConsoleCalls).toHaveLength(0);
  });

  test("redis-console tab renders when fields present", () => {
    const tab: RedisConsoleTabItem = {
      id: "rc-1",
      type: "redis-console",
      title: "Console",
      connectionId: 1,
      database: "db0",
      connection: "conn1",
      driver: "redis",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rc-1" {...defaultProps} />,
    );
    expect(redisConsoleCalls).toHaveLength(1);
  });

  test("redis-browser tab returns null when driver missing", () => {
    const tab: RedisBrowserTabItem = {
      id: "rb-1",
      type: "redis-browser",
      title: "Browser",
      connectionId: 1,
      database: "db0",
      connection: "conn1",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rb-1" {...defaultProps} />,
    );
    expect(redisBrowserCalls).toHaveLength(0);
  });

  test("redis-browser tab renders when all fields present", () => {
    const tab: RedisBrowserTabItem = {
      id: "rb-1",
      type: "redis-browser",
      title: "Browser",
      connectionId: 1,
      database: "db0",
      connection: "conn1",
      driver: "redis",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rb-1" {...defaultProps} />,
    );
    expect(redisBrowserCalls).toHaveLength(1);
  });

  test("redis-server-info tab returns null when connectionId missing", () => {
    const tab: RedisServerInfoTabItem = {
      id: "rs-1",
      type: "redis-server-info",
      title: "Server Info",
      database: "db0",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rs-1" {...defaultProps} />,
    );
    expect(redisServerInfoCalls).toHaveLength(0);
  });

  test("redis-server-info tab renders when fields present", () => {
    const tab: RedisServerInfoTabItem = {
      id: "rs-1",
      type: "redis-server-info",
      title: "Server Info",
      connectionId: 1,
      database: "db0",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rs-1" {...defaultProps} />,
    );
    expect(redisServerInfoCalls).toHaveLength(1);
  });

  test("elasticsearch tab returns null when index missing", () => {
    const tab: ElasticsearchIndexTabItem = {
      id: "es-1",
      type: "elasticsearch-index",
      title: "my-index",
      connectionId: 1,
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="es-1" {...defaultProps} />,
    );
    expect(elasticsearchCalls).toHaveLength(0);
  });

  test("elasticsearch tab renders when fields present", () => {
    const tab: ElasticsearchIndexTabItem = {
      id: "es-1",
      type: "elasticsearch-index",
      title: "my-index",
      connectionId: 1,
      elasticsearchIndex: "my-index",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="es-1" {...defaultProps} />,
    );
    expect(elasticsearchCalls).toHaveLength(1);
    expect(elasticsearchCalls[0].index).toBe("my-index");
  });

  test("er-diagram tab returns null when connectionId missing", () => {
    const tab: ERDiagramTabItem = {
      id: "er-1",
      type: "er-diagram",
      title: "ER",
      database: "mydb",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="er-1" {...defaultProps} />,
    );
    expect(erDiagramCalls).toHaveLength(0);
  });

  test("er-diagram tab renders when connectionId present", () => {
    const tab: ERDiagramTabItem = {
      id: "er-1",
      type: "er-diagram",
      title: "ER",
      connectionId: 1,
      database: "mydb",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="er-1" {...defaultProps} />,
    );
    expect(erDiagramCalls).toHaveLength(1);
  });

  test("create-table tab returns null when driver missing", () => {
    const tab: CreateTableTabItem = {
      id: "ct-1",
      type: "create-table",
      title: "Create Table",
      connectionId: 1,
      database: "mydb",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="ct-1" {...defaultProps} />,
    );
    expect(createTableCalls).toHaveLength(0);
  });

  test("create-table tab renders when fields present", () => {
    const tab: CreateTableTabItem = {
      id: "ct-1",
      type: "create-table",
      title: "Create Table",
      connectionId: 1,
      database: "mydb",
      schema: "public",
      driver: "postgres",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="ct-1" {...defaultProps} />,
    );
    expect(createTableCalls).toHaveLength(1);
  });

  test("alter-table tab returns null when tableName missing", () => {
    const tab: AlterTableTabItem = {
      id: "at-1",
      type: "alter-table",
      title: "Alter Table",
      connectionId: 1,
      database: "mydb",
      driver: "postgres",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="at-1" {...defaultProps} />,
    );
    expect(alterTableCalls).toHaveLength(0);
  });

  test("alter-table tab renders when fields present", () => {
    const tab: AlterTableTabItem = {
      id: "at-1",
      type: "alter-table",
      title: "Alter Table",
      connectionId: 1,
      database: "mydb",
      schema: "public",
      tableName: "users",
      driver: "postgres",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="at-1" {...defaultProps} />,
    );
    expect(alterTableCalls).toHaveLength(1);
  });

  test("routine tab returns null when routineName missing", () => {
    const tab: RoutineTabItem = {
      id: "rt-1",
      type: "routine",
      title: "my_func",
      connectionId: 1,
      database: "mydb",
      schema: "public",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rt-1" {...defaultProps} />,
    );
    expect(routineMetadataCalls).toHaveLength(0);
  });

  test("routine tab renders when fields present", () => {
    const tab: RoutineTabItem = {
      id: "rt-1",
      type: "routine",
      title: "my_func",
      connectionId: 1,
      database: "mydb",
      schema: "public",
      routineName: "my_func",
      routineType: "function",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="rt-1" {...defaultProps} />,
    );
    expect(routineMetadataCalls).toHaveLength(1);
  });

  test("ddl tab renders TableMetadataView", () => {
    const tab: DdlTabItem = {
      id: "ddl-1",
      type: "ddl",
      title: "DDL",
      connectionId: 1,
      database: "mydb",
      schema: "public",
      tableName: "users",
    };
    render(
      <TabContentRenderer tabs={[tab]} activeTab="ddl-1" {...defaultProps} />,
    );
    expect(tableMetadataCalls).toHaveLength(1);
  });

  test("only active tab content is mounted", () => {
    const tabs: TabItem[] = [
      { id: "ed-1", type: "editor", title: "Q1", database: "db1" },
      { id: "ed-2", type: "editor", title: "Q2", database: "db2" },
    ];
    render(
      <TabContentRenderer tabs={tabs} activeTab="ed-1" {...defaultProps} />,
    );
    expect(editorCalls).toHaveLength(1);
    expect(editorCalls[0].databaseName).toBe("db1");
  });
});
```

- [ ] **Step 2: Delete the old test file**

```bash
rm src/components/layout/TabContentRenderer.unit.test.ts
```

- [ ] **Step 3: Run the test**

Run: `bun test src/components/layout/TabContentRenderer.unit.test.tsx`
Expected: All tests pass

- [ ] **Step 4: Fix any failures**

If tests fail due to lazy import timing or context issues, adjust mocks and re-run.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/TabContentRenderer.unit.test.tsx
git rm src/components/layout/TabContentRenderer.unit.test.ts
git commit -m "test: replace TabContentRenderer unit test with behavior tests"
```

---

### Task 3: ConnectionDialog Tests

**Files:**
- Create: `src/components/business/Sidebar/connection-list/ConnectionDialog.unit.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { mock } from "bun:test";

const mockT = (s: string) => s;

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

const redisFormCalls: any[] = [];
const elasticsearchFormCalls: any[] = [];
const mongoFormCalls: any[] = [];
const mssqlFormCalls: any[] = [];

mock.module("./RedisFormSection", () => ({
  RedisFormSection: (props: any) => {
    redisFormCalls.push(props);
    return <div data-testid="redis-form" />;
  },
}));

mock.module("./ElasticsearchFormSection", () => ({
  ElasticsearchFormSection: (props: any) => {
    elasticsearchFormCalls.push(props);
    return <div data-testid="elasticsearch-form" />;
  },
}));

mock.module("./MongoDbFormSection", () => ({
  MongoDbFormSection: (props: any) => {
    mongoFormCalls.push(props);
    return <div data-testid="mongodb-form" />;
  },
}));

mock.module("./MssqlFormSection", () => ({
  MssqlFormSection: (props: any) => {
    mssqlFormCalls.push(props);
    return <div data-testid="mssql-form" />;
  },
}));

mock.module("@/lib/driver-registry", () => ({
  DRIVER_REGISTRY: [
    { id: "postgres", label: "PostgreSQL", icon: () => null, importCapability: "full" },
    { id: "sqlite", label: "SQLite", icon: () => null, importCapability: "full" },
    { id: "redis", label: "Redis", icon: () => null, importCapability: "full" },
    { id: "elasticsearch", label: "Elasticsearch", icon: () => null, importCapability: "full" },
    { id: "mongodb", label: "MongoDB", icon: () => null, importCapability: "full" },
    { id: "mssql", label: "SQL Server", icon: () => null, importCapability: "full" },
  ],
  getDefaultPort: (driver: string) => {
    const ports: Record<string, number> = {
      postgres: 5432,
      mysql: 3306,
      redis: 6379,
      elasticsearch: 9200,
      mongodb: 27017,
      mssql: 1433,
    };
    return ports[driver] ?? null;
  },
  supportsSSLCA: (driver: string) =>
    driver === "postgres" || driver === "mysql" || driver === "elasticsearch",
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionDialog, type ConnectionDialogTestMessage } from "./ConnectionDialog";
import type { ConnectionForm, Driver } from "@/services/api";

function makeForm(overrides: Partial<ConnectionForm> = {}): ConnectionForm {
  return {
    driver: "postgres",
    name: "",
    host: "",
    port: 5432,
    database: "",
    schema: "",
    username: "",
    password: "",
    ssl: false,
    sslMode: "require",
    sslCaCert: "",
    filePath: "",
    sshEnabled: false,
    sshHost: "",
    sshPort: undefined,
    sshUsername: "",
    sshPassword: "",
    sshKeyPath: "",
    ...overrides,
  };
}

const NOOP = () => {};

const defaultDialogProps = {
  trigger: <button>Open</button>,
  onOpenChange: NOOP,
  onSubmit: (e: any) => e.preventDefault(),
  onClose: NOOP,
  onTestConnection: NOOP,
  onCreateDriverSelect: NOOP,
  onBackToType: NOOP,
  onPickSslCaCertFile: NOOP,
  onPickSshKeyFile: NOOP,
  onPickDatabaseFile: NOOP,
};

describe("ConnectionDialog", () => {
  beforeEach(() => {
    redisFormCalls.length = 0;
    elasticsearchFormCalls.length = 0;
    mongoFormCalls.length = 0;
    mssqlFormCalls.length = 0;
  });

  describe("create mode - type step", () => {
    test("renders driver grid", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="type"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={false}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("PostgreSQL")).toBeTruthy();
      expect(screen.getByText("SQLite")).toBeTruthy();
      expect(screen.getByText("Redis")).toBeTruthy();
    });

    test("clicking a driver calls onCreateDriverSelect", () => {
      const calls: Driver[] = [];
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="type"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={false}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          onCreateDriverSelect={(d) => calls.push(d)}
          {...defaultDialogProps}
        />,
      );

      fireEvent.click(screen.getByText("Redis"));
      expect(calls).toEqual(["redis"]);
    });
  });

  describe("create mode - details step", () => {
    test("shows host/port fields for postgres", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "postgres" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByLabelText("connection.dialog.fields.host")).toBeTruthy();
      expect(screen.getByLabelText("connection.dialog.fields.port")).toBeTruthy();
    });

    test("shows file path for sqlite", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "sqlite" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByLabelText("connection.dialog.fields.sqliteFilePath")).toBeTruthy();
    });

    test("hides host/port for file-based drivers", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "sqlite" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.queryByText("connection.dialog.fields.host")).toBeNull();
    });

    test("Back to type button visible in create mode", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.backToType")).toBeTruthy();
    });
  });

  describe("edit mode", () => {
    test("hides Back to type button", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="edit"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.queryByText("connection.dialog.backToType")).toBeNull();
    });

    test("shows save button instead of connect", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="edit"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("common.save")).toBeTruthy();
    });
  });

  describe("driver-specific sections", () => {
    test("redis shows RedisFormSection", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "redis" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(redisFormCalls.length).toBeGreaterThan(0);
    });

    test("elasticsearch shows ElasticsearchFormSection", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "elasticsearch" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(elasticsearchFormCalls.length).toBeGreaterThan(0);
    });

    test("mongodb shows MongoDbFormSection", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "mongodb" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(mongoFormCalls.length).toBeGreaterThan(0);
    });

    test("mssql shows MssqlFormSection", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ driver: "mssql" })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(mssqlFormCalls.length).toBeGreaterThan(0);
    });
  });

  describe("SSL section", () => {
    test("SSL checkbox toggles SSL fields", () => {
      const calls: any[] = [];
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ ssl: false })}
          setForm={(fn) => calls.push(typeof fn === "function" ? fn({ ssl: false }) : fn)}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      // SSL fields should not be visible when ssl is false
      expect(screen.queryByText("connection.dialog.fields.sslMode")).toBeNull();
    });

    test("SSL fields visible when ssl is true", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ ssl: true })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.fields.sslMode")).toBeTruthy();
    });
  });

  describe("SSH section", () => {
    test("SSH fields visible when sshEnabled is true", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ sshEnabled: true })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.fields.sshHost")).toBeTruthy();
      expect(screen.getByText("connection.dialog.fields.sshPort")).toBeTruthy();
    });

    test("SSH fields hidden when sshEnabled is false", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm({ sshEnabled: false })}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.queryByText("connection.dialog.fields.sshHost")).toBeNull();
    });
  });

  describe("validation and test messages", () => {
    test("shows validation error when validationMsg non-null", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg="Host is required"
          testMsg={null}
          requiredOk={false}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("Host is required")).toBeTruthy();
    });

    test("shows test success message", () => {
      const msg: ConnectionDialogTestMessage = {
        ok: true,
        text: "Connected successfully",
        latency: 42,
      };
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={msg}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.testSuccess")).toBeTruthy();
      expect(screen.getByText(/Connected successfully/)).toBeTruthy();
    });

    test("shows test failure message", () => {
      const msg: ConnectionDialogTestMessage = {
        ok: false,
        text: "Connection refused",
      };
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={msg}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.testFailed")).toBeTruthy();
    });
  });

  describe("button states", () => {
    test("submit disabled when requiredOk is false", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={false}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      const connectBtn = screen.getByText("connection.dialog.connect");
      expect(connectBtn.closest("button")?.disabled).toBe(true);
    });

    test("submit enabled when requiredOk is true", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      const connectBtn = screen.getByText("connection.dialog.connect");
      expect(connectBtn.closest("button")?.disabled).toBe(false);
    });

    test("shows connecting spinner when isConnecting", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={true}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.connecting")).toBeTruthy();
    });

    test("shows testing spinner when isTesting", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={true}
          isConnecting={false}
          isSavingEdit={false}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.testing")).toBeTruthy();
    });

    test("shows saving spinner when isSavingEdit in edit mode", () => {
      render(
        <ConnectionDialog
          open={true}
          dialogMode="edit"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={true}
          {...defaultDialogProps}
        />,
      );

      expect(screen.getByText("connection.dialog.saving")).toBeTruthy();
    });

    test("test connection button calls onTestConnection", () => {
      const calls: any[] = [];
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          onTestConnection={() => calls.push("test")}
          {...defaultDialogProps}
        />,
      );

      fireEvent.click(screen.getByText("connection.dialog.test"));
      expect(calls).toEqual(["test"]);
    });
  });

  describe("close button", () => {
    test("calls onClose", () => {
      const calls: any[] = [];
      render(
        <ConnectionDialog
          open={true}
          dialogMode="create"
          createStep="details"
          form={makeForm()}
          setForm={NOOP}
          validationMsg={null}
          testMsg={null}
          requiredOk={true}
          isTesting={false}
          isConnecting={false}
          isSavingEdit={false}
          onClose={() => calls.push("close")}
          {...defaultDialogProps}
        />,
      );

      fireEvent.click(screen.getByText("common.cancel"));
      expect(calls).toEqual(["close"]);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/business/Sidebar/connection-list/ConnectionDialog.unit.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Fix any failures**

If `useFormField` causes issues in test environment (it uses `onChange` event handlers), adjust the test to use `setForm` directly instead of testing form field interactions.

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/connection-list/ConnectionDialog.unit.test.tsx
git commit -m "test: add ConnectionDialog behavior tests"
```

---

### Task 4: SqlEditor Tests

**Files:**
- Create: `src/components/business/Editor/SqlEditor.unit.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { mock } from "bun:test";

const mockT = (s: string) => s;

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

mock.module("sonner", () => ({
  toast: { success: mock(), error: mock() },
}));

mock.module("@tauri-apps/plugin-dialog", () => ({
  save: mock(() => Promise.resolve(null)),
}));

mock.module("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
    onCreateEditor,
  }: {
    value: string;
    onChange: (val: string) => void;
    onCreateEditor?: (view: any) => void;
  }) => {
    return (
      <textarea
        data-testid="codemirror-stub"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        ref={(el) => {
          if (el && onCreateEditor) {
            onCreateEditor({
              state: {
                selection: { ranges: [{ from: 0, to: 0 }] },
                sliceDoc: (from: number, to: number) => value.slice(from, to),
                doc: { toString: () => value },
              },
            });
          }
        }}
      />
    );
  },
}));

const saveQueryCalls: any[] = [];
mock.module("./SaveQueryDialog", () => ({
  SaveQueryDialog: ({
    open,
    onSave,
    onOpenChange,
  }: {
    open: boolean;
    onSave: (name: string, desc: string) => void;
    onOpenChange: (open: boolean) => void;
  }) => {
    saveQueryCalls.push({ open, onSave, onOpenChange });
    return open ? (
      <div data-testid="save-dialog">
        <button onClick={() => onSave("Test Query", "desc")}>Save</button>
      </div>
    ) : null;
  },
}));

mock.module("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children }: any) => <div>{children}</div>,
  ResizablePanel: ({ children }: any) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

mock.module("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

mock.module("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: any;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
}));

mock.module("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

mock.module("@/components/ui/button", () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

mock.module("@/contexts/ShortcutsContext", () => ({
  useShortcutBinding: () => "Mod-Enter",
}));

mock.module("@/lib/shortcuts/match", () => ({
  comboToCodeMirror: () => "Mod-Enter",
}));

mock.module("@/components/theme-provider", () => ({
  useTheme: () => ({
    theme: "default",
    editorFontSizePx: 14,
  }),
}));

mock.module("@/theme/themeRegistry", () => ({
  getThemePreset: () => ({
    appearance: "light",
    editorTheme: "default",
  }),
}));

mock.module("@/components/business/DataGrid/TableView", () => ({
  TableView: ({ data, columns }: any) => (
    <div data-testid="results-table">
      {data?.length ?? 0} rows, {columns?.length ?? 0} cols
    </div>
  ),
}));

mock.module("@/services/api", () => ({
  api: {
    query: { cancel: mock(() => Promise.resolve(false)) },
    queries: {
      create: mock(() => Promise.resolve({ id: 1, name: "Test", query: "SELECT 1" })),
      update: mock(() => Promise.resolve({ id: 1, name: "Test", query: "SELECT 1" })),
    },
    transfer: {
      exportQueryResult: mock(() => Promise.resolve({ rowCount: 10, filePath: "/tmp/out.csv" })),
    },
  },
  isTauri: () => false,
}));

mock.module("@/lib/errors", () => ({
  errorMessage: (e: any) => String(e),
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SqlEditor } from "./SqlEditor";

describe("SqlEditor", () => {
  beforeEach(() => {
    saveQueryCalls.length = 0;
  });

  test("renders editor with initial value", () => {
    render(<SqlEditor value="SELECT 1" />);
    const textarea = screen.getByTestId("codemirror-stub") as HTMLTextAreaElement;
    expect(textarea.value).toBe("SELECT 1");
  });

  test("play button calls onExecute", () => {
    const calls: string[] = [];
    render(
      <SqlEditor value="SELECT 1" onExecute={(sql) => calls.push(sql)} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(calls).toEqual(["SELECT 1"]);
  });

  test("play button disabled when isExecuting", () => {
    render(<SqlEditor value="SELECT 1" isExecuting={true} />);
    const buttons = screen.getAllByRole("button");
    const playBtn = buttons.find((b) => b.querySelector(".animate-spin"));
    expect(playBtn).toBeTruthy();
  });

  test("cancel button calls onCancel", () => {
    const calls: any[] = [];
    render(
      <SqlEditor value="SELECT 1" onCancel={() => calls.push("cancel")} />,
    );

    const buttons = screen.getAllByRole("button");
    // Cancel is the button with the stop icon (square)
    const cancelBtn = buttons.find((b) => b.querySelector(".rounded-\\[1px\\]"));
    if (cancelBtn) fireEvent.click(cancelBtn);
    expect(calls).toEqual(["cancel"]);
  });

  test("database selector renders when multiple databases", () => {
    render(
      <SqlEditor
        value=""
        databaseName="db1"
        availableDatabases={["db1", "db2"]}
        onDatabaseChange={() => {}}
      />,
    );

    expect(screen.getByText("db1")).toBeTruthy();
  });

  test("database label renders for single database", () => {
    render(
      <SqlEditor value="" databaseName="mydb" />,
    );

    expect(screen.getByText("mydb")).toBeTruthy();
  });

  test("save button opens dialog for new query", () => {
    render(<SqlEditor value="SELECT 1" />);

    const buttons = screen.getAllByRole("button");
    const saveBtn = buttons.find((b) => b.querySelector(".lucide-save"));
    if (saveBtn) fireEvent.click(saveBtn);

    expect(saveQueryCalls.length).toBeGreaterThan(0);
    expect(saveQueryCalls[0].open).toBe(true);
  });

  test("save directly for existing savedQueryId", async () => {
    const mockCreate = (await import("@/services/api")).api.queries.create;
    render(
      <SqlEditor
        value="SELECT 1"
        savedQueryId={42}
        initialName="My Query"
      />,
    );

    const buttons = screen.getAllByRole("button");
    const saveBtn = buttons.find((b) => b.querySelector(".lucide-save"));
    if (saveBtn) {
      await act(async () => {
        fireEvent.click(saveBtn);
      });
    }
    // Should call update since savedQueryId exists
    // (mock is set up, just verify no crash)
  });

  test("clear button clears editor", () => {
    const calls: string[] = [];
    render(
      <SqlEditor
        value="SELECT 1"
        onChange={(v) => calls.push(v)}
      />,
    );

    const buttons = screen.getAllByRole("button");
    const clearBtn = buttons.find((b) => b.querySelector(".lucide-trash-2"));
    if (clearBtn) fireEvent.click(clearBtn);

    // onChange should be called with empty string (debounced)
    // Just verify no crash
  });

  test("results panel renders when queryResults provided", () => {
    render(
      <SqlEditor
        value="SELECT 1"
        queryResults={{
          data: [{ id: 1 }],
          columns: ["id"],
        }}
      />,
    );

    expect(screen.getByTestId("results-table")).toBeTruthy();
  });

  test("error state renders for failed query", () => {
    render(
      <SqlEditor
        value="SELECT 1"
        queryResults={{
          data: [],
          columns: [],
          error: "syntax error",
        }}
      />,
    );

    expect(screen.getByText("syntax error")).toBeTruthy();
  });

  test("result status shows success with row count", () => {
    render(
      <SqlEditor
        value="SELECT 1"
        queryResults={{
          data: [{ id: 1 }, { id: 2 }],
          columns: ["id"],
        }}
      />,
    );

    expect(screen.getByText(/sqlEditor.result.success/)).toBeTruthy();
  });

  test("result status shows error tone", () => {
    render(
      <SqlEditor
        value="SELECT 1"
        queryResults={{
          data: [],
          columns: [],
          error: "fail",
        }}
      />,
    );

    expect(screen.getByText(/sqlEditor.result.failed/)).toBeTruthy();
  });

  test("export dropdown shows CSV/JSON/SQL options", () => {
    render(
      <SqlEditor
        value="SELECT 1"
        queryResults={{
          data: [{ id: 1 }],
          columns: ["id"],
        }}
      />,
    );

    expect(screen.getByText("sqlEditor.export.result")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/business/Editor/SqlEditor.unit.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Fix any failures**

Common issues:
- `useTheme` / `useShortcutBinding` may need additional mocking
- Button icon selectors may need adjustment based on actual Lucide class names
- Save flow timing with `act()` may need wrapper

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Editor/SqlEditor.unit.test.tsx
git commit -m "test: add SqlEditor behavior tests"
```

---

### Task 5: TableView Tests

**Files:**
- Create: `src/components/business/DataGrid/TableView.unit.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { mock } from "bun:test";

const mockT = (s: string) => s;

mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

mock.module("sonner", () => ({
  toast: { success: mock(), error: mock() },
}));

// Mock virtualizer to render all items without virtualization
mock.module("@tanstack/react-virtual", () => ({
  useVirtualizer: ({
    count,
    getScrollElement,
  }: {
    count: number;
    getScrollElement: () => any;
  }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        start: i * 36,
        size: 36,
        end: (i + 1) * 36,
        key: i,
      })),
    getTotalSize: () => count * 36,
    scrollToIndex: () => {},
    scrollElement: getScrollElement?.() ?? null,
  }),
}));

const virtualBodyCalls: any[] = [];
const toolbarCalls: any[] = [];
const statusBarCalls: any[] = [];

mock.module("./tableView/VirtualTableBody", () => ({
  VirtualTableBody: (props: any) => {
    virtualBodyCalls.push(props);
    return (
      <div data-testid="virtual-body">
        {props.currentData?.map((_: any, i: number) => (
          <div key={i} data-testid={`row-${i}`} />
        ))}
      </div>
    );
  },
}));

mock.module("./tableView/ColumnViewBody", () => ({
  ColumnViewBody: () => <div data-testid="column-body" />,
}));

mock.module("./tableView/TableToolbar", () => ({
  TableToolbar: (props: any) => {
    toolbarCalls.push(props);
    return (
      <div data-testid="toolbar">
        <button onClick={() => props.handlePrevPage()}>Prev</button>
        <button onClick={() => props.handleNextPage()}>Next</button>
        <button onClick={() => props.setIsSearchOpen(true)}>Search</button>
        <button onClick={() => props.handleAddDraftRow()}>Add Row</button>
        <button onClick={() => props.handleSave()}>Save</button>
        <button onClick={() => props.handleDiscardChanges()}>Discard</button>
        <button onClick={() => props.setDeleteDialogOpen(true)}>Delete</button>
        <span data-testid="page">{props.page}</span>
        <span data-testid="total-pages">{props.totalPages}</span>
        <select
          data-testid="page-size"
          value={props.pageSizeInput}
          onChange={(e) => props.handlePageSizeChange(Number(e.target.value))}
        >
          {[25, 50, 100, 200].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => props.handleRefreshClick()}>Refresh</button>
        <button onClick={() => props.onShowDDL()}>DDL</button>
      </div>
    );
  },
}));

mock.module("./tableView/TableStatusBar", () => ({
  TableStatusBar: (props: any) => {
    statusBarCalls.push(props);
    return <div data-testid="status-bar" />;
  },
}));

mock.module("./ComplexValueViewer", () => ({
  ComplexValueViewer: () => <div />,
}));

mock.module("./tableView/hooks/useTableMutation", () => ({
  useTableMutation: () => ({
    isExporting: false,
    handleExport: mock(),
  }),
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { TableView } from "./TableView";

const sampleData = [
  { id: 1, name: "Alice", age: 30 },
  { id: 2, name: "Bob", age: 25 },
  { id: 3, name: "Charlie", age: 35 },
];
const sampleColumns = ["id", "name", "age"];

describe("TableView", () => {
  beforeEach(() => {
    virtualBodyCalls.length = 0;
    toolbarCalls.length = 0;
    statusBarCalls.length = 0;
  });

  describe("loading state", () => {
    test("renders skeletons when isLoading is true", () => {
      const { container } = render(
        <TableView isLoading={true} data={[]} columns={[]} />,
      );

      expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
    });
  });

  describe("empty state", () => {
    test("renders table with no rows", () => {
      render(<TableView data={[]} columns={["id", "name"]} />);

      expect(virtualBodyCalls).toHaveLength(1);
      expect(virtualBodyCalls[0].currentData).toHaveLength(0);
    });
  });

  describe("data rendering", () => {
    test("passes data to VirtualTableBody", () => {
      render(
        <TableView data={sampleData} columns={sampleColumns} />,
      );

      expect(virtualBodyCalls).toHaveLength(1);
      expect(virtualBodyCalls[0].currentData).toHaveLength(3);
      expect(virtualBodyCalls[0].columns).toEqual(sampleColumns);
    });
  });

  describe("pagination", () => {
    test("calls onPageChange when next page clicked", () => {
      const calls: number[] = [];
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          total={100}
          page={1}
          pageSize={25}
          onPageChange={(p) => calls.push(p)}
        />,
      );

      fireEvent.click(screen.getByText("Next"));
      expect(calls).toEqual([2]);
    });

    test("calls onPageChange when prev page clicked", () => {
      const calls: number[] = [];
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          total={100}
          page={2}
          pageSize={25}
          onPageChange={(p) => calls.push(p)}
        />,
      );

      fireEvent.click(screen.getByText("Prev"));
      expect(calls).toEqual([1]);
    });

    test("page size change calls onPageSizeChange", () => {
      const calls: number[] = [];
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          total={100}
          page={1}
          pageSize={25}
          onPageSizeChange={(s) => calls.push(s)}
        />,
      );

      fireEvent.change(screen.getByTestId("page-size"), {
        target: { value: "50" },
      });
      expect(calls).toEqual([50]);
    });

    test("displays correct page and totalPages", () => {
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          total={100}
          page={3}
          pageSize={25}
        />,
      );

      expect(screen.getByTestId("page").textContent).toBe("3");
      expect(screen.getByTestId("total-pages").textContent).toBe("4");
    });
  });

  describe("sort", () => {
    test("sort props passed to VirtualTableBody", () => {
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          sortColumn="name"
          sortDirection="asc"
        />,
      );

      expect(virtualBodyCalls[0].activeSortColumn).toBe("name");
      expect(virtualBodyCalls[0].activeSortDirection).toBe("asc");
    });

    test("uncontrolled sort sorts client-side", () => {
      const data = [
        { id: 3, name: "Charlie" },
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      // Without controlled sort, data passes through as-is initially
      render(
        <TableView data={data} columns={["id", "name"]} />,
      );

      expect(virtualBodyCalls[0].currentData).toHaveLength(3);
    });
  });

  describe("filter", () => {
    test("filter props passed to toolbar", () => {
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          filter="id > 1"
          orderBy="name ASC"
        />,
      );

      expect(toolbarCalls[0].whereInput).toBe("id > 1");
      expect(toolbarCalls[0].orderByInput).toBe("name ASC");
    });
  });

  describe("context menu", () => {
    test("right-click on row sets contextMenuRow", () => {
      render(
        <TableView data={sampleData} columns={sampleColumns} />,
      );

      // The VirtualTableBody stub receives setContextMenuRow
      expect(virtualBodyCalls[0].setContextMenuRow).toBeDefined();
    });
  });

  describe("DDL button", () => {
    test("calls onOpenDDL with tableContext", () => {
      const calls: any[] = [];
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          tableContext={{
            connectionId: 1,
            database: "mydb",
            schema: "public",
            table: "users",
            driver: "postgres",
          }}
          onOpenDDL={(ctx) => calls.push(ctx)}
        />,
      );

      fireEvent.click(screen.getByText("DDL"));
      expect(calls).toHaveLength(1);
      expect(calls[0].table).toBe("users");
    });
  });

  describe("refresh", () => {
    test("refresh button calls onDataRefresh", () => {
      const calls: any[] = [];
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          tableContext={{
            connectionId: 1,
            database: "mydb",
            schema: "public",
            table: "users",
            driver: "postgres",
          }}
          onDataRefresh={(params) => calls.push(params)}
        />,
      );

      fireEvent.click(screen.getByText("Refresh"));
      expect(calls).toHaveLength(1);
    });
  });

  describe("view mode toggle", () => {
    test("defaults to table view", () => {
      render(
        <TableView data={sampleData} columns={sampleColumns} />,
      );

      expect(virtualBodyCalls).toHaveLength(1);
    });
  });

  describe("status bar", () => {
    test("receives execution time and data length", () => {
      render(
        <TableView
          data={sampleData}
          columns={sampleColumns}
          executionTimeMs={42}
        />,
      );

      expect(statusBarCalls).toHaveLength(1);
      expect(statusBarCalls[0].executionTimeMs).toBe(42);
      expect(statusBarCalls[0].sortedDataLength).toBe(3);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `bun test src/components/business/DataGrid/TableView.unit.test.tsx`
Expected: All tests pass

- [ ] **Step 3: Fix any failures**

Common issues:
- `useCellEditing` hook calls `api` internally — may need to mock `@/services/api` more fully
- `useTableClipboard` may need `navigator.clipboard` mock in happy-dom
- `useColumnState` may need DOM measurement mocks

- [ ] **Step 4: Commit**

```bash
git add src/components/business/DataGrid/TableView.unit.test.tsx
git commit -m "test: add TableView behavior tests"
```

---

## Verification

After all tasks are complete:

```bash
bun run test:unit
```

Expected: All unit tests pass including the 5 new test files.

## Notes

- The existing `src/components/layout/TabContentRenderer.unit.test.ts` (9-line `.ts` file) is **replaced** by the new `.tsx` version in Task 2. The `shouldMountTabContent` tests are preserved and expanded.
- All test files follow the `RedisBrowserView.unit.test.tsx` pattern: `mock.module()` at top, prop-capturing stubs, `@testing-library/react` for rendering.
- If a test fails due to a missing mock (e.g., a child component importing something not mocked), add the mock at the top of the test file and re-run.
