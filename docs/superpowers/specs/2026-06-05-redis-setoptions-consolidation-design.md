# RedisKeyFormHeader SET Options Props Consolidation

## Problem

`RedisKeyFormHeader` has 27 props, 10 of which are SET-option related (5 values + 5 setters). This makes the component interface noisy and the prop-passing chain verbose.

## Solution

Consolidate 10 SET-option props into a single `setOptions` object + `onSetOptionsChange` callback using `Partial` patch updates.

## Scope

Three files:
- `src/components/business/Redis/RedisKeyFormHeader.tsx` — type + prop usage
- `src/components/business/Redis/useRedisKey.ts` — state management
- `src/components/business/Redis/RedisKeyView.tsx` — prop passing

## Design

### 1. Type Definition (RedisKeyFormHeader.tsx)

```ts
interface SetOptions {
  expanded: boolean;
  nx: boolean;
  xx: boolean;
  px: string;
  keepttl: boolean;
}
```

Replace 10 props in `RedisKeyFormHeaderProps`:

```ts
setOptions: SetOptions;
onSetOptionsChange: (patch: Partial<SetOptions>) => void;
```

Props: 27 → 19.

### 2. Hook (useRedisKey.ts)

Merge 5 `useState` into 1:

```ts
const [setOptions, setSetOptions] = useState<SetOptions>({
  expanded: false,
  nx: false,
  xx: false,
  px: "",
  keepttl: false,
});

const handleSetOptionsChange = (patch: Partial<SetOptions>) =>
  setSetOptions(prev => ({ ...prev, ...patch }));
```

`handleSave` uses `setOptions.nx`, `setOptions.px`, etc.

Return: `setOptions` + `handleSetOptionsChange` (replaces 10 individual values/setters).

### 3. Consumer (RedisKeyView.tsx)

```tsx
<RedisKeyFormHeader
  // ... other props ...
  setOptions={hk.setOptions}
  onSetOptionsChange={hk.handleSetOptionsChange}
/>
```

### 4. Component Internal (RedisKeyFormHeader.tsx)

All references update:
- `setNx` → `setOptions.nx`
- `onSetNxChange(true)` → `onSetOptionsChange({ nx: true })`
- `setOptionsExpanded` → `setOptions.expanded`
- `onSetOptionsExpandedChange(!setOptionsExpanded)` → `onSetOptionsChange({ expanded: !setOptions.expanded })`

## Verification

- `cargo check` (no Rust changes, but confirm no regressions)
- `npm run typecheck` — TypeScript compilation passes
- Manual: create a new string key with NX + PX options, verify behavior unchanged
