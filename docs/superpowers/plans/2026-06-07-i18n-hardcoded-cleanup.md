# i18n Hardcoded Cleanup — 4 Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded English strings in 4 frontend components with i18n keys, adding translations to en.ts, zh.ts.

**Architecture:** Add new keys under existing module namespaces (`datagrid.viewer.*`, `tableView.contextMenu.*`, `redis.browser.*`, `redis.geo.*`). Locale files are TypeScript; `en.ts` is the source of truth, `zh.ts` imports its `Translations` type for type-safety.

**Tech Stack:** TypeScript, react-i18next, i18next

---

### Task 1: Add `datagrid.viewer` keys to en.ts

**Files:**
- Modify: `src/lib/i18n/locales/en.ts`

Add a new top-level `datagrid` section (sibling to `settings`, `redis`, etc.) with a `viewer` sub-section.

- [ ] **Step 1: Add `datagrid` section to en.ts**

Insert after the `settings` section (before `sidebar`). The exact insertion point is after the closing `},` of the `settings` block:

```ts
  datagrid: {
    viewer: {
      copied: "Copied",
      copyJson: "Copy JSON",
      typeArray: "array",
      typeObject: "object",
    },
  },
```

---

### Task 2: Add `tableView.contextMenu` keys to en.ts

**Files:**
- Modify: `src/lib/i18n/locales/en.ts`

Add a `contextMenu` sub-section inside the existing `tableView` block.

- [ ] **Step 1: Add `contextMenu` to `tableView` in en.ts**

Inside `tableView: { ... }`, add `contextMenu` after `deleteRows`:

```ts
    contextMenu: {
      copySelection: "Copy Selection",
      copyCell: "Copy Cell",
      copySelectionAs: "Copy Selection as",
      selectionCopiedAsCsv: "Selection copied as CSV",
      selectionCopiedAsInsertSql: "Selection copied as Insert SQL",
      selectionCopiedAsUpdateSql: "Selection copied as Update SQL",
      copiedRows: "Copied {{count}} row(s)",
      rowCopied: "Row copied",
      copySelectedRows: "Copy Selected Rows",
      copyRow: "Copy Row",
      undoThisCell: "Undo This Cell",
      copyAs: "Copy as",
      copiedAsCsv: "Copied as CSV",
      rowCopiedAsCsv: "Row copied as CSV",
      copySelectedAsCsv: "Copy Selected as CSV",
      copyAsCsv: "Copy as CSV",
      copiedAsInsertSql: "Copied as Insert SQL",
      rowCopiedAsInsertSql: "Row copied as Insert SQL",
      copySelectedAsInsertSql: "Copy Selected as Insert SQL",
      copyAsInsertSql: "Copy as Insert SQL",
      copiedAsUpdateSql: "Copied as Update SQL",
      rowCopiedAsUpdateSql: "Row copied as Update SQL",
      copySelectedAsUpdateSql: "Copy Selected as Update SQL",
      copyAsUpdateSql: "Copy as Update SQL",
    },
```

---

### Task 3: Add `redis.browser` and `redis.geo` keys to en.ts

**Files:**
- Modify: `src/lib/i18n/locales/en.ts`

Add new keys to the existing `redis.browser` and `redis.geo` sections.

- [ ] **Step 1: Add keys to `redis.browser` in en.ts**

Add these keys inside the existing `redis.browser` block (after `exportFailed`):

```ts
      mgetExport: "MGET Export",
      mgetDescription: "Values of {{count}} selected key(s)",
      copiedToClipboard: "Copied to clipboard",
      copy: "Copy",
      exportedSuccessfully: "Exported successfully",
      saveToFile: "Save to File",
      msetImport: "MSET Import",
      msetDescription: "Import key-value pairs (JSON object or lines of key:value)",
      importFile: "Import File",
      import: "Import",
```

- [ ] **Step 2: Add keys to `redis.geo` in en.ts**

Add these keys inside the existing `redis.geo` block (after `nearbyFailed`):

```ts
      title: "Geo",
      noCoordinates: "No coordinates found for this member",
      memberNameRequired: "Member name is required",
      longitudeRange: "Longitude must be between -180 and 180",
      latitudeRange: "Latitude must be between -85.05 and 85.05",
      locationAdded: "Location \"{{member}}\" added",
      distanceCalculated: "Distance calculated",
      nearbyFound: "Found {{count}} location(s) nearby",
      locationCount: "{{count}} locations",
      distance: "Distance",
      nearby: "Nearby",
      score: "Score",
      add: "Add",
      distDescription: "GEODIST — Calculate distance between two members",
      member1: "Member 1",
      member2: "Member 2",
      calculate: "Calculate",
      searchDescription: "GEOSEARCH — Find locations near a member",
      centerMember: "Center member",
      radius: "Radius",
      search: "Search",
      searchResultsFound: "{{count}} result(s) found",
      addDescription: "GEOADD — Add a new location",
      memberNamePlaceholder: "Member name",
      longitude: "Longitude",
      latitude: "Latitude",
      adding: "Adding...",
      colMember: "Member",
      colGeohash: "Geohash",
      emptyLocations: "No locations",
      lookup: "lookup",
      footerHint: "Scores are geohash values. Click \"lookup\" to fetch real coordinates via GEOPOS. Use \"Distance\" and \"Nearby\" tools for spatial queries.",
```

---

### Task 4: Add all new keys to zh.ts

**Files:**
- Modify: `src/lib/i18n/locales/zh.ts`

- [ ] **Step 1: Add `datagrid` section to zh.ts**

Insert after `settings` section:

```ts
  datagrid: {
    viewer: {
      copied: "已复制",
      copyJson: "复制 JSON",
      typeArray: "数组",
      typeObject: "对象",
    },
  },
```

- [ ] **Step 2: Add `contextMenu` to `tableView` in zh.ts**

Inside `tableView: { ... }`, add after `deleteRows`:

```ts
    contextMenu: {
      copySelection: "复制选区",
      copyCell: "复制单元格",
      copySelectionAs: "复制选区为",
      selectionCopiedAsCsv: "选区已复制为 CSV",
      selectionCopiedAsInsertSql: "选区已复制为 Insert SQL",
      selectionCopiedAsUpdateSql: "选区已复制为 Update SQL",
      copiedRows: "已复制 {{count}} 行",
      rowCopied: "行已复制",
      copySelectedRows: "复制选中行",
      copyRow: "复制行",
      undoThisCell: "撤销此单元格",
      copyAs: "复制为",
      copiedAsCsv: "已复制为 CSV",
      rowCopiedAsCsv: "行已复制为 CSV",
      copySelectedAsCsv: "复制选中行为 CSV",
      copyAsCsv: "复制为 CSV",
      copiedAsInsertSql: "已复制为 Insert SQL",
      rowCopiedAsInsertSql: "行已复制为 Insert SQL",
      copySelectedAsInsertSql: "复制选中行为 Insert SQL",
      copyAsInsertSql: "复制为 Insert SQL",
      copiedAsUpdateSql: "已复制为 Update SQL",
      rowCopiedAsUpdateSql: "行已复制为 Update SQL",
      copySelectedAsUpdateSql: "复制选中行为 Update SQL",
      copyAsUpdateSql: "复制为 Update SQL",
    },
```

- [ ] **Step 3: Add keys to `redis.browser` in zh.ts**

Add after `exportFailed`:

```ts
      mgetExport: "MGET 导出",
      mgetDescription: "已选 {{count}} 个键的值",
      copiedToClipboard: "已复制到剪贴板",
      copy: "复制",
      exportedSuccessfully: "导出成功",
      saveToFile: "保存到文件",
      msetImport: "MSET 导入",
      msetDescription: "导入键值对（JSON 对象或每行一个 key:value）",
      importFile: "导入文件",
      import: "导入",
```

- [ ] **Step 4: Add keys to `redis.geo` in zh.ts**

Add after `nearbyFailed`:

```ts
      title: "Geo",
      noCoordinates: "未找到该成员的坐标",
      memberNameRequired: "成员名称不能为空",
      longitudeRange: "经度必须在 -180 到 180 之间",
      latitudeRange: "纬度必须在 -85.05 到 85.05 之间",
      locationAdded: "位置 \"{{member}}\" 已添加",
      distanceCalculated: "距离已计算",
      nearbyFound: "找到 {{count}} 个附近位置",
      locationCount: "{{count}} 个位置",
      distance: "距离",
      nearby: "附近",
      score: "分数",
      add: "添加",
      distDescription: "GEODIST — 计算两个成员之间的距离",
      member1: "成员 1",
      member2: "成员 2",
      calculate: "计算",
      searchDescription: "GEOSEARCH — 查找成员附近的位置",
      centerMember: "中心成员",
      radius: "半径",
      search: "搜索",
      searchResultsFound: "找到 {{count}} 条结果",
      addDescription: "GEOADD — 添加新位置",
      memberNamePlaceholder: "成员名称",
      longitude: "经度",
      latitude: "纬度",
      adding: "添加中...",
      colMember: "成员",
      colGeohash: "Geohash",
      emptyLocations: "暂无位置",
      lookup: "查询",
      footerHint: "分数为 geohash 值。点击"查询"通过 GEOPOS 获取真实坐标。使用"距离"和"附近"工具进行空间查询。",
```

---

### Task 5: Update ComplexValueViewer.tsx

**Files:**
- Modify: `src/components/business/DataGrid/ComplexValueViewer.tsx`

- [ ] **Step 1: Add `useTranslation` import and hook**

Add import at top:
```ts
import { useTranslation } from "react-i18next";
```

Add hook inside component:
```ts
const { t } = useTranslation();
```

- [ ] **Step 2: Replace hardcoded strings**

Replace line 227:
```ts
// Before
const typeLabel = Array.isArray(value) ? "array" : "object";
// After
const typeLabel = Array.isArray(value) ? t("datagrid.viewer.typeArray") : t("datagrid.viewer.typeObject");
```

Replace line 256:
```ts
// Before
{copied ? "Copied" : "Copy JSON"}
// After
{copied ? t("datagrid.viewer.copied") : t("datagrid.viewer.copyJson")}
```

---

### Task 6: Update TableContextMenuContent.tsx

**Files:**
- Modify: `src/components/business/DataGrid/tableView/TableContextMenuContent.tsx`

- [ ] **Step 1: Replace all hardcoded strings with `t()` calls**

The file already has `const { t } = useTranslation();` at line 96. Replace each hardcoded string:

Line 234:
```ts
// Before
? "Copy Selection"
: "Copy Cell"
// After
? t("tableView.contextMenu.copySelection")
: t("tableView.contextMenu.copyCell")
```

Line 241:
```ts
// Before
Copy Selection as
// After
{t("tableView.contextMenu.copySelectionAs")}
```

Line 248:
```ts
// Before
"Selection copied as CSV",
// After
t("tableView.contextMenu.selectionCopiedAsCsv"),
```

Line 259:
```ts
// Before
"Selection copied as Insert SQL",
// After
t("tableView.contextMenu.selectionCopiedAsInsertSql"),
```

Line 271:
```ts
// Before
"Selection copied as Update SQL",
// After
t("tableView.contextMenu.selectionCopiedAsUpdateSql"),
```

Line 287:
```ts
// Before
`Copied ${copyTargetRows.length} row(s)`,
// After
t("tableView.contextMenu.copiedRows", { count: copyTargetRows.length }),
```

Line 303:
```ts
// Before
handleCopy(values, "Row copied");
// After
handleCopy(values, t("tableView.contextMenu.rowCopied"));
```

Line 308-309:
```ts
// Before
? "Copy Selected Rows"
: "Copy Row"
// After
? t("tableView.contextMenu.copySelectedRows")
: t("tableView.contextMenu.copyRow")
```

Line 334:
```ts
// Before
Undo This Cell
// After
{t("tableView.contextMenu.undoThisCell")}
```

Line 342:
```ts
// Before
Copy as
// After
{t("tableView.contextMenu.copyAs")}
```

Lines 349-392 (all copy-as variants): replace each string with corresponding `t()` call, e.g.:
```ts
t("tableView.contextMenu.copiedAsCsv")
t("tableView.contextMenu.rowCopiedAsCsv")
t("tableView.contextMenu.copySelectedAsCsv")
t("tableView.contextMenu.copyAsCsv")
// ... and same pattern for Insert SQL and Update SQL
```

---

### Task 7: Update RedisBrowserView.tsx

**Files:**
- Modify: `src/components/business/Redis/RedisBrowserView.tsx`

- [ ] **Step 1: Replace hardcoded strings with `t()` calls**

The file already has `useTranslation`. Replace each hardcoded string:

Line 642:
```ts
// Before
<MDialogTitle>MGET Export</MDialogTitle>
// After
<MDialogTitle>{t("redis.browser.mgetExport")}</MDialogTitle>
```

Line 644:
```ts
// Before
Values of {selectedKeys.size} selected key(s)
// After
{t("redis.browser.mgetDescription", { count: selectedKeys.size })}
```

Line 660:
```ts
// Before
toast.success("Copied to clipboard");
// After
toast.success(t("redis.browser.copiedToClipboard"));
```

Line 667:
```ts
// Before
Copy
// After
{t("redis.browser.copy")}
```

Line 683:
```ts
// Before
toast.success("Exported successfully");
// After
toast.success(t("redis.browser.exportedSuccessfully"));
```

Line 691:
```ts
// Before
Save to File
// After
{t("redis.browser.saveToFile")}
```

Line 702:
```ts
// Before
<MDialogTitle>MSET Import</MDialogTitle>
// After
<MDialogTitle>{t("redis.browser.msetImport")}</MDialogTitle>
```

Line 704:
```ts
// Before
Import key-value pairs (JSON object or lines of key:value)
// After
{t("redis.browser.msetDescription")}
```

Line 718:
```ts
// Before
Import File
// After
{t("redis.browser.importFile")}
```

Line 740:
```ts
// Before
Cancel
// After
{t("common.cancel")}
```

Line 750:
```ts
// Before
Import
// After
{t("redis.browser.import")}
```

---

### Task 8: Update RedisGeoViewer.tsx

**Files:**
- Modify: `src/components/business/Redis/value-viewer/RedisGeoViewer.tsx`

- [ ] **Step 1: Replace all hardcoded strings with `t()` calls**

The file already has `const { t } = useTranslation();` at line 56. Replace each hardcoded string:

Line 116:
```ts
// Before
toast.warning("No coordinates found for this member");
// After
toast.warning(t("redis.geo.noCoordinates"));
```

Line 136:
```ts
// Before
setAddError("Member name is required");
// After
setAddError(t("redis.geo.memberNameRequired"));
```

Line 140:
```ts
// Before
setAddError("Longitude must be between -180 and 180");
// After
setAddError(t("redis.geo.longitudeRange"));
```

Line 143:
```ts
// Before
setAddError("Latitude must be between -85.05 and 85.05");
// After
setAddError(t("redis.geo.latitudeRange"));
```

Line 154:
```ts
// Before
toast.success(`Location "${m}" added`);
// After
toast.success(t("redis.geo.locationAdded", { member: m }));
```

Line 181:
```ts
// Before
toast.success("Distance calculated");
// After
toast.success(t("redis.geo.distanceCalculated"));
```

Line 210:
```ts
// Before
toast.success(`Found ${results.length} location(s) nearby`);
// After
toast.success(t("redis.geo.nearbyFound", { count: results.length }));
```

Line 239:
```ts
// Before
<span className="text-sm font-medium">Geo</span>
// After
<span className="text-sm font-medium">{t("redis.geo.title")}</span>
```

Line 242:
```ts
// Before
{geoCount.toLocaleString()} locations
// After
{t("redis.geo.locationCount", { count: geoCount })}
```

Line 252:
```ts
// Before
Distance
// After
{t("redis.geo.distance")}
```

Line 261:
```ts
// Before
Nearby
// After
{t("redis.geo.nearby")}
```

Line 270:
```ts
// Before
Score {sortAsc ? "↑" : "↓"}
// After
{t("redis.geo.score")} {sortAsc ? "↑" : "↓"}
```

Line 279:
```ts
// Before
Add
// After
{t("redis.geo.add")}
```

Line 288:
```ts
// Before
GEODIST — Calculate distance between two members
// After
{t("redis.geo.distDescription")}
```

Line 296:
```ts
// Before
<option value="">Member 1</option>
// After
<option value="">{t("redis.geo.member1")}</option>
```

Line 309:
```ts
// Before
<option value="">Member 2</option>
// After
<option value="">{t("redis.geo.member2")}</option>
```

Line 334:
```ts
// Before
{distLoading ? "..." : "Calculate"}
// After
{distLoading ? "..." : t("redis.geo.calculate")}
```

Line 352:
```ts
// Before
GEOSEARCH — Find locations near a member
// After
{t("redis.geo.searchDescription")}
```

Line 360:
```ts
// Before
<option value="">Center member</option>
// After
<option value="">{t("redis.geo.centerMember")}</option>
```

Line 369:
```ts
// Before
placeholder="Radius"
// After
placeholder={t("redis.geo.radius")}
```

Line 392:
```ts
// Before
{searchLoading ? "..." : "Search"}
// After
{searchLoading ? "..." : t("redis.geo.search")}
```

Line 398:
```ts
// Before
{searchResults.length} result(s) found
// After
{t("redis.geo.searchResultsFound", { count: searchResults.length })}
```

Line 431:
```ts
// Before
GEOADD — Add a new location
// After
{t("redis.geo.addDescription")}
```

Line 436:
```ts
// Before
placeholder="Member name"
// After
placeholder={t("redis.geo.memberNamePlaceholder")}
```

Line 442:
```ts
// Before
placeholder="Longitude"
// After
placeholder={t("redis.geo.longitude")}
```

Line 448:
```ts
// Before
placeholder="Latitude"
// After
placeholder={t("redis.geo.latitude")}
```

Line 460:
```ts
// Before
{adding ? "Adding..." : "Add"}
// After
{adding ? t("redis.geo.adding") : t("redis.geo.add")}
```

Line 471:
```ts
// Before
Cancel
// After
{t("common.cancel")}
```

Line 484:
```ts
// Before
Member
// After
{t("redis.geo.colMember")}
```

Line 485:
```ts
// Before
Geohash
// After
{t("redis.geo.colGeohash")}
```

Line 487:
```ts
// Before
Longitude
// After
{t("redis.geo.longitude")}
```

Line 489:
```ts
// Before
Latitude
// After
{t("redis.geo.latitude")}
```

Line 502:
```ts
// Before
No locations
// After
{t("redis.geo.emptyLocations")}
```

Line 529:
```ts
// Before
{isLoadingPos ? "..." : "lookup"}
// After
{isLoadingPos ? "..." : t("redis.geo.lookup")}
```

Line 542:
```ts
// Before
{isLoadingPos ? "..." : "lookup"}
// After
{isLoadingPos ? "..." : t("redis.geo.lookup")}
```

Lines 566-567:
```ts
// Before
Scores are geohash values. Click "lookup" to fetch real coordinates via
GEOPOS. Use "Distance" and "Nearby" tools for spatial queries.
// After
{t("redis.geo.footerHint")}
```

---

### Task 9: Verify — typecheck and lint

- [ ] **Step 1: Run typecheck**

```bash
pnpm run typecheck
```

Expected: PASS (no type errors from missing keys or wrong translations)

- [ ] **Step 2: Run lint**

```bash
pnpm run lint
```

Expected: PASS (no lint errors)
