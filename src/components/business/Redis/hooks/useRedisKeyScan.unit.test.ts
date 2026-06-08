import { mock } from "bun:test";

const scanKeysMock = mock(() =>
  Promise.resolve({ cursor: "0", keys: [], isPartial: false }),
);
const listDatabasesMock = mock(() =>
  Promise.resolve([{ name: "db0" }, { name: "db1" }]),
);

mock.module("@/services/api", () => ({
  api: {
    redis: {
      scanKeys: scanKeysMock,
      listDatabases: listDatabasesMock,
    },
  },
}));

mock.module("@/lib/errors", () => ({
  handleApiError: mock(),
}));

const mockT = (s: string) => s;
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

import { describe, test, expect } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { RedisKeyInfo, RedisScanResponse } from "@/services/api";
import { useRedisKeyScan } from "./useRedisKeyScan";

function makeKey(key: string, keyType = "string", ttl = -1): RedisKeyInfo {
  return { key, keyType, ttl };
}

function scanResponse(
  keys: RedisKeyInfo[],
  cursor = "0",
  isPartial = false,
): RedisScanResponse {
  return { cursor, keys, isPartial };
}

describe("useRedisKeyScan", () => {
  test("scans keys on mount for standalone databases", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }, { name: "db1" }]);
    const keys = [makeKey("user:1"), makeKey("user:2")];
    scanKeysMock.mockResolvedValue(scanResponse(keys));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(listDatabasesMock).toHaveBeenCalledWith(1);
    expect(scanKeysMock).toHaveBeenCalledWith({
      id: 1,
      database: "0",
      cursor: "0",
      pattern: undefined,
      limit: 200,
    });
    expect(result.current.keys).toEqual(keys);
    expect(result.current.isClusterMode).toBe(false);
  });

  test("does NOT scan on mount for cluster mode", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }]);
    scanKeysMock.mockResolvedValue(scanResponse([]));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    // The hook fires useEffect -> init() -> listDatabases -> setIsClusterMode(true)
    // This causes scan to change -> useEffect re-fires.
    // Need to flush multiple effect cycles.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.isClusterMode).toBe(true);
    expect(result.current.requiresPattern).toBe(true);
    expect(result.current.keys).toEqual([]);
  });

  test("cluster mode: empty scan does not call API", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }]);
    scanKeysMock.mockResolvedValue(scanResponse([]));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.isClusterMode).toBe(true);

    const callsBefore = scanKeysMock.mock.calls.length;

    await act(async () => {
      await result.current.scan("", "0", false);
    });

    expect(scanKeysMock.mock.calls.length).toBe(callsBefore);
    expect(result.current.requiresPattern).toBe(true);
    expect(result.current.keys).toEqual([]);
  });

  test("cluster mode: scan with pattern calls API", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }]);
    const keys = [makeKey("cache:1")];
    scanKeysMock.mockResolvedValue(scanResponse(keys));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.isClusterMode).toBe(true);

    await act(async () => {
      await result.current.scan("cache:*", "0", false);
    });

    expect(scanKeysMock).toHaveBeenCalledWith({
      id: 1,
      database: "0",
      cursor: "0",
      pattern: "cache:*",
      limit: 200,
    });
    expect(result.current.keys).toEqual(keys);
    expect(result.current.requiresPattern).toBe(false);
  });

  test("handleSearch scans with current pattern", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }, { name: "db1" }]);
    scanKeysMock.mockResolvedValue(scanResponse([]));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    scanKeysMock.mockResolvedValue(scanResponse([makeKey("k2")]));

    act(() => result.current.setPattern("k*"));

    await act(async () => {
      result.current.handleSearch();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(scanKeysMock).toHaveBeenCalledWith({
      id: 1,
      database: "0",
      cursor: "0",
      pattern: "k*",
      limit: 200,
    });
    expect(result.current.keys).toEqual([makeKey("k2")]);
  });

  test("handleLoadMore appends keys from next cursor", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }, { name: "db1" }]);
    const page1 = [makeKey("a")];
    scanKeysMock.mockResolvedValue(scanResponse(page1, "42", true));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.cursor).toBe("42");
    expect(result.current.isPartial).toBe(true);
    expect(result.current.keys).toEqual(page1);

    // Update mock for load-more call
    scanKeysMock.mockResolvedValue(scanResponse([makeKey("b")], "0", false));

    await act(async () => {
      result.current.handleLoadMore();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.keys).toEqual([makeKey("a"), makeKey("b")]);
  });

  test("setKeys allows external updates", async () => {
    listDatabasesMock.mockResolvedValue([{ name: "db0" }, { name: "db1" }]);
    scanKeysMock.mockResolvedValue(scanResponse([]));

    const { result } = renderHook(() =>
      useRedisKeyScan({ connectionId: 1, database: "0" }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setKeys([makeKey("external")]));

    expect(result.current.keys).toEqual([makeKey("external")]);
  });
});
