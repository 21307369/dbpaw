import { mock } from "bun:test";

const batchKeyOpsMock = mock(() => Promise.resolve([]));
const mgetMock = mock(() => Promise.resolve([]));
const msetMock = mock(() => Promise.resolve({ success: true, affected: 0 }));

mock.module("@/services/api", () => ({
  api: {
    redis: {
      batchKeyOps: batchKeyOpsMock,
      mget: mgetMock,
      mset: msetMock,
    },
  },
}));

const handleApiErrorMock = mock();
mock.module("@/lib/errors", () => ({
  handleApiError: handleApiErrorMock,
}));

const toastSuccessMock = mock();
const toastErrorMock = mock();
mock.module("sonner", () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

const mockT = (s: string) => s;
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

import { describe, test, expect, beforeEach } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRedisBatchOps } from "./useRedisBatchOps";

describe("useRedisBatchOps", () => {
  const defaults = {
    connectionId: 1,
    database: "0",
    selectedKeys: new Set<string>(["k1", "k2"]),
    onScanRefresh: () => {},
    onKeysDeleted: () => {},
  };

  beforeEach(() => {
    batchKeyOpsMock.mockReset();
    mgetMock.mockReset();
    msetMock.mockReset();
    handleApiErrorMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    batchKeyOpsMock.mockResolvedValue([
      { key: "k1", op: "del", success: true, affected: 1 },
      { key: "k2", op: "del", success: true, affected: 1 },
    ]);
  });

  describe("runBatchOp", () => {
    test("does nothing when selectedKeys is empty", async () => {
      const { result } = renderHook(() =>
        useRedisBatchOps({ ...defaults, selectedKeys: new Set() }),
      );

      await act(async () => {
        await result.current.runBatchOp("del");
      });

      expect(batchKeyOpsMock).not.toHaveBeenCalled();
    });

    test("calls batchKeyOps and shows success toast", async () => {
      const { result } = renderHook(() => useRedisBatchOps(defaults));

      await act(async () => {
        await result.current.runBatchOp("del");
      });

      expect(batchKeyOpsMock).toHaveBeenCalledWith(1, "0", [
        { op: "del", key: "k1", ttlSeconds: undefined },
        { op: "del", key: "k2", ttlSeconds: undefined },
      ]);
      expect(toastSuccessMock).toHaveBeenCalledWith("Batch DEL: 2 key(s)");
    });

    test("calls onKeysDeleted and onScanRefresh for del op", async () => {
      let deletedCalled = false;
      let refreshCalled = false;
      const { result } = renderHook(() =>
        useRedisBatchOps({
          ...defaults,
          onKeysDeleted: () => {
            deletedCalled = true;
          },
          onScanRefresh: () => {
            refreshCalled = true;
          },
        }),
      );

      await act(async () => {
        await result.current.runBatchOp("del");
      });

      expect(deletedCalled).toBe(true);
      expect(refreshCalled).toBe(true);
    });

    test("calls onKeysDeleted and onScanRefresh for unlink op", async () => {
      let deletedCalled = false;
      let refreshCalled = false;
      const { result } = renderHook(() =>
        useRedisBatchOps({
          ...defaults,
          onKeysDeleted: () => {
            deletedCalled = true;
          },
          onScanRefresh: () => {
            refreshCalled = true;
          },
        }),
      );

      await act(async () => {
        await result.current.runBatchOp("unlink");
      });

      expect(deletedCalled).toBe(true);
      expect(refreshCalled).toBe(true);
    });

    test("does NOT call onKeysDeleted for expire op", async () => {
      let deletedCalled = false;
      const { result } = renderHook(() =>
        useRedisBatchOps({
          ...defaults,
          onKeysDeleted: () => {
            deletedCalled = true;
          },
        }),
      );

      await act(async () => {
        await result.current.runBatchOp("expire", 60);
      });

      expect(deletedCalled).toBe(false);
    });

    test("shows error toast for failed operations", async () => {
      batchKeyOpsMock.mockResolvedValueOnce([
        { key: "k1", op: "del", success: true, affected: 1 },
        { key: "k2", op: "del", success: false, affected: 0 },
      ]);

      const { result } = renderHook(() => useRedisBatchOps(defaults));

      await act(async () => {
        await result.current.runBatchOp("del");
      });

      expect(toastErrorMock).toHaveBeenCalledWith(
        "redis.browser.batchKeysFailed",
      );
    });

    test("handles API error", async () => {
      const error = new Error("network");
      batchKeyOpsMock.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useRedisBatchOps(defaults));

      await act(async () => {
        await result.current.runBatchOp("del");
      });

      expect(handleApiErrorMock).toHaveBeenCalledWith(
        "redis.browser.batchOperationFailed",
        error,
      );
    });
  });

  describe("handleMgetExport", () => {
    test("returns null when no keys selected", async () => {
      const { result } = renderHook(() =>
        useRedisBatchOps({ ...defaults, selectedKeys: new Set() }),
      );

      let ret: string | null = "x";
      await act(async () => {
        ret = await result.current.handleMgetExport();
      });

      expect(ret).toBeNull();
      expect(mgetMock).not.toHaveBeenCalled();
    });

    test("returns JSON string of mget entries", async () => {
      const entries = [
        { key: "k1", value: "v1", exists: true },
        { key: "k2", value: null, exists: false },
      ];
      mgetMock.mockResolvedValueOnce(entries);

      const { result } = renderHook(() => useRedisBatchOps(defaults));

      let ret: string | null = null;
      await act(async () => {
        ret = await result.current.handleMgetExport();
      });

      expect(mgetMock).toHaveBeenCalledWith(1, "0", ["k1", "k2"]);
      expect(ret).toBe(JSON.stringify(entries, null, 2));
    });

    test("handles API error and returns null", async () => {
      const error = new Error("fail");
      mgetMock.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useRedisBatchOps(defaults));

      let ret: string | null = "x";
      await act(async () => {
        ret = await result.current.handleMgetExport();
      });

      expect(ret).toBeNull();
      expect(handleApiErrorMock).toHaveBeenCalledWith(
        "redis.browser.mgetFailed",
        error,
      );
    });
  });

  describe("handleMsetImport", () => {
    test("returns false and shows error when parseMsetInput returns null", async () => {
      const { result } = renderHook(() => useRedisBatchOps(defaults));

      let ret = true;
      await act(async () => {
        ret = await result.current.handleMsetImport("");
      });

      expect(ret).toBe(false);
      expect(toastErrorMock).toHaveBeenCalledWith("redis.browser.invalidFormat", {
        description: "Expected JSON object or lines of key:value",
      });
      expect(msetMock).not.toHaveBeenCalled();
    });

    test("calls mset and returns true on success", async () => {
      msetMock.mockResolvedValueOnce({ success: true, affected: 2 });
      let refreshCalled = false;
      const { result } = renderHook(() =>
        useRedisBatchOps({
          ...defaults,
          onScanRefresh: () => {
            refreshCalled = true;
          },
        }),
      );

      let ret = false;
      await act(async () => {
        ret = await result.current.handleMsetImport('{"a":"1","b":"2"}');
      });

      expect(ret).toBe(true);
      expect(msetMock).toHaveBeenCalledWith(1, "0", { a: "1", b: "2" });
      expect(toastSuccessMock).toHaveBeenCalledWith("MSET: 2 key(s) written");
      expect(refreshCalled).toBe(true);
    });

    test("returns false on API error", async () => {
      const error = new Error("fail");
      msetMock.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useRedisBatchOps(defaults));

      let ret = true;
      await act(async () => {
        ret = await result.current.handleMsetImport('{"a":"1"}');
      });

      expect(ret).toBe(false);
      expect(handleApiErrorMock).toHaveBeenCalledWith(
        "redis.browser.msetFailed",
        error,
      );
    });
  });
});
