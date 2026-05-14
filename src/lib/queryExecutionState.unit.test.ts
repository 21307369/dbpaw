import { describe, it, expect } from "bun:test";
import {
  applyQueryCompletionToTab,
  QueryResultsState,
} from "./queryExecutionState";

// Mock Tab type
interface TestTab {
  id: string;
  activeQueryId?: string;
  lastQueryId?: string;
  queryResults?: QueryResultsState | null;
}

describe("applyQueryCompletionToTab", () => {
  const mockResults: QueryResultsState = {
    data: [{ id: 1, name: "test" }],
    columns: ["id", "name"],
    executionTime: "100ms",
  };

  it("should update results when the query is the latest", () => {
    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      mockResults,
    );

    expect(result.queryResults).toEqual(mockResults);
    expect(result.activeQueryId).toBeUndefined();
    expect(result.lastQueryId).toBeUndefined();
  });

  it("should ignore stale query results (race condition scenario)", () => {
    // Scenario: query-A was sent first, then query-B
    // query-B updated lastQueryId to B
    // now query-A returns and should be ignored
    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-B",
      lastQueryId: "query-B", // B is already the latest
      queryResults: undefined,
    };

    // query-A response returns
    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      mockResults,
    );

    // should remain unchanged
    expect(result.queryResults).toBeUndefined();
    expect(result.activeQueryId).toBe("query-B");
    expect(result.lastQueryId).toBe("query-B");
    // ensure the same object reference is returned (no changes)
    expect(result).toBe(tab);
  });

  it("should ignore query results from another tab", () => {
    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-2",
      "query-A",
      mockResults,
    );

    // should remain unchanged
    expect(result.queryResults).toBeUndefined();
    expect(result.activeQueryId).toBe("query-A");
    expect(result).toBe(tab);
  });

  it("should correctly handle error results", () => {
    const errorResults: QueryResultsState = {
      data: [],
      columns: [],
      executionTime: "0ms",
      error: "Connection timeout",
    };

    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      errorResults,
    );

    expect(result.queryResults).toEqual(errorResults);
    expect(result.queryResults?.error).toBe("Connection timeout");
  });

  it("complex case: only the last of rapid queries should apply", () => {
    let tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-1",
      lastQueryId: "query-1",
    };

    // Simulate a user executing 3 queries rapidly
    // First query
    tab = { ...tab, activeQueryId: "query-1", lastQueryId: "query-1" };
    // Second query (overrides the first)
    tab = { ...tab, activeQueryId: "query-2", lastQueryId: "query-2" };
    // Third query (overrides the second)
    tab = { ...tab, activeQueryId: "query-3", lastQueryId: "query-3" };

    // query-2 completes first (already stale)
    const resultFromQuery2 = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-2",
      {
        ...mockResults,
        data: [{ id: 2 }],
      },
    );

    // should be ignored
    expect(resultFromQuery2.queryResults).toBeUndefined();
    expect(resultFromQuery2.lastQueryId).toBe("query-3");

    // then query-3 completes (latest)
    const resultFromQuery3 = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-3",
      {
        ...mockResults,
        data: [{ id: 3 }],
      },
    );

    // should be accepted
    expect(resultFromQuery3.queryResults?.data).toEqual([{ id: 3 }]);
    expect(resultFromQuery3.lastQueryId).toBeUndefined();

    // finally query-1 completes (even more stale)
    const resultFromQuery1 = applyQueryCompletionToTab(
      resultFromQuery3,
      "tab-1",
      "query-1",
      {
        ...mockResults,
        data: [{ id: 1 }],
      },
    );

    // should be ignored, keep query-3 results
    expect(resultFromQuery1.queryResults?.data).toEqual([{ id: 3 }]);
  });
});

describe("applyQueryCompletionToTab - Multiple Result Sets", () => {
  const mockMultipleResults: QueryResultsState = {
    data: [],
    columns: [],
    executionTime: "150ms",
    resultSets: [
      {
        data: [{ id: 1, name: "Alice" }],
        columns: ["id", "name"],
        rowCount: 1,
        statement: "SELECT id, name FROM users",
        index: 0,
      },
      {
        data: [{ id: 2, email: "bob@test.com" }],
        columns: ["id", "email"],
        rowCount: 1,
        statement: "SELECT id, email FROM users",
        index: 1,
      },
    ],
    activeResultSetIndex: 0,
  };

  it("should update results with multiple result sets", () => {
    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      mockMultipleResults,
    );

    expect(result.queryResults).toEqual(mockMultipleResults);
    expect(result.queryResults?.resultSets).toHaveLength(2);
    expect(result.queryResults?.activeResultSetIndex).toBe(0);
    expect(result.activeQueryId).toBeUndefined();
    expect(result.lastQueryId).toBeUndefined();
  });

  it("should preserve multiple result sets structure", () => {
    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      mockMultipleResults,
    );

    expect(result.queryResults?.resultSets?.[0].statement).toBe(
      "SELECT id, name FROM users",
    );
    expect(result.queryResults?.resultSets?.[1].statement).toBe(
      "SELECT id, email FROM users",
    );
    expect(result.queryResults?.resultSets?.[0].data).toEqual([
      { id: 1, name: "Alice" },
    ]);
    expect(result.queryResults?.resultSets?.[1].data).toEqual([
      { id: 2, email: "bob@test.com" },
    ]);
  });

  it("should handle multiple result sets with error", () => {
    const errorMultipleResults: QueryResultsState = {
      data: [],
      columns: [],
      executionTime: "50ms",
      error: "Partial failure on statement 2",
      resultSets: [
        {
          data: [{ id: 1 }],
          columns: ["id"],
          rowCount: 1,
          statement: "SELECT id FROM users",
          index: 0,
        },
      ],
      activeResultSetIndex: 0,
    };

    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      errorMultipleResults,
    );

    expect(result.queryResults?.error).toBe("Partial failure on statement 2");
    expect(result.queryResults?.resultSets).toHaveLength(1);
  });

  it("should handle single result set (backward compatibility)", () => {
    const singleResult: QueryResultsState = {
      data: [{ id: 1, name: "test" }],
      columns: ["id", "name"],
      executionTime: "50ms",
    };

    const tab: TestTab = {
      id: "tab-1",
      activeQueryId: "query-A",
      lastQueryId: "query-A",
    };

    const result = applyQueryCompletionToTab(
      tab,
      "tab-1",
      "query-A",
      singleResult,
    );

    expect(result.queryResults?.data).toEqual([{ id: 1, name: "test" }]);
    expect(result.queryResults?.resultSets).toBeUndefined();
    expect(result.queryResults?.activeResultSetIndex).toBeUndefined();
  });
});
