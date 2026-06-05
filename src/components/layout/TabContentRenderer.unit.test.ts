import { describe, expect, test } from "bun:test";
import { shouldMountTabContent } from "./TabContentRenderer";

describe("shouldMountTabContent", () => {
  test("mounts only the active tab content", () => {
    expect(shouldMountTabContent("query-1", "query-1")).toBe(true);
    expect(shouldMountTabContent("query-2", "query-1")).toBe(false);
  });
});
