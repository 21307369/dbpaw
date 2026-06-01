## Why

The Settings → Shortcuts panel currently shows a static, hard-coded list of
shortcuts (see `SHORTCUT_GROUPS` in `src/components/settings/SettingsDialog.tsx:162-234`)
with a banner that explicitly says *"Read-only in this version. Shortcut editing
is not supported yet."* Meanwhile, the actual handlers scattered across
`App.tsx:1820-1876` (global), `SqlEditor.tsx:660-688` (CodeMirror keymap) and
`TableView.tsx:1600-1680` (table view) are wired to fixed key combos such as
`Cmd/Ctrl + N` for a new query and `Cmd/Ctrl + \` for the AI sidebar.

These defaults clash with browser and OS muscle memory in different ways per
user. A database tool used by power users for hours at a time must let people
remap collisions (e.g. `Ctrl + T` instead of `Ctrl + N` for a new tab,
`Ctrl + K` for the AI sidebar) and disable shortcuts they never want to hit
by accident. The infrastructure for persistence (`src/services/store.ts`) and
target detection (`src/lib/keyboard.ts`) already exists — we just need to
wire it through a real editing surface and re-route the handlers through
runtime-resolved bindings.

## What Changes

- Add a persisted `shortcuts.v1` config in the Tauri settings store, holding
  the current binding for every shortcut. Defaults are derived from the
  current hard-coded handlers, so out-of-the-box behavior is unchanged.
- Introduce a normalized key-combo notation (`Mod+Shift+Key`, with `Mod` =
  `Cmd` on macOS / `Ctrl` elsewhere) plus a `matchShortcut(event, combo)`
  helper. The display layer renders platform-correct glyphs
  (`⌘ + S` vs `Ctrl + S`).
- Refactor the three handler sites (`App.tsx`, `SqlEditor.tsx`,
  `TableView.tsx`) to resolve their combos from the live config at
  decision time, so edits take effect immediately without a restart.
- Replace the read-only grid in `SettingsDialog` with an editable table: a
  per-row "Record" button captures the next key press, validates it
  (must include at least one modifier, must not collide with another
  binding in the same scope unless the user explicitly takes it), and a
  "Reset to default" action restores the original combo. A global
  "Restore defaults" clears everything at once.
- Each shortcut can be **disabled** by setting its binding to a sentinel
  `none` value, useful for users who want to free a chord for something
  outside the app.
- Add localized strings (en, zh, ja) for: *Record shortcut*, *Press keys*,
  *Reset to default*, *Restore all defaults*, *Disabled*, *At least one
  modifier is required*, *This shortcut conflicts with `<name>`*.

## Capabilities

### New Capabilities

- `keyboard-shortcuts`: the configurable keymap, its persistence contract,
  the recording/conflict UX, and the requirement that existing handlers
  consult the live config.

### Modified Capabilities

- (none — there are no existing spec files in `openspec/specs/` yet, and
  the existing AGENTS.md / project rules describe implementation, not
  user-facing requirements. The editable UX is a new capability.)

## Impact

- **Frontend**
  - `src/components/settings/SettingsDialog.tsx` — replace the static
    `SHORTCUT_GROUPS` table with an editable surface driven by a new
    `ShortcutsContext`.
  - `src/App.tsx` — global keydown handler reads bindings from context.
  - `src/components/business/Editor/SqlEditor.tsx` — CodeMirror keymap
    rebuilt from current bindings (still via `Prec.high(keymap.of(...))`).
  - `src/components/business/DataGrid/TableView.tsx` — table-view
    keydown handler reads bindings from context.
  - `src/services/store.ts` — no API change, but the new module uses
    `getSetting` / `saveSetting` as the rest of the app does.
- **New files**
  - `src/lib/shortcuts/types.ts` — `ShortcutId`, `KeyCombo`, schema.
  - `src/lib/shortcuts/defaults.ts` — the canonical default table
    (replaces the constants currently inlined in `App.tsx`,
    `SqlEditor.tsx`, `TableView.tsx` and the display-only
    `SHORTCUT_GROUPS`).
  - `src/lib/shortcuts/match.ts` — `matchShortcut`, `comboToDisplay`.
  - `src/lib/shortcuts/recorder.tsx` — headless hook + small
    `<ShortcutRecorder />` component used inside the settings row.
  - `src/contexts/ShortcutsContext.tsx` — provider, `useShortcuts`,
    `useShortcutBinding(id)`, with optimistic update + store sync.
- **i18n**: three new string blocks under `settings.shortcuts.*` in
  `en.ts`, `zh.ts`, `ja.ts`.
- **Tests**
  - `match.unit.test.ts` — `matchShortcut` truth table for modifiers,
    key variants (`BracketRight` ↔ `]`), and the `Mod` alias.
  - `recorder.unit.test.ts` — validation: at least one modifier,
    conflict detection, escape-to-cancel.
- **No backend / Tauri command changes.** Persistence is fully handled
  by the existing `settings.json` store.
- **No new runtime dependencies.** The recorder is built on the native
  `keydown` event; no `mousetrap`, `react-hotkeys-hook`, etc.
