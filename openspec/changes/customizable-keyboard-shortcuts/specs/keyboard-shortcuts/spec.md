## ADDED Requirements

### Requirement: Shortcut registry and defaults
The system SHALL maintain a single, identifier-keyed registry of every
user-rebindable shortcut (`ShortcutId` ↔ `{ combo, scope, labelKey,
noteKey? }`). The registry's default combos MUST exactly match the
binding that the application hard-codes today for the matching action,
so a first-run user with no persisted config sees identical behaviour
to the pre-change build.

#### Scenario: Every previously hard-coded shortcut has a default entry
- **WHEN** the registry is read on first launch
- **THEN** it contains one entry per shortcut currently wired in
  `App.tsx`, `SqlEditor.tsx`, and `TableView.tsx`
- **AND** each entry's default `combo` equals the literal key the
  corresponding handler currently checks for (e.g.
  `global.openSettings` → `Mod+,`)

#### Scenario: Adding a new shortcut is a one-line change
- **WHEN** a developer adds a new entry to `defaults.ts` and references
  its id from a handler
- **THEN** the new row appears automatically in the Settings → Shortcuts
  panel without further UI edits

### Requirement: Normalised key-combo representation
The system SHALL store every binding as a canonical string of the form
`{Modifier}(+Modifier)+Key`, sorted alphabetically, using `Mod` as a
platform-neutral alias for the primary modifier (Cmd on macOS, Ctrl
elsewhere). The matcher SHALL compare against `KeyboardEvent.code` (not
`KeyboardEvent.key`) so that the result is independent of the user's
keyboard layout and current Shift/Alt state.

#### Scenario: Shift+bracket is stored layout-independently
- **WHEN** the user presses `Cmd + Shift + ]` on a US layout
- **THEN** the recorded binding is stored as `Mod+Shift+BracketRight`
  (not `Mod+Shift+]` and not `Mod+Shift+}`)

#### Scenario: `Mod` resolves per platform
- **WHEN** the matcher evaluates `Mod+S` on macOS
- **THEN** it matches `e.metaKey && !e.ctrlKey` with `e.code === "KeyS"`
- **AND** when evaluated on Windows/Linux it matches
  `e.ctrlKey && !e.metaKey` with `e.code === "KeyS"`

#### Scenario: Modified mask is matched exactly
- **WHEN** the stored binding is `Mod+S` and the user presses
  `Cmd + Shift + S`
- **THEN** the matcher returns `false` (the extra Shift must be
  declared in the binding)

### Requirement: Live binding lookup
The system SHALL provide a React context (`ShortcutsContext`) that
loads the persisted `shortcuts.v1` map on mount, exposes
`bindings: Record<ShortcutId, string>`, and offers
`setBinding(id, combo)` / `resetBinding(id)` / `resetAll()`. After
`setBinding` resolves, every active handler that consults the
context MUST observe the new binding on the very next matching
keyboard event (no provider remount, no app restart).

#### Scenario: Edit takes effect without reload
- **WHEN** the user rebinds `global.newQueryTab` from `Mod+N` to
  `Mod+T` and presses `Cmd + T`
- **THEN** a new query tab is created
- **AND** pressing `Cmd + N` no longer creates a new query tab

#### Scenario: Reset to default restores the bundled value
- **WHEN** the user clicks "Reset" on a row whose stored binding is
  `Mod+T` and the registry default is `Mod+N`
- **THEN** the persisted entry is removed (or set to the default
  value)
- **AND** pressing `Cmd + N` again creates a new query tab

### Requirement: Recorder UX and validation
The system SHALL render each row in Settings → Shortcuts as an
editable surface with a "Record" affordance. While recording, the
next non-modifier keydown commits, `Escape` cancels, and the new
combo MUST pass all of the following validations before persisting:

1. The combo includes at least one of `Mod`, `Alt`, `Ctrl`, `Meta`,
   or `Shift` (no bare single keys, function keys, `Tab`, `Enter`,
   etc. — those remain editable only for the few existing ids that
   already use them).
2. The combo is non-empty after normalisation.
3. If the combo is already bound to another shortcut in any scope,
   the user is shown a confirm identifying the conflicting action and
   the binding is committed only after explicit confirmation.

#### Scenario: Modifierless single key is rejected as a new binding
- **WHEN** the user records `F5` for `editor.format`
- **THEN** the recorder shows the validation error
  *"At least one modifier is required"*
- **AND** the existing `Shift+Alt+F` binding is unchanged

#### Scenario: Escape cancels the recording
- **WHEN** the user is recording and presses `Escape`
- **THEN** the recorder returns to its idle display
- **AND** no binding is written to the store

#### Scenario: Conflict is surfaced before commit
- **WHEN** the user records `Mod+S` for `editor.save` while
  `table.save` already binds `Mod+S`
- **THEN** the recorder shows *"This shortcut is already used by
  'Save pending changes'. Replace it?"* with Confirm / Cancel
- **AND** choosing Cancel leaves the existing binding intact

#### Scenario: Confirmed conflict steals the binding
- **WHEN** the user confirms the conflict prompt above
- **THEN** `editor.save` is updated to `Mod+S`
- **AND** `table.save` is updated to `"none"` (disabled) and its
  row shows the "Disabled" state

### Requirement: Disabled shortcuts
The system SHALL treat the sentinel value `"none"` as a binding that
intentionally disables the shortcut. Disabled shortcuts MUST NOT fire
their handler under any circumstances, and the row MUST display a
"Disabled" affordance and offer a one-click re-enable.

#### Scenario: Disabled binding never fires
- **WHEN** `global.openSettings` is set to `"none"`
- **THEN** pressing `Cmd + ,` opens neither the system nor the
  in-app settings dialog
- **AND** the row in Settings shows "Disabled" instead of the combo

#### Scenario: Re-enabling restores the previous binding
- **WHEN** the user clicks "Enable" on a row whose binding is `none`
- **THEN** the row returns to its idle edit state with the last
  non-`none` binding as the displayed value

### Requirement: Persistence via the existing settings store
The system SHALL persist every change through `getSetting` /
`saveSetting` (`src/services/store.ts`) under the key
`shortcuts.v1`, in the shape
`Record<ShortcutId, string>`. First-run users (no entry on disk) MUST
receive the registry defaults; web/mock mode MUST round-trip through
`localStorage` exactly like every other setting in the app.

#### Scenario: First-run user gets defaults
- **WHEN** the settings store has no `shortcuts.v1` entry
- **THEN** `getSetting("shortcuts.v1", defaults)` returns
  `Record<ShortcutId, string>` equal to the registry's default map
- **AND** the Settings panel renders the same combos as the read-only
  build

#### Scenario: Web mock mode persists to localStorage
- **WHEN** `isTauri()` returns false and the user rebinds
  `global.openSettings` to `Mod+P`
- **THEN** `localStorage.getItem("shortcuts.v1")` contains a JSON
  object whose `global.openSettings` field is `"Mod+P"`
- **AND** reloading the page restores the binding

### Requirement: Scoped, conflict-aware handler integration
The system SHALL keep the existing scope semantics: global handlers
do not fire while an editable target has focus
(`shouldIgnoreGlobalShortcut`); table handlers check the table
container contains the event target; SQL Editor handlers run inside
CodeMirror's `keymap.of` and therefore always have editor focus. The
matcher MUST be a pure function callable from any of these sites
without additional scope plumbing.

#### Scenario: Global shortcut respects editable focus
- **WHEN** focus is in a CodeMirror editor and the user presses
  `Cmd + N` while `global.newQueryTab` is bound to `Mod+N`
- **THEN** no new query tab is created
- **AND** the CodeMirror editor handles the keystroke normally

#### Scenario: Table shortcut stays scoped
- **WHEN** the table view is not the active tab and the user presses
  `Cmd + F` while `table.openSearch` is bound to `Mod+F`
- **THEN** the table search dialog does not open
- **AND** the keystroke either does nothing or is handled by the
  focused control, per existing scope rules

### Requirement: Localised recorder labels
The system SHALL provide localised strings (en, zh, ja) for every new
piece of user-facing copy in the recorder surface: the "Record" /
"Press keys…" / "Cancel" / "Reset" / "Restore all defaults" /
"Disabled" / "At least one modifier is required" / conflict prompt
template. Locale files MUST be TypeScript (matching the existing
`src/lib/i18n/locales/*.ts` pattern) and registered in
`src/lib/i18n/index.ts` if a new file is added.

#### Scenario: All new copy is translated
- **WHEN** the app locale is set to `zh`
- **THEN** every label in the shortcuts panel renders in Chinese,
  including error and conflict messages
- **AND** there is no English fallback string visible in the
  recorder UI
