# ConnectionDialog Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `ConnectionDialog.tsx` from a 1234-line monolith into a ~400-line orchestrator by extracting driver-specific form sections and adding a `useFormField` helper to eliminate repeated `setForm` boilerplate.

**Architecture:** Create a `useFormField` hook that returns `[value, onChange]` for any `ConnectionForm` field. Extract Redis, Elasticsearch, MongoDB, and MSSQL form sections into standalone components that receive `form`/`setForm` props. The main `ConnectionDialog` keeps generic fields (host/port, username/password, database/schema, SSL, SSH, file path) and conditionally renders driver sections.

**Tech Stack:** React, TypeScript, react-i18next, existing shadcn/ui components (Input, Select, Textarea, Checkbox, Label)

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/connection-form/use-form-field.ts` | Create | `useFormField` helper hook |
| `src/components/business/Sidebar/connection-list/RedisFormSection.tsx` | Create | Redis mode/host/port/seed-nodes/sentinels/timeout fields |
| `src/components/business/Sidebar/connection-list/ElasticsearchFormSection.tsx` | Create | Cloud ID, auth mode, username/password, API key fields |
| `src/components/business/Sidebar/connection-list/MongoDbFormSection.tsx` | Create | Auth source field |
| `src/components/business/Sidebar/connection-list/MssqlFormSection.tsx` | Create | Auth mode, username/password, AAD token fields |
| `src/components/business/Sidebar/connection-list/ConnectionDialog.tsx` | Modify | Remove extracted sections, use `useFormField`, import driver sections |

---

### Task 1: Create `useFormField` hook

**Files:**
- Create: `src/lib/connection-form/use-form-field.ts`

- [ ] **Step 1: Create the hook file**

```ts
import type { Dispatch, SetStateAction } from "react";
import type { ChangeEvent } from "react";
import type { ConnectionForm } from "@/services/api";

export function useFormField<T extends keyof ConnectionForm>(
  form: ConnectionForm,
  setForm: Dispatch<SetStateAction<ConnectionForm>>,
  field: T,
  transformer?: (raw: string) => ConnectionForm[T],
): [ConnectionForm[T], (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void] {
  const value = form[field];
  const onChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const raw = e.target.value;
    setForm((current) => ({
      ...current,
      [field]: transformer ? transformer(raw) : raw,
    }));
  };
  return [value, onChange];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/connection-form/use-form-field.ts`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/connection-form/use-form-field.ts
git commit -m "feat: add useFormField helper for ConnectionForm fields"
```

---

### Task 2: Create `RedisFormSection`

**Files:**
- Create: `src/components/business/Sidebar/connection-list/RedisFormSection.tsx`

- [ ] **Step 1: Create the Redis form section component**

Extract lines 212-403 from `ConnectionDialog.tsx` (the `isRedis` block) into a standalone component. Use `useFormField` for simple string fields. Keep custom handlers for `mode` select and `seedNodes`/`sentinels` textarea.

```tsx
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getDefaultPort } from "@/lib/driver-registry";
import {
  formatRedisNodeList,
  getRedisConnectionMode,
  normalizeRedisNodeListInput,
} from "@/lib/connection-form/rules";
import { useFormField } from "@/lib/connection-form/use-form-field";
import type { ConnectionForm } from "@/services/api";

interface RedisFormSectionProps {
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
}

export function RedisFormSection({ form, setForm }: RedisFormSectionProps) {
  const { t } = useTranslation();
  const redisMode = getRedisConnectionMode(form);
  const [connectTimeoutMs, onConnectTimeoutMsChange] = useFormField(
    form,
    setForm,
    "connectTimeoutMs",
    (v) => Number(v) || undefined,
  );

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="redisMode">
            {t("connection.dialog.fields.redisMode")}
          </Label>
          <Select
            value={redisMode}
            onValueChange={(
              value: "standalone" | "cluster" | "sentinel",
            ) =>
              setForm((current) => ({
                ...current,
                mode: value,
                host: value === "standalone" ? current.host : "",
                port:
                  value === "standalone"
                    ? current.port || getDefaultPort("redis") || undefined
                    : undefined,
              }))
            }
          >
            <SelectTrigger id="redisMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standalone">
                {t("connection.dialog.redisMode.standalone")}
              </SelectItem>
              <SelectItem value="cluster">
                {t("connection.dialog.redisMode.cluster")}
              </SelectItem>
              <SelectItem value="sentinel">
                {t("connection.dialog.redisMode.sentinel")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="connectTimeoutMs">
            {t("connection.dialog.fields.connectTimeoutMs")}
          </Label>
          <Input
            id="connectTimeoutMs"
            placeholder="5000"
            value={String(connectTimeoutMs || "")}
            onChange={onConnectTimeoutMsChange}
          />
        </div>
      </div>
      {redisMode === "standalone" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="host">
              {t("connection.dialog.fields.host")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Input
              id="host"
              placeholder="127.0.0.1"
              value={form.host || ""}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  host: e.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="port">
              {t("connection.dialog.fields.port")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Input
              id="port"
              placeholder={String(getDefaultPort("redis") ?? "")}
              value={String(form.port || "")}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  port: Number(e.target.value) || undefined,
                }))
              }
            />
          </div>
        </div>
      ) : null}
      {redisMode === "cluster" ? (
        <div className="grid gap-2">
          <Label htmlFor="seedNodes">
            {t("connection.dialog.fields.seedNodes")}{" "}
            <span className="text-red-600">*</span>
          </Label>
          <Textarea
            id="seedNodes"
            rows={4}
            placeholder={t("connection.dialog.placeholders.seedNodes")}
            value={formatRedisNodeList(form.seedNodes)}
            onChange={(e) =>
              setForm((current) => ({
                ...current,
                seedNodes: normalizeRedisNodeListInput(e.target.value),
              }))
            }
          />
        </div>
      ) : null}
      {redisMode === "sentinel" ? (
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="sentinels">
              {t("connection.dialog.fields.sentinels")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Textarea
              id="sentinels"
              rows={4}
              placeholder={t("connection.dialog.placeholders.sentinels")}
              value={formatRedisNodeList(form.sentinels)}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  sentinels: normalizeRedisNodeListInput(e.target.value),
                }))
              }
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="serviceName">
                {t("connection.dialog.fields.serviceName")}
              </Label>
              <Input
                id="serviceName"
                placeholder={t("connection.dialog.placeholders.serviceName")}
                value={form.serviceName || ""}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    serviceName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sentinelPassword">
                {t("connection.dialog.fields.sentinelPassword")}
              </Label>
              <Input
                id="sentinelPassword"
                type="password"
                placeholder={t(
                  "connection.dialog.placeholders.sentinelPassword",
                )}
                value={form.sentinelPassword || ""}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    sentinelPassword: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/business/Sidebar/connection-list/RedisFormSection.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/business/Sidebar/connection-list/RedisFormSection.tsx
git commit -m "feat: extract RedisFormSection from ConnectionDialog"
```

---

### Task 3: Create `ElasticsearchFormSection`

**Files:**
- Create: `src/components/business/Sidebar/connection-list/ElasticsearchFormSection.tsx`

- [ ] **Step 1: Create the Elasticsearch form section component**

Extract lines 405-648 from `ConnectionDialog.tsx` (both `isElasticsearch` blocks — cloud ID and auth mode). Use `useFormField` for string fields.

```tsx
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormField } from "@/lib/connection-form/use-form-field";
import type { ConnectionForm } from "@/services/api";

interface ElasticsearchFormSectionProps {
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
  dialogMode: "create" | "edit";
}

export function ElasticsearchFormSection({
  form,
  setForm,
  dialogMode,
}: ElasticsearchFormSectionProps) {
  const { t } = useTranslation();
  const [cloudId, onCloudIdChange] = useFormField(form, setForm, "cloudId");
  const [authMode, onAuthModeChange] = useFormField(
    form,
    setForm,
    "authMode",
    (v) => v as "none" | "basic" | "api_key",
  );
  const [username, onUsernameChange] = useFormField(form, setForm, "username");
  const [password, onPasswordChange] = useFormField(form, setForm, "password");
  const [apiKeyEncoded, onApiKeyEncodedChange] = useFormField(
    form,
    setForm,
    "apiKeyEncoded",
  );
  const [apiKeyId, onApiKeyIdChange] = useFormField(form, setForm, "apiKeyId");
  const [apiKeySecret, onApiKeySecretChange] = useFormField(
    form,
    setForm,
    "apiKeySecret",
  );

  return (
    <>
      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <div className="grid gap-2">
          <Label htmlFor="cloudId">
            {t("connection.dialog.fields.cloudId")}
          </Label>
          <Input
            id="cloudId"
            placeholder={t("connection.dialog.placeholders.cloudId")}
            value={cloudId || ""}
            onChange={onCloudIdChange}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-md border bg-muted/20 p-3">
        <div className="grid gap-2">
          <Label htmlFor="authMode">
            {t("connection.dialog.fields.authMode")}
          </Label>
          <Select
            value={authMode || "none"}
            onValueChange={(v) =>
              setForm((current) => ({
                ...current,
                authMode: v as "none" | "basic" | "api_key",
              }))
            }
          >
            <SelectTrigger id="authMode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {t("connection.dialog.authMode.none")}
              </SelectItem>
              <SelectItem value="basic">
                {t("connection.dialog.authMode.basic")}
              </SelectItem>
              <SelectItem value="api_key">
                {t("connection.dialog.authMode.apiKey")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {authMode === "basic" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="username">
                {t("connection.dialog.fields.username")}{" "}
                <span className="text-red-600">*</span>
              </Label>
              <Input
                id="username"
                value={username || ""}
                onChange={onUsernameChange}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">
                {t("connection.dialog.fields.password")}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={
                  dialogMode === "edit"
                    ? t("connection.dialog.placeholders.keepPassword")
                    : undefined
                }
                value={password || ""}
                onChange={onPasswordChange}
              />
            </div>
          </div>
        ) : null}
        {authMode === "api_key" ? (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="apiKeyEncoded">
                {t("connection.dialog.fields.apiKeyEncoded")}
              </Label>
              <Input
                id="apiKeyEncoded"
                type="password"
                placeholder={
                  dialogMode === "edit"
                    ? t("connection.dialog.placeholders.keepApiKey")
                    : undefined
                }
                value={apiKeyEncoded || ""}
                onChange={onApiKeyEncodedChange}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="apiKeyId">
                  {t("connection.dialog.fields.apiKeyId")}
                </Label>
                <Input
                  id="apiKeyId"
                  value={apiKeyId || ""}
                  onChange={onApiKeyIdChange}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="apiKeySecret">
                  {t("connection.dialog.fields.apiKeySecret")}
                </Label>
                <Input
                  id="apiKeySecret"
                  type="password"
                  placeholder={
                    dialogMode === "edit"
                      ? t("connection.dialog.placeholders.keepApiKey")
                      : undefined
                  }
                  value={apiKeySecret || ""}
                  onChange={onApiKeySecretChange}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/business/Sidebar/connection-list/ElasticsearchFormSection.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/business/Sidebar/connection-list/ElasticsearchFormSection.tsx
git commit -m "feat: extract ElasticsearchFormSection from ConnectionDialog"
```

---

### Task 4: Create `MongoDbFormSection`

**Files:**
- Create: `src/components/business/Sidebar/connection-list/MongoDbFormSection.tsx`

- [ ] **Step 1: Create the MongoDB form section component**

Extract lines 428-449 from `ConnectionDialog.tsx` (the `form.driver === "mongodb"` block).

```tsx
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useFormField } from "@/lib/connection-form/use-form-field";
import type { ConnectionForm } from "@/services/api";

interface MongoDbFormSectionProps {
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
}

export function MongoDbFormSection({ form, setForm }: MongoDbFormSectionProps) {
  const { t } = useTranslation();
  const [authSource, onAuthSourceChange] = useFormField(
    form,
    setForm,
    "authSource",
  );

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2">
        <Label htmlFor="authSource">
          {t("connection.dialog.fields.authSource")}
        </Label>
        <Input
          id="authSource"
          placeholder={t("connection.dialog.placeholders.authSource")}
          value={authSource || ""}
          onChange={onAuthSourceChange}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/business/Sidebar/connection-list/MongoDbFormSection.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/business/Sidebar/connection-list/MongoDbFormSection.tsx
git commit -m "feat: extract MongoDbFormSection from ConnectionDialog"
```

---

### Task 5: Create `MssqlFormSection`

**Files:**
- Create: `src/components/business/Sidebar/connection-list/MssqlFormSection.tsx`

- [ ] **Step 1: Create the MSSQL form section component**

Extract lines 650-775 from `ConnectionDialog.tsx` (the `isMssql` block). Use `useFormField` for string fields.

```tsx
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFormField } from "@/lib/connection-form/use-form-field";
import type { ConnectionForm } from "@/services/api";

interface MssqlFormSectionProps {
  form: ConnectionForm;
  setForm: Dispatch<SetStateAction<ConnectionForm>>;
  dialogMode: "create" | "edit";
}

export function MssqlFormSection({
  form,
  setForm,
  dialogMode,
}: MssqlFormSectionProps) {
  const { t } = useTranslation();
  const [username, onUsernameChange] = useFormField(form, setForm, "username");
  const [password, onPasswordChange] = useFormField(form, setForm, "password");

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="grid gap-2">
        <Label htmlFor="authMode">
          {t("connection.dialog.fields.authMode")}
        </Label>
        <Select
          value={form.authMode || "sql_server"}
          onValueChange={(
            value:
              | "sql_server"
              | "windows"
              | "integrated"
              | "aad_token",
          ) =>
            setForm((current) => ({
              ...current,
              authMode: value,
              username:
                value === "integrated" || value === "aad_token"
                  ? ""
                  : current.username,
              password: value === "integrated" ? "" : current.password,
            }))
          }
        >
          <SelectTrigger id="authMode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sql_server">
              {t("connection.dialog.authMode.sqlServer")}
            </SelectItem>
            <SelectItem value="windows">
              {t("connection.dialog.authMode.windows")}
            </SelectItem>
            <SelectItem value="integrated">
              {t("connection.dialog.authMode.integrated")}
            </SelectItem>
            <SelectItem value="aad_token">
              {t("connection.dialog.authMode.aadToken")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(form.authMode === "sql_server" || form.authMode === "windows") && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="username">
              {t("connection.dialog.fields.username")}{" "}
              <span className="text-red-600">*</span>
            </Label>
            <Input
              id="username"
              value={username || ""}
              onChange={onUsernameChange}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">
              {t("connection.dialog.fields.password")}{" "}
              {dialogMode === "create" ? (
                <span className="text-red-600">*</span>
              ) : null}
            </Label>
            <Input
              id="password"
              type="password"
              placeholder={
                dialogMode === "edit"
                  ? t("connection.dialog.placeholders.keepPassword")
                  : undefined
              }
              value={password || ""}
              onChange={onPasswordChange}
            />
          </div>
        </div>
      )}
      {form.authMode === "aad_token" && (
        <div className="grid gap-2">
          <Label htmlFor="password">
            {t("connection.dialog.fields.aadToken")}{" "}
            {dialogMode === "create" ? (
              <span className="text-red-600">*</span>
            ) : null}
          </Label>
          <Input
            id="password"
            type="password"
            placeholder={
              dialogMode === "edit"
                ? t("connection.dialog.placeholders.keepPassword")
                : undefined
            }
            value={password || ""}
            onChange={onPasswordChange}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/business/Sidebar/connection-list/MssqlFormSection.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/business/Sidebar/connection-list/MssqlFormSection.tsx
git commit -m "feat: extract MssqlFormSection from ConnectionDialog"
```

---

### Task 6: Refactor `ConnectionDialog` to use extracted components

**Files:**
- Modify: `src/components/business/Sidebar/connection-list/ConnectionDialog.tsx`

- [ ] **Step 1: Replace driver sections with component imports**

At the top of `ConnectionDialog.tsx`, add imports:

```tsx
import { RedisFormSection } from "./RedisFormSection";
import { ElasticsearchFormSection } from "./ElasticsearchFormSection";
import { MongoDbFormSection } from "./MongoDbFormSection";
import { MssqlFormSection } from "./MssqlFormSection";
```

Then replace the inline Redis block (lines 212-403) with:

```tsx
{isRedis && (
  <RedisFormSection form={form} setForm={setForm} />
)}
```

Replace the two inline Elasticsearch blocks (lines 405-426 and 504-648) with:

```tsx
{isElasticsearch && (
  <ElasticsearchFormSection
    form={form}
    setForm={setForm}
    dialogMode={dialogMode}
  />
)}
```

Replace the inline MongoDB block (lines 428-449) with:

```tsx
{form.driver === "mongodb" && (
  <MongoDbFormSection form={form} setForm={setForm} />
)}
```

Replace the inline MSSQL block (lines 650-775) with:

```tsx
{isMssql && (
  <MssqlFormSection
    form={form}
    setForm={setForm}
    dialogMode={dialogMode}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/business/Sidebar/connection-list/ConnectionDialog.tsx`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/business/Sidebar/connection-list/ConnectionDialog.tsx
git commit -m "refactor: replace inline driver sections with extracted components"
```

---

### Task 7: Apply `useFormField` to remaining generic fields in `ConnectionDialog`

**Files:**
- Modify: `src/components/business/Sidebar/connection-list/ConnectionDialog.tsx`

- [ ] **Step 1: Import `useFormField` and refactor generic fields**

Add import:

```tsx
import { useFormField } from "@/lib/connection-form/use-form-field";
```

Then inside the `ConnectionDialog` component, add field hooks for the generic fields. Replace the repeated `setForm` patterns for: `name`, `host`, `port`, `username`, `password`, `database`, `schema`, `sshHost`, `sshPort`, `sshUsername`, `sshPassword`, `sshKeyPath`, `filePath`.

Example — replace:

```tsx
<Input
  id="name"
  value={form.name || ""}
  onChange={(e) =>
    setForm((current) => ({
      ...current,
      name: e.target.value,
    }))
  }
/>
```

With:

```tsx
const [name, onNameChange] = useFormField(form, setForm, "name");
// ...
<Input id="name" value={name || ""} onChange={onNameChange} />
```

Repeat for all generic string fields. For numeric fields like `port` and `sshPort`, use the `Number` transformer:

```tsx
const [port, onPortChange] = useFormField(form, setForm, "port", (v) => Number(v) || undefined);
```

Keep checkboxes (`ssl`, `sshEnabled`) as inline handlers since they use `onCheckedChange`.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/components/business/Sidebar/connection-list/ConnectionDialog.tsx`
Expected: No errors

- [ ] **Step 3: Verify line count dropped**

Run: `wc -l src/components/business/Sidebar/connection-list/ConnectionDialog.tsx`
Expected: ~400-450 lines (down from 1234)

- [ ] **Step 4: Commit**

```bash
git add src/components/business/Sidebar/connection-list/ConnectionDialog.tsx
git commit -m "refactor: apply useFormField to generic fields in ConnectionDialog"
```

---

### Task 8: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check on the entire project**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run linter if configured**

Run: `npm run lint` (or project's lint command)
Expected: No new errors

- [ ] **Step 3: Verify no regressions in file sizes**

Run: `wc -l src/components/business/Sidebar/connection-list/ConnectionDialog.tsx src/components/business/Sidebar/connection-list/RedisFormSection.tsx src/components/business/Sidebar/connection-list/ElasticsearchFormSection.tsx src/components/business/Sidebar/connection-list/MongoDbFormSection.tsx src/components/business/Sidebar/connection-list/MssqlFormSection.tsx src/lib/connection-form/use-form-field.ts`
Expected: ConnectionDialog ~400-450, driver sections 20-150 each, useFormField ~20

- [ ] **Step 4: Commit all remaining changes if any**

```bash
git add -A && git commit -m "chore: connection dialog refactor complete"
```
