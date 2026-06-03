import { describe, it, expect } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useTabManager } from "./useTabManager";
import type { TabItem } from "@/App";

function makeTab(id: string, title?: string): TabItem {
  return {
    id,
    type: "editor",
    title: title ?? `Tab ${id}`,
  };
}

describe("useTabManager", () => {
  it("returns empty tabs and empty activeTab by default", () => {
    const { result } = renderHook(() => useTabManager());
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTab).toBe("");
  });

  describe("setTabs / setActiveTab", () => {
    it("setTabs updates the tab list", () => {
      const { result } = renderHook(() => useTabManager());
      const tabs = [makeTab("a"), makeTab("b")];

      act(() => result.current.setTabs(tabs));
      expect(result.current.tabs).toEqual(tabs);
    });

    it("setActiveTab updates the active tab", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setActiveTab("b"));
      expect(result.current.activeTab).toBe("b");
    });
  });

  describe("handleMainTabChange", () => {
    it("sets activeTab to the given tabId", () => {
      const { result } = renderHook(() => useTabManager());
      act(() =>
        result.current.setTabs([makeTab("a"), makeTab("b"), makeTab("c")]),
      );

      act(() => result.current.handleMainTabChange("b"));
      expect(result.current.activeTab).toBe("b");
    });
  });

  describe("handleCycleTabs", () => {
    const tabs = [makeTab("a"), makeTab("b"), makeTab("c")];

    it("cycles forward", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("a"));

      act(() => result.current.handleCycleTabs(1));
      expect(result.current.activeTab).toBe("b");

      act(() => result.current.handleCycleTabs(1));
      expect(result.current.activeTab).toBe("c");
    });

    it("wraps to the beginning when cycling forward from last tab", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("c"));

      act(() => result.current.handleCycleTabs(1));
      expect(result.current.activeTab).toBe("a");
    });

    it("cycles backward", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("c"));

      act(() => result.current.handleCycleTabs(-1));
      expect(result.current.activeTab).toBe("b");
    });

    it("wraps to the end when cycling backward from first tab", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("a"));

      act(() => result.current.handleCycleTabs(-1));
      expect(result.current.activeTab).toBe("c");
    });

    it("does nothing when fewer than 2 tabs", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setTabs([makeTab("only")]));
      act(() => result.current.setActiveTab("only"));

      act(() => result.current.handleCycleTabs(1));
      expect(result.current.activeTab).toBe("only");
    });
  });

  describe("closeTabNow", () => {
    it("removes the tab and switches to the previous tab", () => {
      const { result } = renderHook(() => useTabManager());
      const tabs = [makeTab("a"), makeTab("b"), makeTab("c")];
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("c"));

      act(() => result.current.closeTabNow("c"));
      expect(result.current.tabs).toEqual([makeTab("a"), makeTab("b")]);
      expect(result.current.activeTab).toBe("b");
    });

    it("switches to last remaining tab when closing active tab", () => {
      const { result } = renderHook(() => useTabManager());
      const tabs = [makeTab("a"), makeTab("b")];
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("b"));

      act(() => result.current.closeTabNow("b"));
      expect(result.current.tabs).toEqual([makeTab("a")]);
      expect(result.current.activeTab).toBe("a");
    });

    it("sets activeTab to empty string when closing the last tab", () => {
      const { result } = renderHook(() => useTabManager());
      act(() => result.current.setTabs([makeTab("sole")]));
      act(() => result.current.setActiveTab("sole"));

      act(() => result.current.closeTabNow("sole"));
      expect(result.current.tabs).toEqual([]);
      expect(result.current.activeTab).toBe("");
    });

    it("does not change activeTab when closing a non-active tab", () => {
      const { result } = renderHook(() => useTabManager());
      const tabs = [makeTab("a"), makeTab("b"), makeTab("c")];
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("a"));

      act(() => result.current.closeTabNow("c"));
      expect(result.current.tabs).toEqual([makeTab("a"), makeTab("b")]);
      expect(result.current.activeTab).toBe("a");
    });

    it("calls onSidebarReveal callback with next active tab and remaining tabs", () => {
      const { result } = renderHook(() => useTabManager());
      const tabs = [makeTab("a"), makeTab("b"), makeTab("c")];
      act(() => result.current.setTabs(tabs));
      act(() => result.current.setActiveTab("c"));

      const callback = (tabId: string, remainingTabs: TabItem[]) => {
        expect(tabId).toBe("b");
        expect(remainingTabs).toEqual([makeTab("a"), makeTab("b")]);
      };

      act(() => result.current.closeTabNow("c", callback));
    });
  });
});
