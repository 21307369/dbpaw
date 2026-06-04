# RedisStreamViewer Refactoring Design

## Problem

`RedisStreamViewer.tsx` is 1576 lines with a 617-line main component mixing 5 independent concerns: XRANGE browsing, Consumer Group CRUD + Pending management, XREADGROUP, XTRIM, and entry add/delete. Sub-components are already extracted inline but all business logic lives in one monolithic component.

## Goal

Split into feature-domain hooks + file-per-component structure. Main component becomes ~80 lines of pure assembly.

## Target Structure

```
src/components/business/Redis/value-viewer/
├── RedisStreamViewer.tsx          — main component (~80 lines, pure assembly)
└── stream/
    ├── hooks/
    │   ├── useStreamBrowser.ts    — XRANGE browsing + pagination + entry CRUD
    │   ├── useConsumerGroups.ts   — Group CRUD + expand + pending + ack/claim + trim
    │   └── useXreadgroup.ts       — XREADGROUP mode state + read logic
    ├── utils.ts                   — Pure utility functions (no React)
    ├── StreamFilterBar.tsx
    ├── StreamSummaryCards.tsx
    ├── StreamGroupsTable.tsx      — Includes StreamPendingPanel (tightly coupled)
    ├── StreamEntriesTable.tsx     — Includes StreamEntryRow
    ├── StreamAddEntryForm.tsx
    └── StreamDialogs.tsx          — Unchanged
```

## Hooks

### useStreamBrowser

Manages XRANGE browsing state, pagination, and entry CRUD.

**Input:** `connectionId`, `database`, `redisKey`, `value`, `onChange`, `totalLen`, `extra`, `isCreateMode`

**Output:**
- `browser` (StreamBrowserState) + `setBrowser`
- `isLoadingView`
- `hasMore` (computed)
- `loadStreamView(mode: "replace" | "append", overrides?)`
- `refreshView()`
- `expandedIds`, `toggleExpand(id)`
- `showNewRow`, `setShowNewRow`, `newId`, `setNewId`, `newFieldsRaw`, `setNewFieldsRaw`
- `addEntry()`, `deleteEntry(id)`
- `reset()` — clears expandedIds, showNewRow, newId, newFieldsRaw, reinitializes browser state

**Extracted from:** Lines 190-348 (state declarations), lines 245-334 (logic), lines 580-581 (displayEntries computation excluded — handled by useXreadgroup).

### useConsumerGroups

Manages consumer group CRUD, expand/collapse, pending data, ack/claim, and trim.

**Input:** `connectionId`, `database`, `redisKey`, `refreshView`

**Output:**
- `showCreateGroupDialog`, `setShowCreateGroupDialog`
- `deleteGroupTarget`, `setDeleteGroupTarget`
- `resetGroupTarget`, `setResetGroupTarget`
- `expandedGroupNames`, `toggleGroupExpand(groupName)`
- `pendingData`, `pendingLoading`, `selectedPendingIds`
- `handleCreateGroup(groupName, startId, mkstream)`
- `handleDeleteGroup()`
- `handleResetGroup(startId)`
- `loadPendingDetails(groupName)`
- `handleAck(groupName, ids)`
- `handleClaim(groupName, consumer, entryId)`
- `onTogglePendingSelect(id)`
- `claimTarget`, `setClaimTarget`
- `showTrimDialog`, `setShowTrimDialog`, `handleTrim(strategy, threshold)`
- `reset()` — clears expandedGroupNames, pendingData, selectedPendingIds

**Extracted from:** Lines 199-223 (state), lines 349-549 (handlers).

### useXreadgroup

Manages XREADGROUP mode state and read logic.

**Input:** `connectionId`, `database`, `redisKey`, `groups`, `resolvePageSize`, `countInput`, `value`

**Output:**
- `readMode`, `setReadMode`
- `xrgGroup`, `setXrgGroup`, `xrgConsumer`, `setXrgConsumer`, `xrgStartId`, `setXrgStartId`
- `xrgEntries`, `isLoadingXrg`
- `handleXreadgroup()`
- `displayEntries` — returns `xrgEntries ?? value`
- `reset()` — clears xrgEntries, xrgGroup, xrgConsumer, xrgStartId

**Extracted from:** Lines 226-231 (state), lines 551-581 (logic + displayEntries).

## Utils (stream/utils.ts)

Pure functions, no React dependency:

- `DEFAULT_PAGE_SIZE = 200`
- `formatFields(fields: Record<string, string>): string` — L122-129
- `parseFieldsRaw(raw: string): Record<string, string> | null` — L131-145
- `resolvePageSize(raw: string): number` — L147-153
- `mapViewResultToBrowserState(result, current): StreamBrowserState` — L155-169
- `formatIdleMs(ms: number): string` — L171-176
- `StreamBrowserState` interface — L86-97

## Sub-Components

Each moved to its own file under `stream/`, with props interface exported.

| Component | File | Lines | Notes |
|---|---|---|---|
| StreamFilterBar | stream/StreamFilterBar.tsx | L801-960 | Direct move, props unchanged |
| StreamSummaryCards | stream/StreamSummaryCards.tsx | L964-1020 | Direct move |
| StreamGroupsTable + StreamPendingPanel | stream/StreamGroupsTable.tsx | L1024-1371 | PendingPanel only used inside GroupsTable |
| StreamEntriesTable + StreamEntryRow | stream/StreamEntriesTable.tsx | L1418-1574 | StreamEntryRow only used inside EntriesTable |
| StreamAddEntryForm | stream/StreamAddEntryForm.tsx | L1375-1416 | Direct move |
| StreamDialogs | stream/StreamDialogs.tsx | existing | Unchanged |

## Main Component (RedisStreamViewer.tsx)

After refactoring, ~80 lines:

1. Call 3 hooks
2. useEffect for key change reset (calls each hook's `reset()`)
3. Render sub-components, passing hook outputs as props
4. Render AlertDialogs (delete group confirmation stays in main component since it's a simple confirm dialog)

## Data Flow

```
RedisStreamViewer
  ├── useStreamBrowser(value, onChange, totalLen, extra, isCreateMode)
  │     └── refreshView() ──┐
  ├── useConsumerGroups(connectionId, database, redisKey, refreshView)
  │     └── calls refreshView after mutations
  └── useXreadgroup(connectionId, database, redisKey, browser.groups, resolvePageSize, browser.countInput, value)
```

`useStreamBrowser.refreshView` is shared — `useConsumerGroups` calls it after group mutations (create/delete/reset/ack/trim).

## File Size Estimate

| File | Lines |
|---|---|
| RedisStreamViewer.tsx | ~80 |
| hooks/useStreamBrowser.ts | ~120 |
| hooks/useConsumerGroups.ts | ~180 |
| hooks/useXreadgroup.ts | ~70 |
| stream/utils.ts | ~60 |
| stream/StreamFilterBar.tsx | ~160 |
| stream/StreamSummaryCards.tsx | ~60 |
| stream/StreamGroupsTable.tsx | ~350 |
| stream/StreamEntriesTable.tsx | ~160 |
| stream/StreamAddEntryForm.tsx | ~45 |
| stream/StreamDialogs.tsx | 278 (unchanged) |

Total: ~1563 lines (same content, better organized).

## Constraints

- No behavior changes — pure structural refactoring
- All existing imports in other files that reference `RedisStreamViewer` remain unchanged (only the default export path matters)
- Sub-components are internal to the stream/ directory, not exported from the barrel
- Hooks use `useCallback` where the current code does, preserve memo patterns
