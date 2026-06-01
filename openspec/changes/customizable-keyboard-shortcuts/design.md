## Context

Today the settings panel shows a static table of shortcuts sourced from the
hard-coded `SHORTCUT_GROUPS` constant in
`src/components/settings/SettingsDialog.tsx:162-234`, with a banner that
literally reads *"Read-only in this version. Shortcut editing is not
supported yet."* The actual handlers that fire those shortcuts live in three
disconnected places, each with their own `keydown` switch:

- **Global** — `src/App.tsx:1820-1876` listens on `window` for
  `Mod + ,` / `Mod + \` / `Mod + B` / `Mod + N` / `Mod + W` /
  `Mod + Shift + ]` / `Mod + Shift + [`.
- **SQL Editor** — `src/components/business/Editor/SqlEditor.tsx:660-688`
  wires a CodeMirror `keymap.of([...])` with `Tab`, `Mod-Enter`,
  `Shift-Alt-f`, `Mod-s`.
- **Table view** — `src/components/business/DataGrid/TableView.tsx:1600-1680`
  listens on `window` for `Mod + S` / `Mod + F` / `Mod + C` / `Escape`.
- **Input panels** — `AISidebar.tsx:434-…` and `SaveQueryDialog.tsx:81-…`
  handle plain `Enter` for submit (with `Shift + Enter` → newline).

Existing infrastructure we will reuse:

- `src/lib/keyboard.ts` already centralises `isModKey`,
  `isEditableTarget`, `shouldIgnoreGlobalShortcut`. We extend it rather
  than replace it.
- `src/services/store.ts` exposes `getSetting` / `saveSetting` with a
  Tauri `settings.json` store that falls back to `localStorage` in
  web/mock mode — exactly the persistence pattern the rest of the app
  uses (`theme-provider.tsx`, `SettingsDialog.tsx`, `i18n/index.ts`).

The change is cross-cutting (three handler sites, a new context, a new
settings UI surface) and the data model matters for cross-platform
behaviour (`Mod` is `Cmd` on macOS, `Ctrl` elsewhere, and the OS reports
the same physical key as `BracketRight` / `[` / `{` depending on
shift/alt state), so a written design is warranted.

## Goals / Non-Goals

**Goals**

- A user can rebind any shortcut listed in the current `SHORTCUT_GROUPS`
  from the Settings → Shortcuts panel, and the new binding takes effect
  immediately for the running app — no restart.
- A user can disable a shortcut entirely.
- A user can reset a single binding or the whole set to the bundled
  defaults.
- Bindings survive a restart and round-trip through the Tauri store
  (with `localStorage` fallback for the web mock).
- Conflict detection: a binding the user picks while recording is
  rejected (with a hint pointing at the conflicting action) if it is
  already taken by another shortcut in the same scope, unless the user
  explicitly steals it.

**Non-Goals**

- Chord sequences (`Ctrl-K Ctrl-S` GitHub style). Single chord only.
- Per-connection / per-database override scopes. Shortcuts are global to
  the app instance.
- Importing / exporting shortcut profiles, syncing across devices.
- Rebinding native browser shortcuts that the OS intercepts before us
  (e.g. `Ctrl + W` closing the window in some Linux WMs) — we can map
  the in-app action, but cannot override the OS.
- New third-party libraries. Recorder is built on the native `keydown`
  event; matcher is hand-written (≤ 80 lines).

## Decisions

### 1. Normalised key-combo representation (`Mod`-based)

We store every binding as a canonical string:
`{Mod|Alt|Ctrl|Meta|Shift}(+...)+Key`, sorted alphabetically
(`Alt+Mod+Shift+S`). `Mod` is a **placeholder** meaning "Cmd on macOS,
Ctrl on Windows/Linux". This is the same convention CodeMirror uses
(`Mod-Enter`, `Mod-s`), which is why we chose it — the existing SQL
Editor keymap already speaks that dialect and we can keep it.

Two helper functions in `src/lib/shortcuts/match.ts`:

- `comboFromEvent(e: KeyboardEvent): string` — read `metaKey/ctrlKey/
  altKey/shiftKey + e.code` (NOT `e.key`, which is layout-dependent
  and changes with Shift, e.g. `e.key` of `]` becomes `}` when Shift
  is held). Output uses `Mod` for `meta || ctrl` so storage is
  platform-neutral.
- `matchShortcut(e: KeyboardEvent, combo: string): boolean` — parses
  the combo, compares the held modifier mask bit-for-bit (Cmd and Ctrl
  are NOT interchangeable at the matcher level — `Mod` already encodes
  the platform's "primary modifier"), and compares `e.code` against
  the trailing key token (`BracketRight` / `KeyS` / `Enter` / `Tab` /
  `Escape` / `Backslash` / `Comma` / `Slash` / `F5` …).

Display layer translates to glyphs with `comboToDisplay(combo,
platform)` (`⌘ + S` on macOS, `Ctrl + S` on Windows/Linux, with `Shift`
→ `⇧`, `Alt` → `⌥`, `Meta` → `⌃`).

**Why not just store the literal `e.key`?** The user pressed `Cmd + ;`
on a German keyboard where the physical key produces `ö` with Shift
held. We must not depend on the user's OS layout or current Shift
state — `e.code` is layout-independent.

**Why not store the resolved `Cmd vs Ctrl` per platform?** Then
"synced defaults" become ambiguous when the same file is shared by
users on different OSes. `Mod` keeps the file portable.

### 2. Identifier-based registry, not "action label"

Each shortcut has a stable id and metadata:

```ts
type ShortcutId =
  | "global.openSettings"
  | "global.toggleAiSidebar"
  | "global.toggleMainSidebar"
  | "global.newQueryTab"
  | "global.closeTab"
  | "global.nextTab"
  | "global.prevTab"
  | "editor.execute"
  | "editor.save"
  | "editor.format"
  | "editor.acceptCompletion"
  | "table.save"
  | "table.openSearch"
  | "table.copySelection"
  | "table.cancelEdit";
```

Defaults live in `src/lib/shortcuts/defaults.ts` as a
`Record<ShortcutId, { combo: string; scope: ShortcutScope; labelKey:
i18nKey; noteKey?: i18nKey }>`. The `SHORTCUT_GROUPS` constant in
`SettingsDialog.tsx` is **deleted** — the display is now generated
from this registry, so adding a new shortcut is a one-line change in
one file.

**Why not match on the user-visible action label?** Labels get
translated; IDs do not. Otherwise a user on a Chinese locale who
rebinds "新建查询" would lose the binding when they switch to English.

### 3. Persisted shape: flat map per id

`getSetting<Record<ShortcutId, string>>("shortcuts.v1", defaults)` —
the value is just the user's chosen combo per id, NOT a deep object.
Resetting means deleting the key (or replacing the whole map with
`{ ...defaults }`).

Schema versioning: the key suffix is `.v1`. A future breaking change
(e.g. adding chord support) bumps to `.v2` and the loader falls back
to `defaults` when the version key is missing.

### 4. `ShortcutsContext` for live updates

A small React context (`src/contexts/ShortcutsContext.tsx`) wraps the
app at the same level as the existing `ThemeProvider`. It:

1. Loads `shortcuts.v1` once on mount via `getSetting`.
2. Exposes `bindings: Record<ShortcutId, string>` and
   `setBinding(id, combo)` / `resetBinding(id)` / `resetAll()`.
3. `setBinding` calls `saveSetting` and updates in-memory state
   synchronously, so the running keydown handlers re-read the new
   binding on the next event (no provider re-mount needed).

`useShortcutBinding(id)` returns just the current combo string for
components that hard-code a single chord (the SQL Editor
`keymap.of`).

`useShortcutMatcher()` returns a function
`(e: KeyboardEvent, id: ShortcutId) => boolean` that components call
inside their existing `keydown` listeners — same call site, just
delegates to the central matcher.

### 5. Recorder UX: per-row "Record" button + modal-less inline state

Each row in the shortcuts table looks like:

```
[ Action label ]  [ ⌘ + S ]  [ Reset ]   <- idle
[ Action label ]  [ Press keys… ]  [ Cancel ]   <- recording
```

Implementation: a `<ShortcutRecorder id=… />` component renders the
current display string, opens a small `keydown` listener on
`window` when "Record" is clicked, captures the next chord, runs
validation, and either commits or shows an inline error. The
recording state is local to the row — no portal, no global modal —
to match the rest of the settings UI's density.

Validation rules (in this order, first failure stops the commit):

1. `e.key === "Escape"` → cancel, no change.
2. Must include at least one of `Mod/Alt/Ctrl/Meta/Shift`. Reject bare
   `F5` / `Tab` / `Enter` as new bindings (these stay configurable via
   the `id` for existing shortcuts that already use them — we just
   refuse new modifierless bindings to avoid hijacking plain typing).
3. Convert to canonical form, then check conflict map.
4. If conflicts, show a confirm: *"This shortcut is already used by
   `<conflicting label>`. Replace it?"* (Yes / Cancel). If the
   conflict is in a different scope, the confirm is informational
   only — we still allow it.

### 6. Storage key separation

The key `shortcuts.v1` is independent of any other setting. We do not
nest it under a generic `settings` object to avoid an existing
`saveSetting` key collision. `getSetting<…>(key, defaultValue)`
already handles the "missing key → return default" case, so first-run
users get defaults for free.

### 7. Per-scope matcher re-use

We keep the existing scope semantics — global handlers check
`shouldIgnoreGlobalShortcut(e)` first (already does), table handlers
check `containerRef.current.contains(target)` (already does). The
matcher is the only new thing; the rest of the scope logic is
untouched. This means a global shortcut rebound by the user
auto-respects the "do not fire while typing in a `<input>`" rule that
already exists, with no change to those call sites.

## Risks / Trade-offs

- **Hand-rolled matcher vs `mousetrap`/`react-hotkeys-hook`** → We
  accepted the cost of a tiny matcher (it is a `String.split("+")` and
  a few boolean compares) to keep zero new dependencies. If the
  registry grows past ~30 entries we should reconsider, but the
  current 14 fit comfortably.
- **Stale CodeMirror keymap** → CodeMirror's `keymap.of` is built once
  per `useMemo` dep change. We must include the current bindings
  in that dep list, otherwise the editor keymap is frozen at the
  values the editor was constructed with. Mitigation: the
  `SqlEditor` already rebuilds the `EditorView` on theme/dialect
  change; we extend the dep list to include the relevant binding
  subset and re-create the view only if the binding actually changed.
- **Recorder captures keys from a focused `<input>`** → When the user
  clicks the Record button, focus moves to a `<button>`, so a global
  `window` listener still works. We also stop propagation on the
  captured event to prevent the underlying app from also firing the
  shortcut during the recording attempt.
- **Conflict UX steals a binding silently if user misses the prompt**
  → The confirm is a required step in the recorder flow, not a
  toast-after-the-fact. Tested via the recorder unit test.
- **macOS `Cmd + ,` is the system "Settings" shortcut in some
  bundles** → We document this in the row's `note` for
  `global.openSettings` but do not block it. Users who want it can
  still rebind, and the default is unchanged from the current
  behaviour.
- **Migration of existing read-only state** → The current UI is
  read-only, so there is no prior binding data to migrate. First-run
  users see the same defaults as today.

## Migration Plan

1. Land the registry, matcher, and context behind a feature flag-free
   rollout (defaults match the existing handlers 1:1 — verified by the
   new `match.unit.test.ts` table that runs through every binding).
2. Switch the three handler call sites to read from context in
   separate commits (App → SqlEditor → TableView), so a regression
   bisects cleanly.
3. Replace the static `SHORTCUT_GROUPS` render with the editable
   surface, gated on `useShortcuts()` being loaded (avoid a flash of
   the old read-only table on first paint).
4. Ship behind the existing release notes process; no flag needed.
   Rollback: revert the four commits. The persisted `shortcuts.v1`
   key will simply be ignored by the reverted code.

## Open Questions

- Should the "Reset to default" be per-row, per-group, or both? The
  proposal currently says both. Confirm with the user before
  implementation if they prefer one.
- Should the conflict confirm be a `<Dialog>` or an inline inline
  form on the row? Defaulting to inline (matches the rest of the
  settings density). Will confirm during implementation.
- The `Input Panels` group currently lists `Enter` as a "shortcut" —
  technically the same key with no modifier, captured by
  `isEditableTarget` logic. We will keep these editable but warn in
  the row note that they only apply when an input has focus.
