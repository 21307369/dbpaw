# i18n Hardcoded String Cleanup (4 Files)

**Date:** 2026-06-07
**Scope:** Replace hardcoded English strings in 4 frontend files with i18n keys, and add translations to en.ts, zh.ts.

## Background

Redis ZSet and TableView already have significant i18n coverage, but several components still contain hardcoded English strings. This task focuses on 4 specific files identified by the user.

## Approach

Group new keys under existing module namespaces following established patterns (`redis.browser.*`, `redis.geo.*`, `tableView.*`, `datagrid.*`).

## Files & Key Mapping

### 1. `src/components/business/DataGrid/ComplexValueViewer.tsx`

**New keys under `datagrid.viewer`:**

| Line | Hardcoded | Key |
|------|-----------|-----|
| 256 | `"Copied"` | `datagrid.viewer.copied` |
| 256 | `"Copy JSON"` | `datagrid.viewer.copyJson` |
| 227 | `"array"` | `datagrid.viewer.typeArray` |
| 227 | `"object"` | `datagrid.viewer.typeObject` |

**Not translated:** `"JSON"` / `"Tree"` / `"Table"` (technical tab labels), `"#"` (table header symbol).

**Changes required:**
- Add `useTranslation()` hook
- Replace hardcoded strings with `t()` calls

### 2. `src/components/business/DataGrid/tableView/TableContextMenuContent.tsx`

**New keys under `tableView.contextMenu`:**

| Line | Hardcoded | Key |
|------|-----------|-----|
| 234 | `"Copy Selection"` | `tableView.contextMenu.copySelection` |
| 234 | `"Copy Cell"` | `tableView.contextMenu.copyCell` |
| 241 | `"Copy Selection as"` | `tableView.contextMenu.copySelectionAs` |
| 248 | `"Selection copied as CSV"` | `tableView.contextMenu.selectionCopiedAsCsv` |
| 259 | `"Selection copied as Insert SQL"` | `tableView.contextMenu.selectionCopiedAsInsertSql` |
| 271 | `"Selection copied as Update SQL"` | `tableView.contextMenu.selectionCopiedAsUpdateSql` |
| 287 | `` `Copied ${n} row(s)` `` | `tableView.contextMenu.copiedRows` (uses `{{count}}`) |
| 303 | `"Row copied"` | `tableView.contextMenu.rowCopied` |
| 308 | `"Copy Selected Rows"` | `tableView.contextMenu.copySelectedRows` |
| 309 | `"Copy Row"` | `tableView.contextMenu.copyRow` |
| 334 | `"Undo This Cell"` | `tableView.contextMenu.undoThisCell` |
| 342 | `"Copy as"` | `tableView.contextMenu.copyAs` |
| 349 | `"Copied as CSV"` | `tableView.contextMenu.copiedAsCsv` |
| 351 | `"Row copied as CSV"` | `tableView.contextMenu.rowCopiedAsCsv` |
| 355 | `"Copy Selected as CSV"` | `tableView.contextMenu.copySelectedAsCsv` |
| 357 | `"Copy as CSV"` | `tableView.contextMenu.copyAsCsv` |
| 366 | `"Copied as Insert SQL"` | `tableView.contextMenu.copiedAsInsertSql` |
| 368 | `"Row copied as Insert SQL"` | `tableView.contextMenu.rowCopiedAsInsertSql` |
| 372 | `"Copy Selected as Insert SQL"` | `tableView.contextMenu.copySelectedAsInsertSql` |
| 374 | `"Copy as Insert SQL"` | `tableView.contextMenu.copyAsInsertSql` |
| 384 | `"Copied as Update SQL"` | `tableView.contextMenu.copiedAsUpdateSql` |
| 386 | `"Row copied as Update SQL"` | `tableView.contextMenu.rowCopiedAsUpdateSql` |
| 390 | `"Copy Selected as Update SQL"` | `tableView.contextMenu.copySelectedAsUpdateSql` |
| 392 | `"Copy as Update SQL"` | `tableView.contextMenu.copyAsUpdateSql` |

**Note:** `handleCopy()` is called with a second string argument that becomes a toast message. These toast messages must also be i18n'd.

### 3. `src/components/business/Redis/RedisBrowserView.tsx`

**New keys under `redis.browser`:**

| Line | Hardcoded | Key |
|------|-----------|-----|
| 642 | `"MGET Export"` | `redis.browser.mgetExport` |
| 644 | `` `Values of ${n} selected key(s)` `` | `redis.browser.mgetDescription` (uses `{{count}}`) |
| 660 | `"Copied to clipboard"` | `redis.browser.copiedToClipboard` |
| 667 | `"Copy"` | `redis.browser.copy` |
| 683 | `"Exported successfully"` | `redis.browser.exportedSuccessfully` |
| 691 | `"Save to File"` | `redis.browser.saveToFile` |
| 702 | `"MSET Import"` | `redis.browser.msetImport` |
| 704 | `"Import key-value pairs (JSON object or lines of key:value)"` | `redis.browser.msetDescription` |
| 718 | `"Import File"` | `redis.browser.importFile` |
| 740 | `"Cancel"` | Use existing `common.cancel` |
| 750 | `"Import"` | `redis.browser.import` |

**Changes required:**
- File already imports `useTranslation`; add `t()` calls to the listed strings

### 4. `src/components/business/Redis/value-viewer/RedisGeoViewer.tsx`

**New keys under `redis.geo`:**

| Line | Hardcoded | Key |
|------|-----------|-----|
| 116 | `"No coordinates found for this member"` | `redis.geo.noCoordinates` |
| 136 | `"Member name is required"` | `redis.geo.memberNameRequired` |
| 140 | `"Longitude must be between -180 and 180"` | `redis.geo.longitudeRange` |
| 143 | `"Latitude must be between -85.05 and 85.05"` | `redis.geo.latitudeRange` |
| 154 | `` `Location "${m}" added` `` | `redis.geo.locationAdded` (uses `{{member}}`) |
| 181 | `"Distance calculated"` | `redis.geo.distanceCalculated` |
| 210 | `` `Found ${n} location(s) nearby` `` | `redis.geo.nearbyFound` (uses `{{count}}`) |
| 239 | `"Geo"` | `redis.geo.title` |
| 242 | `` `${n} locations` `` | `redis.geo.locationCount` (uses `{{count}}`) |
| 252 | `"Distance"` | `redis.geo.distance` |
| 261 | `"Nearby"` | `redis.geo.nearby` |
| 270 | `"Score"` | `redis.geo.score` |
| 279 | `"Add"` | `redis.geo.add` |
| 288 | `"GEODIST — Calculate distance between two members"` | `redis.geo.distDescription` |
| 296 | `"Member 1"` | `redis.geo.member1` |
| 309 | `"Member 2"` | `redis.geo.member2` |
| 334 | `"Calculate"` | `redis.geo.calculate` |
| 352 | `"GEOSEARCH — Find locations near a member"` | `redis.geo.searchDescription` |
| 360 | `"Center member"` | `redis.geo.centerMember` |
| 369 | `"Radius"` | `redis.geo.radius` |
| 392 | `"Search"` | `redis.geo.search` |
| 398 | `` `${n} result(s) found` `` | `redis.geo.searchResultsFound` (uses `{{count}}`) |
| 431 | `"GEOADD — Add a new location"` | `redis.geo.addDescription` |
| 436 | `"Member name"` | `redis.geo.memberNamePlaceholder` |
| 442 | `"Longitude"` | `redis.geo.longitude` |
| 448 | `"Latitude"` | `redis.geo.latitude` |
| 460 | `"Adding..."` | `redis.geo.adding` |
| 471 | `"Cancel"` | Use existing `common.cancel` |
| 484 | `"Member"` (table header) | `redis.geo.colMember` |
| 485 | `"Geohash"` (table header) | `redis.geo.colGeohash` |
| 487 | `"Longitude"` (table header) | `redis.geo.longitude` (reuse) |
| 489 | `"Latitude"` (table header) | `redis.geo.latitude` (reuse) |
| 502 | `"No locations"` | `redis.geo.emptyLocations` |
| 529/542 | `"lookup"` | `redis.geo.lookup` |
| 566-567 | Footer hint text | `redis.geo.footerHint` |

**Changes required:**
- File already imports `useTranslation`; add `t()` calls to the listed strings

## Locale File Changes

All new keys must be added to all 3 files:

1. `src/lib/i18n/locales/en.ts` — English values (from the hardcoded strings)
2. `src/lib/i18n/locales/zh.ts` — Chinese translations

### Section additions

**`datagrid.viewer`** (new top-level section, sibling to `settings.dataGrid`):

```ts
// en.ts
datagrid: {
  viewer: {
    copied: "Copied",
    copyJson: "Copy JSON",
    typeArray: "array",
    typeObject: "object",
  },
},
```

**`tableView.contextMenu`** (add to existing `tableView`):

```ts
// en.ts
tableView: {
  // ... existing keys ...
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
},
```

**`redis.browser`** (add to existing `redis.browser`):

```ts
// en.ts — add these keys to existing redis.browser
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

**`redis.geo`** (add to existing `redis.geo`):

```ts
// en.ts — add these keys to existing redis.geo
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

## Validation

- `pnpm run typecheck` must pass (TypeScript types from en.ts propagate to zh.ts)
- `pnpm run lint` must pass
- Manual spot-check: open ComplexValueViewer dialog, Redis Geo view, right-click context menu in DataGrid — verify strings render correctly in English

## Out of Scope

- Scanning other files for hardcoded strings (only the 4 specified files)
- Technical labels like "JSON", "Tree", "Table", "#" (kept as-is)
