# RedisStreamViewer Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 1576-line RedisStreamViewer.tsx into feature-domain hooks + file-per-component structure, reducing the main component to ~80 lines of pure assembly.

**Architecture:** Extract 3 custom hooks (useStreamBrowser, useConsumerGroups, useXreadgroup) for business logic, move 5 sub-components to individual files under `stream/`, and consolidate pure utilities into `stream/utils.ts`. No behavior changes.

**Tech Stack:** React, TypeScript, Tauri

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `stream/utils.ts` | Pure functions + StreamBrowserState interface |
| Create | `stream/hooks/useStreamBrowser.ts` | XRANGE browsing, pagination, entry CRUD |
| Create | `stream/hooks/useConsumerGroups.ts` | Group CRUD, pending, ack/claim, trim |
| Create | `stream/hooks/useXreadgroup.ts` | XREADGROUP mode state + read logic |
| Create | `stream/StreamFilterBar.tsx` | Filter bar UI (XRANGE + XREADGROUP modes) |
| Create | `stream/StreamSummaryCards.tsx` | Stream summary cards + trim button |
| Create | `stream/StreamGroupsTable.tsx` | Groups table + expandable pending panel |
| Create | `stream/StreamEntriesTable.tsx` | Entries table + expandable entry row |
| Create | `stream/StreamAddEntryForm.tsx` | Add entry form |
| Rewrite | `RedisStreamViewer.tsx` | Pure assembly (~80 lines) |

All paths relative to `src/components/business/Redis/value-viewer/`.

---

### Task 1: Create stream/utils.ts

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/utils.ts`

- [ ] **Step 1: Create utils.ts with all pure functions**

```typescript
import type { RedisKeyExtra, RedisStreamEntry, RedisStreamGroup, RedisStreamView } from "@/services/api";

export const DEFAULT_PAGE_SIZE = 200;

export interface StreamBrowserState {
  startIdInput: string;
  endIdInput: string;
  countInput: string;
  appliedStartId: string;
  appliedEndId: string;
  pageSize: number;
  nextStartId: string | null;
  totalLen: number | null;
  streamInfo: RedisKeyExtra["streamInfo"];
  groups: RedisStreamGroup[];
}

export const createInitialBrowserState = (
  entries: RedisStreamEntry[],
  totalLen?: number | null,
  extra?: RedisKeyExtra | null,
): StreamBrowserState => ({
  startIdInput: "",
  endIdInput: "",
  countInput: String(DEFAULT_PAGE_SIZE),
  appliedStartId: "-",
  appliedEndId: "+",
  pageSize: DEFAULT_PAGE_SIZE,
  nextStartId:
    totalLen !== null &&
    totalLen !== undefined &&
    entries.length < totalLen &&
    entries.length > 0
      ? `(${entries[entries.length - 1].id}`
      : null,
  totalLen: totalLen ?? null,
  streamInfo: extra?.streamInfo ?? null,
  groups: extra?.streamGroups ?? [],
});

export function formatFields(fields: Record<string, string>) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return "{}";
  if (keys.length <= 3) {
    return "{ " + keys.map((key) => `${key}: ${fields[key]}`).join(", ") + " }";
  }
  return `{ ${keys[0]}: ${fields[keys[0]]}, ${keys[1]}: ${fields[keys[1]]}, ... +${keys.length - 2} }`;
}

export function parseFieldsRaw(raw: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const lines = raw.split(/\n|,/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return null;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!key) return null;
    result[key] = value;
  }
  return result;
}

export function resolvePageSize(raw: string) {
  const parsed = Number(raw.trim() || String(DEFAULT_PAGE_SIZE));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error("Count must be an integer between 1 and 1000");
  }
  return parsed;
}

export function mapViewResultToBrowserState(
  result: RedisStreamView,
  current: StreamBrowserState,
): StreamBrowserState {
  return {
    ...current,
    appliedStartId: result.startId,
    appliedEndId: result.endId,
    pageSize: result.count,
    nextStartId: result.nextStartId ?? null,
    totalLen: result.totalLen,
    streamInfo: result.streamInfo ?? null,
    groups: result.groups,
  };
}

export function formatIdleMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS (new file, not yet imported anywhere)

---

### Task 2: Create stream/hooks/useStreamBrowser.ts

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/hooks/useStreamBrowser.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type RedisKeyExtra, type RedisStreamEntry } from "@/services/api";
import { errorMessage } from "@/lib/errors";
import {
  DEFAULT_PAGE_SIZE,
  createInitialBrowserState,
  mapViewResultToBrowserState,
  parseFieldsRaw,
  resolvePageSize,
  type StreamBrowserState,
} from "../utils";

interface UseStreamBrowserOptions {
  connectionId: number;
  database: string;
  redisKey: string;
  value: RedisStreamEntry[];
  onChange: (v: RedisStreamEntry[]) => void;
  totalLen?: number | null;
  extra?: RedisKeyExtra | null;
  isCreateMode?: boolean;
}

export function useStreamBrowser({
  connectionId,
  database,
  redisKey,
  value,
  onChange,
  totalLen,
  extra,
  isCreateMode,
}: UseStreamBrowserOptions) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showNewRow, setShowNewRow] = useState(false);
  const [newId, setNewId] = useState("*");
  const [newFieldsRaw, setNewFieldsRaw] = useState("");
  const [browser, setBrowser] = useState<StreamBrowserState>(() =>
    createInitialBrowserState(value, totalLen, extra),
  );
  const [isLoadingView, setIsLoadingView] = useState(false);

  const hasMore = useMemo(() => {
    if (isCreateMode) return false;
    if (browser.nextStartId) return true;
    return browser.totalLen !== null && value.length < browser.totalLen;
  }, [browser.nextStartId, browser.totalLen, isCreateMode, value.length]);

  const refreshView = useCallback(async () => {
    try {
      const result = await api.redis.getStreamView(
        connectionId,
        database,
        redisKey,
        browser.appliedStartId,
        browser.appliedEndId,
        browser.pageSize,
      );
      onChange(result.entries);
      setBrowser((current) => mapViewResultToBrowserState(result, current));
    } catch {
      // silent — caller can show toast
    }
  }, [
    connectionId,
    database,
    redisKey,
    browser.appliedStartId,
    browser.appliedEndId,
    browser.pageSize,
    onChange,
  ]);

  const loadStreamView = async (
    mode: "replace" | "append",
    overrides?: { startId?: string; endId?: string; count?: number },
  ) => {
    if (isCreateMode) return;

    let count: number;
    try {
      count = overrides?.count ?? resolvePageSize(browser.countInput);
    } catch (e) {
      toast.error("Invalid stream range", {
        description: errorMessage(e),
      });
      return;
    }

    const startId =
      mode === "append"
        ? browser.nextStartId ||
          (value.length > 0
            ? `(${value[value.length - 1].id}`
            : browser.appliedStartId)
        : (overrides?.startId ?? browser.startIdInput.trim()) || "-";
    const endId = (overrides?.endId ?? browser.endIdInput.trim()) || "+";

    setIsLoadingView(true);
    try {
      const result = await api.redis.getStreamView(
        connectionId,
        database,
        redisKey,
        startId,
        endId,
        count,
      );
      onChange(
        mode === "append" ? [...value, ...result.entries] : result.entries,
      );
      setBrowser((current) => mapViewResultToBrowserState(result, current));
    } catch (e) {
      toast.error(
        mode === "append"
          ? "Failed to load more stream entries"
          : "Failed to load stream entries",
        { description: errorMessage(e) },
      );
    } finally {
      setIsLoadingView(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteEntry = (id: string) => {
    onChange(value.filter((entry) => entry.id !== id));
  };

  const addEntry = () => {
    const fields = parseFieldsRaw(newFieldsRaw);
    if (!fields) return;
    onChange([{ id: newId.trim() || "*", fields }, ...value]);
    setShowNewRow(false);
    setNewId("*");
    setNewFieldsRaw("");
  };

  const reset = useCallback(() => {
    setExpandedIds(new Set());
    setShowNewRow(false);
    setNewId("*");
    setNewFieldsRaw("");
    setBrowser(createInitialBrowserState(value, totalLen, extra));
  }, [value, totalLen, extra]);

  return {
    browser,
    setBrowser,
    isLoadingView,
    hasMore,
    loadStreamView,
    refreshView,
    expandedIds,
    toggleExpand,
    showNewRow,
    setShowNewRow,
    newId,
    setNewId,
    newFieldsRaw,
    setNewFieldsRaw,
    addEntry,
    deleteEntry,
    reset,
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 3: Create stream/hooks/useConsumerGroups.ts

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/hooks/useConsumerGroups.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type RedisXPendingEntry,
  type RedisXPendingSummary,
} from "@/services/api";
import { errorMessage } from "@/lib/errors";

interface UseConsumerGroupsOptions {
  connectionId: number;
  database: string;
  redisKey: string;
  refreshView: () => Promise<void>;
}

export function useConsumerGroups({
  connectionId,
  database,
  redisKey,
  refreshView,
}: UseConsumerGroupsOptions) {
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<string | null>(
    null,
  );
  const [resetGroupTarget, setResetGroupTarget] = useState<string | null>(null);
  const [expandedGroupNames, setExpandedGroupNames] = useState<Set<string>>(
    new Set(),
  );
  const [pendingData, setPendingData] = useState<
    Record<string, RedisXPendingSummary | RedisXPendingEntry[] | null>
  >({});
  const [pendingLoading, setPendingLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(
    new Set(),
  );
  const [claimTarget, setClaimTarget] = useState<{
    group: string;
    entry: RedisXPendingEntry;
  } | null>(null);
  const [showTrimDialog, setShowTrimDialog] = useState(false);

  const handleCreateGroup = async (
    groupName: string,
    startId: string,
    mkstream: boolean,
  ) => {
    try {
      await api.redis.xgroupCreate(
        connectionId,
        database,
        redisKey,
        groupName,
        startId,
        mkstream,
      );
      toast.success(`Group "${groupName}" created`);
      setShowCreateGroupDialog(false);
      await refreshView();
    } catch (e) {
      toast.error("Failed to create group", {
        description: errorMessage(e),
      });
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    try {
      await api.redis.xgroupDel(
        connectionId,
        database,
        redisKey,
        deleteGroupTarget,
      );
      toast.success(`Group "${deleteGroupTarget}" deleted`);
      setDeleteGroupTarget(null);
      setExpandedGroupNames((s) => {
        const n = new Set(s);
        n.delete(deleteGroupTarget);
        return n;
      });
      setPendingData((s) => {
        const n = { ...s };
        delete n[deleteGroupTarget];
        return n;
      });
      await refreshView();
    } catch (e) {
      toast.error("Failed to delete group", {
        description: errorMessage(e),
      });
    }
  };

  const handleResetGroup = async (startId: string) => {
    if (!resetGroupTarget) return;
    try {
      await api.redis.xgroupSetId(
        connectionId,
        database,
        redisKey,
        resetGroupTarget,
        startId,
      );
      toast.success(`Group "${resetGroupTarget}" cursor reset`);
      setResetGroupTarget(null);
      await refreshView();
    } catch (e) {
      toast.error("Failed to reset group cursor", {
        description: errorMessage(e),
      });
    }
  };

  const toggleGroupExpand = async (groupName: string) => {
    setExpandedGroupNames((current) => {
      const next = new Set(current);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });

    if (!expandedGroupNames.has(groupName) && !pendingData[groupName]) {
      setPendingLoading((s) => ({ ...s, [groupName]: true }));
      try {
        const result = await api.redis.xpending(
          connectionId,
          database,
          redisKey,
          groupName,
        );
        setPendingData((s) => ({
          ...s,
          [groupName]: result as RedisXPendingSummary,
        }));
      } catch (e) {
        toast.error("Failed to load pending info", {
          description: errorMessage(e),
        });
      } finally {
        setPendingLoading((s) => ({ ...s, [groupName]: false }));
      }
    }
  };

  const loadPendingDetails = async (groupName: string) => {
    setPendingLoading((s) => ({ ...s, [groupName]: true }));
    try {
      const result = await api.redis.xpending(
        connectionId,
        database,
        redisKey,
        groupName,
        "-",
        "+",
        100,
      );
      setPendingData((s) => ({
        ...s,
        [groupName]: result as RedisXPendingEntry[],
      }));
      setSelectedPendingIds(new Set());
    } catch (e) {
      toast.error("Failed to load pending entries", {
        description: errorMessage(e),
      });
    } finally {
      setPendingLoading((s) => ({ ...s, [groupName]: false }));
    }
  };

  const handleAck = async (groupName: string, ids: string[]) => {
    try {
      const count = await api.redis.xack(
        connectionId,
        database,
        redisKey,
        groupName,
        ids,
      );
      toast.success(`Acknowledged ${count} message(s)`);
      setSelectedPendingIds(new Set());
      await loadPendingDetails(groupName);
      await refreshView();
    } catch (e) {
      toast.error("Failed to acknowledge", {
        description: errorMessage(e),
      });
    }
  };

  const handleClaim = async (
    groupName: string,
    consumer: string,
    entryId: string,
  ) => {
    try {
      await api.redis.xclaim(
        connectionId,
        database,
        redisKey,
        groupName,
        consumer,
        0,
        [entryId],
      );
      toast.success(`Entry claimed by "${consumer}"`);
      setClaimTarget(null);
      await loadPendingDetails(groupName);
    } catch (e) {
      toast.error("Failed to claim entry", {
        description: errorMessage(e),
      });
    }
  };

  const handleTrim = async (strategy: string, threshold: string) => {
    try {
      const trimmed = await api.redis.xtrim(
        connectionId,
        database,
        redisKey,
        strategy,
        threshold,
      );
      toast.success(`Trimmed ${trimmed} entries`);
      setShowTrimDialog(false);
      await refreshView();
    } catch (e) {
      toast.error("Failed to trim stream", {
        description: errorMessage(e),
      });
    }
  };

  const onTogglePendingSelect = useCallback((id: string) => {
    setSelectedPendingIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const reset = useCallback(() => {
    setExpandedGroupNames(new Set());
    setPendingData({});
    setSelectedPendingIds(new Set());
  }, []);

  return {
    showCreateGroupDialog,
    setShowCreateGroupDialog,
    deleteGroupTarget,
    setDeleteGroupTarget,
    resetGroupTarget,
    setResetGroupTarget,
    expandedGroupNames,
    toggleGroupExpand,
    pendingData,
    pendingLoading,
    selectedPendingIds,
    handleCreateGroup,
    handleDeleteGroup,
    handleResetGroup,
    loadPendingDetails,
    handleAck,
    handleClaim,
    onTogglePendingSelect,
    claimTarget,
    setClaimTarget,
    showTrimDialog,
    setShowTrimDialog,
    handleTrim,
    reset,
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 4: Create stream/hooks/useXreadgroup.ts

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/hooks/useXreadgroup.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  api,
  type RedisStreamEntry,
  type RedisStreamGroup,
} from "@/services/api";
import { errorMessage } from "@/lib/errors";
import { resolvePageSize } from "../utils";

interface UseXreadgroupOptions {
  connectionId: number;
  database: string;
  redisKey: string;
  groups: RedisStreamGroup[];
  countInput: string;
  value: RedisStreamEntry[];
}

export function useXreadgroup({
  connectionId,
  database,
  redisKey,
  groups,
  countInput,
  value,
}: UseXreadgroupOptions) {
  const [readMode, setReadMode] = useState<"xrange" | "xreadgroup">("xrange");
  const [xrgGroup, setXrgGroup] = useState("");
  const [xrgConsumer, setXrgConsumer] = useState("");
  const [xrgStartId, setXrgStartId] = useState(">");
  const [xrgEntries, setXrgEntries] = useState<RedisStreamEntry[] | null>(null);
  const [isLoadingXrg, setIsLoadingXrg] = useState(false);

  const handleXreadgroup = async () => {
    if (!xrgGroup || !xrgConsumer) {
      toast.error("Please select a group and enter a consumer name");
      return;
    }
    setIsLoadingXrg(true);
    try {
      const count = resolvePageSize(countInput);
      const entries = await api.redis.xreadgroup(
        connectionId,
        database,
        redisKey,
        xrgGroup,
        xrgConsumer,
        xrgStartId,
        count,
      );
      setXrgEntries(entries);
    } catch (e) {
      toast.error("Failed to read from consumer group", {
        description: errorMessage(e),
      });
    } finally {
      setIsLoadingXrg(false);
    }
  };

  const displayEntries =
    readMode === "xreadgroup" && xrgEntries !== null ? xrgEntries : value;

  const reset = useCallback(() => {
    setXrgEntries(null);
    setXrgGroup("");
    setXrgConsumer("");
    setXrgStartId(">");
  }, []);

  return {
    readMode,
    setReadMode,
    xrgGroup,
    setXrgGroup,
    xrgConsumer,
    setXrgConsumer,
    xrgStartId,
    setXrgStartId,
    xrgEntries,
    isLoadingXrg,
    handleXreadgroup,
    displayEntries,
    reset,
  };
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 5: Move StreamFilterBar to its own file

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/StreamFilterBar.tsx`

- [ ] **Step 1: Create StreamFilterBar.tsx**

Copy lines 801-960 from `RedisStreamViewer.tsx`, add necessary imports at the top:

```typescript
import type { Dispatch, SetStateAction } from "react";
import { Filter, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RedisStreamGroup } from "@/services/api";
import type { StreamBrowserState } from "./utils";

// ... then the StreamFilterBar function component as-is (lines 801-960)
// Export it: export function StreamFilterBar(...)
```

The component signature and body remain identical. Only the imports change.

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 6: Move StreamSummaryCards to its own file

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/StreamSummaryCards.tsx`

- [ ] **Step 1: Create StreamSummaryCards.tsx**

Copy lines 964-1020 from `RedisStreamViewer.tsx`, add imports:

```typescript
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RedisKeyExtra, RedisStreamGroup } from "@/services/api";

// ... then the StreamSummaryCards function component as-is (lines 964-1020)
// Export it: export function StreamSummaryCards(...)
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 7: Move StreamGroupsTable + StreamPendingPanel to their own file

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/StreamGroupsTable.tsx`

- [ ] **Step 1: Create StreamGroupsTable.tsx**

Copy lines 1024-1371 from `RedisStreamViewer.tsx` (both `StreamGroupsTable` and `StreamPendingPanel`), add imports:

```typescript
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  RedisStreamGroup,
  RedisXPendingEntry,
  RedisXPendingSummary,
} from "@/services/api";
import { formatIdleMs } from "./utils";

// StreamPendingPanel (not exported, used only by StreamGroupsTable)
function StreamPendingPanel({ ... }) { ... }

// StreamGroupsTable (exported)
export function StreamGroupsTable({ ... }) { ... }
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 8: Move StreamEntriesTable + StreamEntryRow to their own file

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/StreamEntriesTable.tsx`

- [ ] **Step 1: Create StreamEntriesTable.tsx**

Copy lines 1418-1574 from `RedisStreamViewer.tsx` (both `StreamEntriesTable` and `StreamEntryRow`), add imports:

```typescript
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type { RedisStreamEntry } from "@/services/api";
import { formatFields } from "./utils";

// StreamEntryRow (memo, not exported, used only by StreamEntriesTable)
const StreamEntryRow = memo(function StreamEntryRow({ ... }) { ... });

// StreamEntriesTable (exported)
export function StreamEntriesTable({ ... }) { ... }
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 9: Move StreamAddEntryForm to its own file

**Files:**
- Create: `src/components/business/Redis/value-viewer/stream/StreamAddEntryForm.tsx`

- [ ] **Step 1: Create StreamAddEntryForm.tsx**

Copy lines 1375-1416 from `RedisStreamViewer.tsx`, add imports:

```typescript
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ... then the StreamAddEntryForm function component as-is (lines 1375-1416)
// Export it: export function StreamAddEntryForm(...)
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

---

### Task 10: Rewrite RedisStreamViewer.tsx as assembly layer

**Files:**
- Modify: `src/components/business/Redis/value-viewer/RedisStreamViewer.tsx`

- [ ] **Step 1: Replace entire file content**

```typescript
import { useEffect } from "react";
import { Info, Loader2, Plus } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { RedisKeyExtra, RedisStreamEntry } from "@/services/api";
import { useStreamBrowser } from "./stream/hooks/useStreamBrowser";
import { useConsumerGroups } from "./stream/hooks/useConsumerGroups";
import { useXreadgroup } from "./stream/hooks/useXreadgroup";
import { DEFAULT_PAGE_SIZE } from "./stream/utils";
import { StreamFilterBar } from "./stream/StreamFilterBar";
import { StreamSummaryCards } from "./stream/StreamSummaryCards";
import { StreamGroupsTable } from "./stream/StreamGroupsTable";
import { StreamEntriesTable } from "./stream/StreamEntriesTable";
import { StreamAddEntryForm } from "./stream/StreamAddEntryForm";
import {
  CreateGroupDialog,
  ResetGroupDialog,
  TrimDialog,
  ClaimDialog,
} from "./stream/StreamDialogs";

interface Props {
  connectionId: number;
  database: string;
  redisKey: string;
  value: RedisStreamEntry[];
  onChange: (v: RedisStreamEntry[]) => void;
  totalLen?: number | null;
  extra?: RedisKeyExtra | null;
  isCreateMode?: boolean;
}

export function RedisStreamViewer({
  connectionId,
  database,
  redisKey,
  value,
  onChange,
  totalLen,
  extra,
  isCreateMode,
}: Props) {
  const browser = useStreamBrowser({
    connectionId,
    database,
    redisKey,
    value,
    onChange,
    totalLen,
    extra,
    isCreateMode,
  });

  const groups = useConsumerGroups({
    connectionId,
    database,
    redisKey,
    refreshView: browser.refreshView,
  });

  const xrg = useXreadgroup({
    connectionId,
    database,
    redisKey,
    groups: browser.browser.groups,
    countInput: browser.browser.countInput,
    value,
  });

  useEffect(() => {
    browser.reset();
    groups.reset();
    xrg.reset();
  }, [connectionId, database, redisKey, totalLen, extra]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      {!isCreateMode && (
        <>
          <StreamFilterBar
            browser={browser.browser}
            isLoading={browser.isLoadingView}
            onChange={browser.setBrowser}
            onApply={() => void browser.loadStreamView("replace")}
            onReset={() => {
              browser.setBrowser((current) => ({
                ...current,
                startIdInput: "",
                endIdInput: "",
                countInput: String(DEFAULT_PAGE_SIZE),
                appliedStartId: "-",
                appliedEndId: "+",
                pageSize: DEFAULT_PAGE_SIZE,
              }));
              void browser.loadStreamView("replace", {
                startId: "-",
                endId: "+",
                count: DEFAULT_PAGE_SIZE,
              });
            }}
            readMode={xrg.readMode}
            onReadModeChange={xrg.setReadMode}
            xrgGroup={xrg.xrgGroup}
            onXrgGroupChange={xrg.setXrgGroup}
            xrgConsumer={xrg.xrgConsumer}
            onXrgConsumerChange={xrg.setXrgConsumer}
            xrgStartId={xrg.xrgStartId}
            onXrgStartIdChange={xrg.setXrgStartId}
            groups={browser.browser.groups}
            onXreadgroupApply={() => void xrg.handleXreadgroup()}
            isLoadingXrg={xrg.isLoadingXrg}
          />

          <StreamSummaryCards
            entryCount={value.length}
            totalLen={browser.browser.totalLen}
            streamInfo={browser.browser.streamInfo}
            groups={browser.browser.groups}
            appliedStartId={browser.browser.appliedStartId}
            appliedEndId={browser.browser.appliedEndId}
            onTrim={() => groups.setShowTrimDialog(true)}
          />

          <StreamGroupsTable
            groups={browser.browser.groups}
            expandedGroupNames={groups.expandedGroupNames}
            pendingData={groups.pendingData}
            pendingLoading={groups.pendingLoading}
            selectedPendingIds={groups.selectedPendingIds}
            onToggleGroup={groups.toggleGroupExpand}
            onCreateGroup={() => groups.setShowCreateGroupDialog(true)}
            onDeleteGroup={(name) => groups.setDeleteGroupTarget(name)}
            onResetGroup={(name) => groups.setResetGroupTarget(name)}
            onLoadPendingDetails={groups.loadPendingDetails}
            onAck={groups.handleAck}
            onClaim={(group, entry) =>
              groups.setClaimTarget({ group, entry })
            }
            onTogglePendingSelect={groups.onTogglePendingSelect}
          />
        </>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {xrg.readMode === "xreadgroup" && xrg.xrgEntries !== null
            ? `${xrg.xrgEntries.length} entries (consumer group mode)`
            : `${value.length} entries${browser.browser.totalLen !== null ? ` / ${browser.browser.totalLen}` : ""}`}
        </span>
        <div className="flex gap-2">
          {!isCreateMode && (
            <span className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-muted-foreground">
              <Info className="h-3 w-3" />
              Page size {browser.browser.pageSize}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => browser.setShowNewRow(true)}
            disabled={browser.showNewRow}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add entry
          </Button>
        </div>
      </div>

      {browser.showNewRow && (
        <StreamAddEntryForm
          newId={browser.newId}
          newFieldsRaw={browser.newFieldsRaw}
          onIdChange={browser.setNewId}
          onFieldsChange={browser.setNewFieldsRaw}
          onAdd={browser.addEntry}
          onCancel={() => {
            browser.setShowNewRow(false);
            browser.setNewId("*");
            browser.setNewFieldsRaw("");
          }}
        />
      )}

      <StreamEntriesTable
        entries={xrg.displayEntries}
        expandedIds={browser.expandedIds}
        onToggleExpand={browser.toggleExpand}
        onDelete={browser.deleteEntry}
        pendingAckIds={
          xrg.readMode === "xreadgroup" && xrg.xrgEntries !== null
            ? new Set(xrg.xrgEntries.map((e) => e.id))
            : undefined
        }
        onAckSingle={
          xrg.readMode === "xreadgroup" && xrg.xrgGroup
            ? (id) => void groups.handleAck(xrg.xrgGroup, [id])
            : undefined
        }
      />

      {!isCreateMode && browser.hasMore && xrg.readMode === "xrange" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Showing {value.length}
            {browser.browser.totalLen !== null ? ` of ${browser.browser.totalLen}` : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void browser.loadStreamView("append")}
            disabled={browser.isLoadingView}
          >
            {browser.isLoadingView ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Load more
          </Button>
        </div>
      )}

      {/* ── Dialogs ── */}
      {groups.showCreateGroupDialog && (
        <CreateGroupDialog
          onClose={() => groups.setShowCreateGroupDialog(false)}
          onConfirm={groups.handleCreateGroup}
        />
      )}

      <AlertDialog
        open={!!groups.deleteGroupTarget}
        onOpenChange={(o) => {
          if (!o) groups.setDeleteGroupTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete consumer group</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the group{" "}
              <span className="font-mono font-semibold">
                {groups.deleteGroupTarget}
              </span>{" "}
              and all its pending entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void groups.handleDeleteGroup()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {groups.resetGroupTarget && (
        <ResetGroupDialog
          groupName={groups.resetGroupTarget}
          onClose={() => groups.setResetGroupTarget(null)}
          onConfirm={groups.handleResetGroup}
        />
      )}

      {groups.showTrimDialog && (
        <TrimDialog
          currentLength={
            browser.browser.streamInfo?.length ?? browser.browser.totalLen ?? value.length
          }
          onClose={() => groups.setShowTrimDialog(false)}
          onConfirm={groups.handleTrim}
        />
      )}

      {groups.claimTarget && (
        <ClaimDialog
          entry={groups.claimTarget.entry}
          onClose={() => groups.setClaimTarget(null)}
          onConfirm={(consumer) =>
            void groups.handleClaim(
              groups.claimTarget!.group,
              consumer,
              groups.claimTarget!.entry.id,
            )
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: PASS

---

### Task 11: Verify end-to-end

- [ ] **Step 1: Run full typecheck**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 3: Verify file structure**

Run: `find src/components/business/Redis/value-viewer/stream -type f | sort`
Expected:
```
stream/StreamAddEntryForm.tsx
stream/StreamDialogs.tsx
stream/StreamEntriesTable.tsx
stream/StreamFilterBar.tsx
stream/StreamGroupsTable.tsx
stream/StreamSummaryCards.tsx
stream/hooks/useConsumerGroups.ts
stream/hooks/useStreamBrowser.ts
stream/hooks/useXreadgroup.ts
stream/utils.ts
```

- [ ] **Step 4: Verify main component line count**

Run: `wc -l src/components/business/Redis/value-viewer/RedisStreamViewer.tsx`
Expected: ~180 lines (imports + assembly)

- [ ] **Step 5: Commit**

```bash
git add src/components/business/Redis/value-viewer/
git commit -m "refactor: split RedisStreamViewer into hooks + file-per-component"
```
