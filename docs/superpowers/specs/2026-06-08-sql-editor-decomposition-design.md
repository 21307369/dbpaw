# SqlEditor Component Decomposition

**Date:** 2026-06-08
**Target:** `src/components/business/Editor/SqlEditor.tsx` (994 lines)
**Goal:** Decompose into hooks + render components following the Redis browser pattern.

## Current State

SqlEditor.tsx is a 994-line monolith containing:
- SQL syntax theme data (~130 lines of pure data)
- Controlled/uncontrolled value pattern with debounced onChange
- Save/export/format API calls inline
- CodeMirror extensions, dialect, schema, and completion assembly
- Result state computation (status, currentResultSet, display data)
- Toolbar JSX (database selector, action buttons, status, export dropdown)
- Results panel JSX (error display, result set tabs, TableView)

## File Structure After Decomposition

```
Editor/
  SqlEditor.tsx              # Container (~200 lines) — orchestrates hooks, composes render
  SqlToolbar.tsx             # Pure render — database selector, action buttons, status, export
  SqlResultsPanel.tsx        # Pure render — error display, result set tabs, TableView
  sqlThemes.ts               # Pure data — createSqlSyntaxTheme + SQL_SYNTAX_THEME_MAP
  hooks/
    useSqlEditorForm.ts      # Controlled/uncontrolled value, debounced onChange
    useSqlEditorForm.unit.test.ts
    useSqlEditorApi.ts       # Save query, export result, format SQL (lazy import)
    useSqlEditorApi.unit.test.ts
    useSqlEditorActions.ts   # Keybindings, execute handler, CodeMirror extensions assembly
    useSqlEditorActions.unit.test.ts
    useSqlResults.ts         # resultStatus, currentResultSet, displayData, activeResultSetIndex
    useSqlResults.unit.test.ts
  # Existing files stay unchanged:
  codemirrorTheme.ts
  SaveQueryDialog.tsx
  sqlCompletionContext.ts
  sqlCompletionContext.unit.test.ts
  sqlSelection.ts
  sqlSelection.unit.test.ts
  clickhouseKeywords.ts
  syntaxHighlight.unit.test.ts
```

## sqlThemes.ts — Theme Data Extraction

Extract lines 82–219 from SqlEditor.tsx.

**Exports:**
- `SqlSyntaxPalette` type — keyword, function, type, string, number, variable, operator, comment, constant
- `createSqlSyntaxTheme(palette: SqlSyntaxPalette): Extension[]` — builds HighlightStyle
- `SQL_SYNTAX_THEME_MAP: Record<ThemeId, Extension[]>` — all 10 theme entries (default, one-dark, github-light, github-dark, monokai-pro, night-owl, shades-of-purple, palenight, cyberpunk, nord, dracula)

**Dependencies:** `@codemirror/language` (HighlightStyle, syntaxHighlighting), `@lezer/highlight` (tags), `@codemirror/theme-one-dark`, `@/theme/themeRegistry` (ThemeId).

This file has zero React dependencies. Pure data + pure functions.

## Hook: useSqlEditorForm

**Purpose:** Manages the SQL text value with controlled/uncontrolled pattern and debounced parent notification.

**Signature:**
```ts
function useSqlEditorForm(props: {
  value?: string;
  onChange?: (value: string) => void;
}): {
  code: string;
  handleSqlChange: (val: string) => void;
}
```

**Extracts from SqlEditor.tsx:**
- `internalSql` state (line 266)
- `timeoutRef` for debounce (line 268)
- `handleSqlChange` callback (lines 343–363) — updates internal state immediately, debounces parent callback by 300ms
- Cleanup `useEffect` for timeout (lines 334–340)
- `code` derivation: `value !== undefined ? value : internalSql` (line 331)

**Test cases:**
- Uses internal state when no `value` prop provided
- Uses controlled value when `value` prop provided
- Debounces onChange callback by 300ms
- Cleans up timeout on unmount

## Hook: useSqlEditorApi

**Purpose:** Handles all API-backed operations — save, export, format.

**Signature:**
```ts
function useSqlEditorApi(props: {
  code: string;
  connectionId?: number;
  databaseName?: string;
  driver?: string;
  savedQueryId?: number;
  initialName?: string;
  initialDescription?: string;
  onSaveSuccess?: (savedQuery: SavedQuery) => void;
}): {
  executeSave: (name: string, description: string) => Promise<void>;
  triggerSave: () => void;
  handleExportResult: (format: TransferFormat) => Promise<void>;
  handleFormat: () => Promise<void>;
  isFormatting: boolean;
  isSaveDialogOpen: boolean;
  setIsSaveDialogOpen: (open: boolean) => void;
}
```

**Extracts from SqlEditor.tsx:**
- `isFormatting` state (line 270)
- `isSaveDialogOpen` state (line 269)
- `savedQueryIdRef` (line 430)
- `executeSave` callback (lines 436–470)
- `handleSave` wrapper (lines 472–474)
- `handleExportResult` callback (lines 476–535)
- `handleFormat` callback (lines 395–428) — lazy-imports `sql-formatter`, maps driver to dialect
- `triggerSave` callback (lines 537–547)

**Dependencies:** `api.queries.create/update`, `api.transfer.exportQueryResult`, `@tauri-apps/plugin-dialog` (save), `sonner` (toast), `@/lib/errors` (errorMessage), i18n.

**Test cases:**
- `executeSave` calls create when no savedQueryId
- `executeSave` calls update when savedQueryId exists
- `triggerSave` opens dialog when no savedQueryId
- `triggerSave` calls executeSave directly when savedQueryId exists
- `handleFormat` maps driver to correct sql-formatter dialect
- `handleExportResult` shows error when no connectionId

## Hook: useSqlEditorActions

**Purpose:** Assembles CodeMirror extensions, keybindings, and editor action handlers.

**Signature:**
```ts
function useSqlEditorActions(props: {
  driver?: string;
  schemaOverview?: SchemaOverview;
  editorFontSizePx: number;
  onExecute?: (sql: string) => void;
  handleFormat: () => Promise<void>;
  triggerSave: () => void;
  handleSqlChange: (val: string) => void;
}): {
  extensions: Extension[];
  editorTheme: Extension[];
  editorViewRef: React.MutableRefObject<EditorView | null>;
  handleExecute: () => void;
  handleClear: () => void;
}
```

**Extracts from SqlEditor.tsx:**
- `editorViewRef` (line 431)
- `dialect` memo (lines 563–582)
- `sqlSchema` memo (lines 585–603)
- `customCompletion` memo (lines 605–651)
- `extensions` memo (lines 654–717) — includes fontSizeExt, lineWrapping, sql(), keymap with execute/format/save/accept bindings
- `editorTheme` memo (lines 720–726)
- `executeFromEditorSelection` callback (lines 365–379) — uses `collectSelectedSql`
- `handleExecute` callback (lines 381–389)
- `handleClear` callback (lines 391–393)
- Stable refs: `executeFromEditorRef`, `handleFormatRef`, `triggerSaveRef` (lines 550–555)
- Shortcut bindings: `executeBinding`, `saveBinding`, `formatBinding`, `acceptBinding` (lines 557–560)

**Dependencies:** `@uiw/react-codemirror`, `@codemirror/lang-sql`, `@/lib/shortcuts/match` (comboToCodeMirror), `@/contexts/ShortcutsContext` (useShortcutBinding), `sqlSelection` (collectSelectedSql), `sqlCompletionContext` (buildSqlContextualCompletion), `clickhouseKeywords`, `sqlThemes`.

**Test cases:**
- `dialect` returns correct SQL dialect for each driver
- `sqlSchema` builds correct namespace from schemaOverview
- `handleExecute` calls onExecute with selected SQL when editorViewRef is set
- `handleExecute` falls back to code prop when editorViewRef is null
- `handleClear` calls handleSqlChange with empty string

## Hook: useSqlResults

**Purpose:** Computes derived result state from query results.

**Signature:**
```ts
function useSqlResults(props: {
  queryResults?: SqlEditorProps["queryResults"];
}): {
  resultStatus: { text: string; toneClass: string; Icon: LucideIcon } | null;
  displayData: any[];
  displayColumns: string[];
  hasMultipleResults: boolean;
  activeResultSetIndex: number;
  setActiveResultSetIndex: (idx: number) => void;
  currentResultSet: SingleResultState | null;
}
```

**Extracts from SqlEditor.tsx:**
- `activeResultSetIndex` state (line 271)
- `resultStatus` memo (lines 277–314) — derives status text, tone class, and icon from queryResults
- `hasMultipleResults` derivation (lines 316–317)
- `currentResultSet` memo (lines 318–324)
- `displayData` derivation (line 326)
- `displayColumns` derivation (lines 327–328)

**Dependencies:** `react-i18next` (useTranslation), `lucide-react` (CheckCircle2, XCircle).

**Test cases:**
- Returns null resultStatus when no queryResults
- Returns error status when queryResults.error exists
- Returns success status with row count for single result set
- Returns multi-result status with total rows for multiple result sets
- `displayData` uses currentResultSet data when multiple results
- `displayData` falls back to queryResults.data for single result
- `activeResultSetIndex` defaults to 0

## SqlToolbar — Pure Render Component

**Purpose:** Renders the toolbar with database selector, action buttons, result status, and export dropdown.

**Props:**
```ts
interface SqlToolbarProps {
  databaseName?: string;
  availableDatabases?: string[];
  canSwitchDatabase: boolean;
  savedQueryId?: number;
  schemaOverview?: SchemaOverview;
  onDatabaseChange?: (database: string) => void;
  isExecuting?: boolean;
  isFormatting: boolean;
  onExecute: () => void;
  onFormat: () => void;
  onCancel?: () => void;
  onTriggerSave: () => void;
  onClear: () => void;
  resultStatus: { text: string; toneClass: string; Icon: LucideIcon } | null;
  queryResults?: SqlEditorProps["queryResults"];
  onExportResult: (format: TransferFormat) => void;
}
```

**Extracts:** Lines 730–909 from SqlEditor.tsx. All `useTranslation` calls stay here. No hooks, no API calls — pure props-in, JSX-out.

## SqlResultsPanel — Pure Render Component

**Purpose:** Renders query results — error display, result set tabs, and TableView.

**Props:**
```ts
interface SqlResultsPanelProps {
  queryResults: NonNullable<SqlEditorProps["queryResults"]>;
  hasMultipleResults: boolean;
  activeResultSetIndex: number;
  onResultSetChange: (idx: number) => void;
  displayData: any[];
  displayColumns: string[];
}
```

**Extracts:** Lines 938–978 from SqlEditor.tsx. The `t()` calls for error heading stay here via useTranslation.

## SqlEditor.tsx — Container After Decomposition

The container shrinks to ~200 lines. It:
1. Calls all four hooks
2. Computes `canSwitchDatabase` (3-line derivation)
3. Renders `<SqlToolbar>` with all required props
4. Renders `<ResizablePanelGroup>` with CodeMirror and `<SqlResultsPanel>`
5. Renders `<SaveQueryDialog>`

**SqlEditorProps interface stays unchanged.** Zero breaking changes to any consumer.

## Implementation Order

1. `sqlThemes.ts` — extract theme data, verify imports work
2. `useSqlResults` — simplest hook, no cross-dependencies
3. `useSqlEditorForm` — self-contained state management
4. `useSqlEditorApi` — depends on form's `code` output
5. `useSqlEditorActions` — depends on api's `handleFormat` and `triggerSave`
6. `SqlResultsPanel` — pure render, uses useSqlResults output
7. `SqlToolbar` — pure render, uses multiple hook outputs
8. `SqlEditor.tsx` — rewire to use hooks + components, delete extracted code

Each step is independently committable. The component stays functional after each step.

## Verification

After decomposition:
- `cargo check` (no Rust changes, but verify no regressions)
- `npm run lint` — no lint errors
- `npm run typecheck` — TypeScript compiles cleanly
- `npm run test` — all existing tests pass
- New unit tests for each hook pass
- Manual smoke test: open SqlEditor, execute query, format, save, export
