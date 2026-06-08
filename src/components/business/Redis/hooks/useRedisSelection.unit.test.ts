import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { RedisKeyInfo } from "@/services/api";
import { useRedisSelection } from "./useRedisSelection";

function makeKeys(...names: string[]): RedisKeyInfo[] {
  return names.map((key) => ({ key, keyType: "string", ttl: -1 }));
}

function mouseEvent(shiftKey = false): React.MouseEvent {
  return { shiftKey } as unknown as React.MouseEvent;
}

describe("useRedisSelection", () => {
  describe("single click without existing selection", () => {
    test("opens detail view for the clicked key", () => {
      const keys = makeKeys("a", "b", "c");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      act(() => result.current.handleSelectKey("b", 1, mouseEvent()));

      expect(result.current.detail).toEqual({ mode: "view", key: "b" });
      expect(result.current.selectedKeys.size).toBe(0);
    });
  });

  describe("single click with existing selection", () => {
    test("toggles key in selection set", () => {
      const keys = makeKeys("a", "b", "c");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      // First click selects into set (because selectedKeys.size > 0 after selectAll)
      act(() => result.current.selectAll());
      expect(result.current.selectedKeys.size).toBe(3);

      act(() => result.current.handleSelectKey("b", 1, mouseEvent()));
      expect(result.current.selectedKeys.has("b")).toBe(false);
      expect(result.current.selectedKeys.size).toBe(2);

      // Click again to re-add
      act(() => result.current.handleSelectKey("b", 1, mouseEvent()));
      expect(result.current.selectedKeys.has("b")).toBe(true);
      expect(result.current.selectedKeys.size).toBe(3);
    });
  });

  describe("shift range selection", () => {
    test("selects range from lastClickedIndex to current index", () => {
      const keys = makeKeys("a", "b", "c", "d", "e");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      // Need selectedKeys.size > 0 to enter multi-select branch
      act(() => result.current.selectAll());
      act(() => result.current.clearSelection());
      // Add one key so size > 0
      act(() => result.current.setSelectedKeys(new Set(["a"])));

      // Click key "b" to set anchor (toggles "b" into set since size > 0)
      act(() => result.current.handleSelectKey("b", 1, mouseEvent()));
      expect(result.current.selectedKeys).toEqual(new Set(["a", "b"]));

      // Shift-click key at index 3 ("d") — adds range [1..3] = b,c,d
      act(() => result.current.handleSelectKey("d", 3, mouseEvent(true)));
      expect(result.current.selectedKeys).toEqual(new Set(["a", "b", "c", "d"]));
    });

    test("works when shift-clicking backwards", () => {
      const keys = makeKeys("a", "b", "c", "d", "e");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      // Seed selection so size > 0
      act(() => result.current.setSelectedKeys(new Set(["e"])));

      // Click at index 3 ("d") to set anchor
      act(() => result.current.handleSelectKey("d", 3, mouseEvent()));
      expect(result.current.selectedKeys).toEqual(new Set(["d", "e"]));

      // Shift-click at index 1 ("b") — range [1..3] = b,c,d
      act(() => result.current.handleSelectKey("b", 1, mouseEvent(true)));
      expect(result.current.selectedKeys).toEqual(new Set(["b", "c", "d", "e"]));
    });
  });

  describe("keys change prunes selection", () => {
    test("removes selected keys that are no longer in keys list", () => {
      const keys = makeKeys("a", "b", "c");
      const { result, rerender } = renderHook(
        ({ keys }) =>
          useRedisSelection({ keys, onScanRefresh: () => {} }),
        { initialProps: { keys } },
      );

      act(() => result.current.selectAll());
      expect(result.current.selectedKeys).toEqual(new Set(["a", "b", "c"]));

      // Simulate keys change — "b" is gone
      const newKeys = makeKeys("a", "c", "d");
      rerender({ keys: newKeys });

      expect(result.current.selectedKeys).toEqual(new Set(["a", "c"]));
    });

    test("does not change set when all selected keys still exist", () => {
      const keys = makeKeys("a", "b");
      const { result, rerender } = renderHook(
        ({ keys }) =>
          useRedisSelection({ keys, onScanRefresh: () => {} }),
        { initialProps: { keys } },
      );

      act(() => result.current.selectAll());
      const prevSet = result.current.selectedKeys;

      // Same keys, different reference
      rerender({ keys: makeKeys("a", "b") });

      // Should return the same Set reference (optimization)
      expect(result.current.selectedKeys).toBe(prevSet);
    });
  });

  describe("clearSelection", () => {
    test("clears selectedKeys and lastClickedIndex", () => {
      const keys = makeKeys("a", "b", "c");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      act(() => result.current.selectAll());
      act(() => result.current.handleSelectKey("b", 1, mouseEvent()));
      expect(result.current.selectedKeys.size).toBeGreaterThan(0);

      act(() => result.current.clearSelection());
      expect(result.current.selectedKeys.size).toBe(0);
      expect(result.current.lastClickedIndex).toBeNull();
    });
  });

  describe("selectAll", () => {
    test("selects all keys", () => {
      const keys = makeKeys("x", "y", "z");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      act(() => result.current.selectAll());
      expect(result.current.selectedKeys).toEqual(new Set(["x", "y", "z"]));
    });
  });

  describe("handleNewKey", () => {
    test("sets detail to new mode", () => {
      const keys = makeKeys("a");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      act(() => result.current.handleNewKey());
      expect(result.current.detail).toEqual({ mode: "new" });
    });
  });

  describe("handleKeySaved", () => {
    test("transitions from new to view mode", () => {
      const keys = makeKeys("a");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      act(() => result.current.handleNewKey());
      act(() => result.current.handleKeySaved("mykey"));
      expect(result.current.detail).toEqual({ mode: "view", key: "mykey" });
    });

    test("updates key when renamed in view mode", () => {
      const keys = makeKeys("a");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      act(() => result.current.handleSelectKey("a", 0, mouseEvent()));
      act(() => result.current.handleKeySaved("renamed"));
      expect(result.current.detail).toEqual({ mode: "view", key: "renamed" });
    });

    test("calls onScanRefresh", () => {
      let called = false;
      const spy = () => {
        called = true;
      };
      const keys = makeKeys("a");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: spy }),
      );

      act(() => result.current.handleKeySaved("k"));
      expect(called).toBe(true);
    });
  });

  describe("handleKeyDeleted", () => {
    test("resets detail to none and calls onScanRefresh", () => {
      let refreshed = false;
      const keys = makeKeys("a");
      const { result } = renderHook(() =>
        useRedisSelection({
          keys,
          onScanRefresh: () => {
            refreshed = true;
          },
        }),
      );

      act(() => result.current.handleSelectKey("a", 0, mouseEvent()));
      expect(result.current.detail).toEqual({ mode: "view", key: "a" });

      act(() => result.current.handleKeyDeleted());
      expect(result.current.detail).toEqual({ mode: "none" });
      expect(refreshed).toBe(true);
    });
  });

  describe("derived values", () => {
    test("selectedKey returns key from detail in view mode", () => {
      const keys = makeKeys("a");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      expect(result.current.selectedKey).toBeNull();

      act(() => result.current.handleSelectKey("a", 0, mouseEvent()));
      expect(result.current.selectedKey).toBe("a");
    });

    test("selectedCount reflects selectedKeys size", () => {
      const keys = makeKeys("a", "b");
      const { result } = renderHook(() =>
        useRedisSelection({ keys, onScanRefresh: () => {} }),
      );

      expect(result.current.selectedCount).toBe(0);

      act(() => result.current.selectAll());
      expect(result.current.selectedCount).toBe(2);
    });
  });
});
