import { mock } from "bun:test";

const mockT = (s: string) => s;
mock.module("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));

mock.module("@/contexts/ShortcutsContext", () => ({
  useShortcutBinding: (id: string) => id,
}));

mock.module("@/lib/shortcuts/match", () => ({
  comboToCodeMirror: (s: string) => s,
}));

import { describe, test, expect, mock } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useSqlEditorActions } from "./useSqlEditorActions";

describe("useSqlEditorActions", () => {
  const baseProps = {
    editorFontSizePx: 14,
    theme: "default",
    handleFormat: async () => undefined,
    triggerSave: () => {},
    handleSqlChange: () => {},
  };

  test("returns extensions array", () => {
    const { result } = renderHook(() => useSqlEditorActions(baseProps));
    expect(Array.isArray(result.current.extensions)).toBe(true);
    expect(result.current.extensions.length).toBeGreaterThan(0);
  });

  test("returns editorTheme array", () => {
    const { result } = renderHook(() => useSqlEditorActions(baseProps));
    expect(Array.isArray(result.current.editorTheme)).toBe(true);
  });

  test("returns editorViewRef", () => {
    const { result } = renderHook(() => useSqlEditorActions(baseProps));
    expect(result.current.editorViewRef).toBeDefined();
    expect(result.current.editorViewRef.current).toBeNull();
  });

  test("handleExecute does not throw when no onExecute", () => {
    const { result } = renderHook(() => useSqlEditorActions(baseProps));
    expect(() => result.current.handleExecute()).not.toThrow();
  });

  test("handleClear calls handleSqlChange with empty string", () => {
    const handleSqlChange = mock(() => {});
    const { result } = renderHook(() =>
      useSqlEditorActions({ ...baseProps, handleSqlChange }),
    );
    result.current.handleClear();
    expect(handleSqlChange).toHaveBeenCalledWith("");
  });
});
