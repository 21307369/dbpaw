import type { RedisKeyPatchPayload, RedisValue } from "@/services/api";

export function mergeValues(base: RedisValue, next: RedisValue): RedisValue {
  if (base.kind !== next.kind) return base;
  if (base.kind === "list" && next.kind === "list") {
    return { kind: "list", value: [...base.value, ...next.value] };
  }
  if (base.kind === "set" && next.kind === "set") {
    const merged = [
      ...base.value,
      ...next.value.filter((m) => !base.value.includes(m)),
    ];
    return { kind: "set", value: merged };
  }
  if (base.kind === "zSet" && next.kind === "zSet") {
    const existingMembers = new Set(base.value.map((m) => m.member));
    const added = next.value.filter((m) => !existingMembers.has(m.member));
    return { kind: "zSet", value: [...base.value, ...added] };
  }
  if (base.kind === "hash" && next.kind === "hash") {
    return { kind: "hash", value: { ...base.value, ...next.value } };
  }
  if (base.kind === "stream" && next.kind === "stream") {
    const existingIds = new Set(base.value.map((e) => e.id));
    const added = next.value.filter((e) => !existingIds.has(e.id));
    return { kind: "stream", value: [...base.value, ...added] };
  }
  return base;
}

export function isValueUnchanged(a: RedisValue, b: RedisValue): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getJsonValidationError(value: RedisValue): string | null {
  if (value.kind !== "json") return null;
  try {
    JSON.parse(value.value);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid JSON";
  }
}

export function buildPatch(
  key: string,
  ttlSeconds: number | null,
  original: RedisValue,
  current: RedisValue,
  originalLoadedCount: number,
): RedisKeyPatchPayload {
  const patch: RedisKeyPatchPayload = { key, ttlSeconds };

  if (current.kind === "hash" && original.kind === "hash") {
    const hashSet: Record<string, string> = {};
    const hashDel: string[] = [];
    for (const [k, v] of Object.entries(current.value)) {
      if (original.value[k] !== v) hashSet[k] = v;
    }
    for (const k of Object.keys(original.value)) {
      if (!(k in current.value)) hashDel.push(k);
    }
    if (Object.keys(hashSet).length > 0) patch.hashSet = hashSet;
    if (hashDel.length > 0) patch.hashDel = hashDel;
    return patch;
  }

  if (current.kind === "set" && original.kind === "set") {
    const origSet = new Set(original.value);
    const currSet = new Set(current.value);
    const setAdd = current.value.filter((m) => !origSet.has(m));
    const setRem = original.value.filter((m) => !currSet.has(m));
    if (setAdd.length > 0) patch.setAdd = setAdd;
    if (setRem.length > 0) patch.setRem = setRem;
    return patch;
  }

  if (current.kind === "zSet" && original.kind === "zSet") {
    const origMap = new Map(original.value.map((m) => [m.member, m.score]));
    const currMap = new Map(current.value.map((m) => [m.member, m.score]));
    const zsetAdd = current.value.filter(
      (m) => !origMap.has(m.member) || origMap.get(m.member) !== m.score,
    );
    const zsetRem = original.value
      .filter((m) => !currMap.has(m.member))
      .map((m) => m.member);
    if (zsetAdd.length > 0) patch.zsetAdd = zsetAdd;
    if (zsetRem.length > 0) patch.zsetRem = zsetRem;
    return patch;
  }

  if (current.kind === "list" && original.kind === "list") {
    const curr = current.value;
    const orig = original.value;

    const modifications: { index: number; value: string }[] = [];
    for (let i = 0; i < Math.min(originalLoadedCount, curr.length); i++) {
      if (curr[i] !== orig[i]) {
        modifications.push({ index: i, value: curr[i] });
      }
    }

    const hasDeletions = curr.length < originalLoadedCount;
    const hasAppends = curr.length > originalLoadedCount;

    let hasPrepends = false;
    if (curr.length > originalLoadedCount && modifications.length === 0) {
      const tail = curr.slice(curr.length - originalLoadedCount);
      if (
        JSON.stringify(tail) ===
        JSON.stringify(orig.slice(0, originalLoadedCount))
      ) {
        hasPrepends = true;
      }
    }

    let pureAppend = false;
    if (curr.length > originalLoadedCount && modifications.length === 0) {
      const head = curr.slice(0, originalLoadedCount);
      if (
        JSON.stringify(head) ===
        JSON.stringify(orig.slice(0, originalLoadedCount))
      ) {
        pureAppend = true;
      }
    }

    if (!hasDeletions && modifications.length === 0 && pureAppend) {
      patch.listRpush = curr.slice(originalLoadedCount);
      return patch;
    }

    if (!hasDeletions && modifications.length === 0 && hasPrepends) {
      patch.listLpush = curr.slice(0, curr.length - originalLoadedCount);
      return patch;
    }

    if (!hasDeletions && !hasAppends && modifications.length > 0) {
      patch.listSet = modifications;
      return patch;
    }

    if (hasDeletions && modifications.length === 0 && !hasAppends) {
      const deleted = orig.slice(curr.length);
      if (deleted.length > 0) patch.listRem = deleted;
      return patch;
    }

    throw new Error(
      "Mixed list operations in partial-load mode are not supported. " +
        'Use "Load more" to load all items first, then save.',
    );
  }

  if (current.kind === "stream" && original.kind === "stream") {
    const origIds = new Set(original.value.map((e) => e.id));
    const currIds = new Set(current.value.map((e) => e.id));
    const streamAdd = current.value.filter((e) => !origIds.has(e.id));
    const streamDel = original.value
      .filter((e) => !currIds.has(e.id))
      .map((e) => e.id);
    if (streamAdd.length > 0) patch.streamAdd = streamAdd;
    if (streamDel.length > 0) patch.streamDel = streamDel;
    return patch;
  }

  return patch;
}
