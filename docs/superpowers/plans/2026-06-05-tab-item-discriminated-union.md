# TabItem Discriminated Union Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `TabItem` interface (30+ optional fields) with a discriminated union of 12 subtypes so the type system enforces correct fields per tab kind.

**Architecture:** Each tab type gets its own interface with a literal `type` discriminator. `TabItem` becomes the union. Files that construct tabs get precise types; files that consume `TabItem` generically are unchanged.

**Tech Stack:** TypeScript, React

---

### Task 1: Define 12 subtypes in `src/types/tab.ts`

**Files:**
- Modify: `src/types/tab.ts`

- [ ] **Step 1: Replace the `TabItem` interface with 12 subtypes and a union**

Replace the entire content of `src/types/tab.ts` with:

```ts
import type { RoutineType, SchemaOverview } from "@/services/api";
import type { SingleResultState } from "@/lib/queryExecutionState";

export interface QueryResults {
  data: any[];
  columns: string[];
  executionTime: string;
  error?: string;
  resultSets?: SingleResultState[];
  activeResultSetIndex?: number;
}

export interface EditorTabItem {
  type: "editor";
  id: string;
  title: string;
  connectionId?: number;
  connection?: string;
  database?: string;
  driver?: string;
  sqlContent?: string;
  lastSavedSql?: string;
  isDirty?: boolean;
  queryResults?: QueryResults | null;
  activeQueryId?: string;
  lastQueryId?: string;
  schemaOverview?: SchemaOverview;
  savedQueryId?: number;
  savedQueryDescription?: string;
  availableDatabases?: string[];
}

export interface TableTabItem {
  type: "table";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  schema?: string;
  tableName?: string;
  connectionId?: number;
  driver?: string;
  data?: any[];
  columns?: string[];
  total?: number;
  page?: number;
  pageSize?: number;
  executionTimeMs?: number;
  isLoading?: boolean;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  filter?: string;
  orderBy?: string;
}

export interface DdlTabItem {
  type: "ddl";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
  tableName?: string;
}

export interface RoutineTabItem {
  type: "routine";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  schema?: string;
  connectionId?: number;
  driver?: string;
  routineName?: string;
  routineType?: RoutineType;
}

export interface CreateTableTabItem {
  type: "create-table";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
  driver?: string;
}

export interface AlterTableTabItem {
  type: "alter-table";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
  tableName?: string;
  driver?: string;
}

export interface RedisKeyTabItem {
  type: "redis-key";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
  redisKey?: string;
}

export interface RedisConsoleTabItem {
  type: "redis-console";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
}

export interface RedisBrowserTabItem {
  type: "redis-browser";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
}

export interface RedisServerInfoTabItem {
  type: "redis-server-info";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
}

export interface ElasticsearchIndexTabItem {
  type: "elasticsearch-index";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
  elasticsearchIndex?: string;
}

export interface ERDiagramTabItem {
  type: "er-diagram";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
}

export type TabItem =
  | EditorTabItem
  | TableTabItem
  | DdlTabItem
  | RoutineTabItem
  | CreateTableTabItem
  | AlterTableTabItem
  | RedisKeyTabItem
  | RedisConsoleTabItem
  | RedisBrowserTabItem
  | RedisServerInfoTabItem
  | ElasticsearchIndexTabItem
  | ERDiagramTabItem;
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -50`
Expected: Type errors in files that construct or consume `TabItem` with fields not on the union — these will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types/tab.ts
git commit -m "refactor: replace TabItem interface with discriminated union of 12 subtypes"
```

---

### Task 2: Update `TabContentRenderer.tsx` renderer signatures

**Files:**
- Modify: `src/components/layout/TabContentRenderer.tsx`

- [ ] **Step 1: Add subtype imports**

Add these imports alongside the existing `TabItem` import:

```ts
import type {
  TabItem,
  EditorTabItem,
  TableTabItem,
  DdlTabItem,
  RoutineTabItem,
  CreateTableTabItem,
  AlterTableTabItem,
  RedisKeyTabItem,
  RedisConsoleTabItem,
  RedisBrowserTabItem,
  RedisServerInfoTabItem,
  ElasticsearchIndexTabItem,
  ERDiagramTabItem,
} from "@/types/tab";
```

- [ ] **Step 2: Update each renderer function's `tab` parameter type**

Change each function signature from `{ tab: TabItem; ... }` to its specific subtype:

```ts
function EditorTab({ tab, props }: { tab: EditorTabItem; props: TabContentRendererProps }) {
```

```ts
function TableTab({ tab, props }: { tab: TableTabItem; props: TabContentRendererProps }) {
```

```ts
function RedisKeyTab({ tab, props }: { tab: RedisKeyTabItem; props: TabContentRendererProps }) {
```

```ts
function RedisConsoleTab({ tab }: { tab: RedisConsoleTabItem }) {
```

```ts
function RedisBrowserTab({ tab, props }: { tab: RedisBrowserTabItem; props: TabContentRendererProps }) {
```

```ts
function RedisServerInfoTab({ tab }: { tab: RedisServerInfoTabItem }) {
```

```ts
function ElasticsearchIndexTab({ tab }: { tab: ElasticsearchIndexTabItem }) {
```

```ts
function ERDiagramTab({ tab }: { tab: ERDiagramTabItem }) {
```

```ts
function CreateTableTab({ tab, props }: { tab: CreateTableTabItem; props: TabContentRendererProps }) {
```

```ts
function AlterTableTab({ tab, props }: { tab: AlterTableTabItem; props: TabContentRendererProps }) {
```

```ts
function RoutineTab({ tab }: { tab: RoutineTabItem }) {
```

```ts
function MetadataFallbackTab({ tab }: { tab: DdlTabItem }) {
```

- [ ] **Step 3: Update `TabRenderer` type**

Change from:
```ts
type TabRenderer = ComponentType<{ tab: TabItem; props: TabContentRendererProps }>;
```
to:
```ts
type TabRenderer = ComponentType<{ tab: any; props: TabContentRendererProps }>;
```

This is needed because the TAB_RENDERERS map values accept different tab subtypes. The dispatch is already type-safe via the `Record<TabItem["type"], TabRenderer>` key type.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -50`
Expected: Fewer errors than before. Remaining errors in hooks files.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/TabContentRenderer.tsx
git commit -m "refactor: narrow renderer tab parameter types to specific subtypes"
```

---

### Task 3: Update `useTabFactory.ts`

**Files:**
- Modify: `src/hooks/useTabFactory.ts`

- [ ] **Step 1: Add subtype imports**

Replace the `TabItem` import with specific subtypes:

```ts
import type {
  TabItem,
  RedisConsoleTabItem,
  RedisBrowserTabItem,
  RedisServerInfoTabItem,
  ElasticsearchIndexTabItem,
  DdlTabItem,
  RoutineTabItem,
  CreateTableTabItem,
  AlterTableTabItem,
  RedisKeyTabItem,
  ERDiagramTabItem,
} from "@/types/tab";
```

- [ ] **Step 2: Update `openOrCreateTab` signature**

Change from:
```ts
const openOrCreateTab = useCallback(
  (tabId: string, tabData: Omit<TabItem, "id">) => {
```
to:
```ts
const openOrCreateTab = useCallback(
  (tabId: string, tabData: Omit<TabItem, "id"> & { type: TabItem["type"] }) => {
```

This ensures each factory function's object literal is checked against the union.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -50`
Expected: No new errors from this file. The object literals already match their respective subtypes.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTabFactory.ts
git commit -m "refactor: use specific subtypes in useTabFactory"
```

---

### Task 4: Update `useQueryEditor.ts`

**Files:**
- Modify: `src/hooks/useQueryEditor.ts`

- [ ] **Step 1: Add `EditorTabItem` import**

Change the import:
```ts
import type { TabItem, EditorTabItem } from "@/types/tab";
```

- [ ] **Step 2: Update `handleCreateQuery` tab construction**

Change the type annotation on line 65 from `const newTab: TabItem = {` to `const newTab: EditorTabItem = {`. The object literal stays the same.

- [ ] **Step 3: Update `handleOpenSavedQuery` tab constructions**

Change both `const newTab: TabItem = {` (lines 196 and 221) to `const newTab: EditorTabItem = {`.

- [ ] **Step 4: Update `saveEditorTab` parameter type**

Change from:
```ts
const saveEditorTab = useCallback(
  async (tab: TabItem, name: string, description: string) => {
    if (tab.type !== "editor") return;
```
to:
```ts
const saveEditorTab = useCallback(
  async (tab: EditorTabItem, name: string, description: string) => {
```

Remove the `if (tab.type !== "editor") return;` guard — the type now guarantees this.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -50`
Expected: No errors from this file.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useQueryEditor.ts
git commit -m "refactor: use EditorTabItem in useQueryEditor"
```

---

### Task 5: Update `useTableViewer.ts`

**Files:**
- Modify: `src/hooks/useTableViewer.ts`

- [ ] **Step 1: Add `TableTabItem` import**

Change the import:
```ts
import type { TabItem, TableTabItem } from "@/types/tab";
```

- [ ] **Step 2: Update `handleTableSelect` placeholder tab construction**

Add a type annotation to the object literal in `setTabs` (line 52):

```ts
setTabs((prev) => [
  ...prev,
  {
    id: tabId,
    type: "table",
    title: table,
    connection,
    database,
    connectionId,
    driver,
    isLoading: true,
  } satisfies TableTabItem,
]);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -50`
Expected: No errors from this file.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useTableViewer.ts
git commit -m "refactor: use TableTabItem in useTableViewer"
```

---

### Task 6: Update test file

**Files:**
- Modify: `src/hooks/useTabManager.unit.test.ts`

- [ ] **Step 1: Update import and `makeTab` return type**

Change:
```ts
import type { TabItem } from "@/types/tab";

function makeTab(id: string, title?: string): TabItem {
  return {
    id,
    type: "editor",
    title: title ?? `Tab ${id}`,
  };
}
```
to:
```ts
import type { EditorTabItem } from "@/types/tab";

function makeTab(id: string, title?: string): EditorTabItem {
  return {
    id,
    type: "editor",
    title: title ?? `Tab ${id}`,
  };
}
```

- [ ] **Step 2: Run tests**

Run: `npm run test -- src/hooks/useTabManager.unit.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTabManager.unit.test.ts
git commit -m "refactor: use EditorTabItem in test helper"
```

---

### Task 7: Final verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: All tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Commit (if any fixes needed)**

If any lint or type issues were found and fixed in steps 1-3, commit them:

```bash
git add -A
git commit -m "refactor: fix lint/type issues from TabItem union refactor"
```
