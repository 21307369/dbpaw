import { mock } from "bun:test";

const mockT = (s: string) => s;
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

mock.module("sonner", () => ({
  toast: { success: mock(), error: mock() },
}));

mock.module("@/lib/errors", () => ({
  errorMessage: (e: unknown) => String(e),
}));

mock.module("@tauri-apps/plugin-dialog", () => ({
  save: mock(() => Promise.resolve(null)),
}));

mock.module("@/services/api", () => ({
  api: {
    queries: {
      create: mock(() => Promise.resolve({ id: 1, name: "test" })),
      update: mock(() => Promise.resolve({ id: 1, name: "test" })),
    },
    transfer: {
      exportQueryResult: mock(() =>
        Promise.resolve({ rowCount: 10, filePath: "/tmp/test.csv" }),
      ),
    },
  },
  isTauri: () => false,
}));

import { describe, test, expect } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useSqlEditorApi } from "./useSqlEditorApi";

describe("useSqlEditorApi", () => {
  test("isFormatting defaults to false", () => {
    const { result } = renderHook(() => useSqlEditorApi({ code: "SELECT 1" }));
    expect(result.current.isFormatting).toBe(false);
  });

  test("isSaveDialogOpen defaults to false", () => {
    const { result } = renderHook(() => useSqlEditorApi({ code: "SELECT 1" }));
    expect(result.current.isSaveDialogOpen).toBe(false);
  });

  test("setIsSaveDialogOpen toggles dialog state", () => {
    const { result } = renderHook(() => useSqlEditorApi({ code: "SELECT 1" }));
    act(() => result.current.setIsSaveDialogOpen(true));
    expect(result.current.isSaveDialogOpen).toBe(true);
  });
});
