import type {
  RedisKeyExtra,
  RedisStreamEntry,
  RedisStreamGroup,
  RedisStreamView,
} from "@/services/api";

export const DEFAULT_PAGE_SIZE = 200;

export interface StreamBrowserState {
  startIdInput: string;
  endIdInput: string;
  countInput: string;
  appliedStartId: string;
  appliedEndId: string;
  pageSize: number;
  nextStartId: string | null;
  totalLen: number | null;
  streamInfo: RedisKeyExtra["streamInfo"];
  groups: RedisStreamGroup[];
}

export const createInitialBrowserState = (
  entries: RedisStreamEntry[],
  totalLen?: number | null,
  extra?: RedisKeyExtra | null,
): StreamBrowserState => ({
  startIdInput: "",
  endIdInput: "",
  countInput: String(DEFAULT_PAGE_SIZE),
  appliedStartId: "-",
  appliedEndId: "+",
  pageSize: DEFAULT_PAGE_SIZE,
  nextStartId:
    totalLen !== null &&
    totalLen !== undefined &&
    entries.length < totalLen &&
    entries.length > 0
      ? `(${entries[entries.length - 1].id}`
      : null,
  totalLen: totalLen ?? null,
  streamInfo: extra?.streamInfo ?? null,
  groups: extra?.streamGroups ?? [],
});

export function formatFields(fields: Record<string, string>) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return "{}";
  if (keys.length <= 3) {
    return "{ " + keys.map((key) => `${key}: ${fields[key]}`).join(", ") + " }";
  }
  return `{ ${keys[0]}: ${fields[keys[0]]}, ${keys[1]}: ${fields[keys[1]]}, ... +${keys.length - 2} }`;
}

export function parseFieldsRaw(raw: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  const lines = raw.split(/\n|,/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return null;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!key) return null;
    result[key] = value;
  }
  return result;
}

export function resolvePageSize(raw: string) {
  const parsed = Number(raw.trim() || String(DEFAULT_PAGE_SIZE));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error("Count must be an integer between 1 and 1000");
  }
  return parsed;
}

export function mapViewResultToBrowserState(
  result: RedisStreamView,
  current: StreamBrowserState,
): StreamBrowserState {
  return {
    ...current,
    appliedStartId: result.startId,
    appliedEndId: result.endId,
    pageSize: result.count,
    nextStartId: result.nextStartId ?? null,
    totalLen: result.totalLen,
    streamInfo: result.streamInfo ?? null,
    groups: result.groups,
  };
}

export function formatIdleMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}
