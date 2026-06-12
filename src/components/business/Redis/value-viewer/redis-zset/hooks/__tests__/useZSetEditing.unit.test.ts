import { describe, expect, it, mock, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useZSetEditing } from "../useZSetEditing";

const mockOnChange = mock(() => {});
const mockValue = [
  { member: "a", score: 1 },
  { member: "b", score: 2 },
];

describe("useZSetEditing", () => {
  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("should initialize with default state", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    expect(result.current.editingMember).toBeNull();
    expect(result.current.editingScore).toBe("");
    expect(result.current.showNewRow).toBe(false);
    expect(result.current.newMember).toBe("");
    expect(result.current.newScore).toBe("");
    expect(result.current.scoreError).toBeNull();
  });

  it("should set editing member and score", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setEditingMember("a");
      result.current.setEditingScore("5");
    });
    expect(result.current.editingMember).toBe("a");
    expect(result.current.editingScore).toBe("5");
  });

  it("should commit edit and call onChange", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setEditingMember("a");
      result.current.setEditingScore("10");
    });
    act(() => {
      result.current.commitEdit("a");
    });
    expect(mockOnChange).toHaveBeenCalledWith([
      { member: "a", score: 10 },
      { member: "b", score: 2 },
    ]);
    expect(result.current.editingMember).toBeNull();
    expect(result.current.scoreError).toBeNull();
  });

  it("should set error for invalid score", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setEditingMember("a");
      result.current.setEditingScore("invalid");
    });
    act(() => {
      result.current.commitEdit("a");
    });
    expect(result.current.scoreError).toBeTruthy();
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it("should cancel edit and reset state", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setEditingMember("a");
      result.current.setEditingScore("5");
      result.current.setScoreError("error");
    });
    act(() => {
      result.current.cancelEdit();
    });
    expect(result.current.editingMember).toBeNull();
    expect(result.current.scoreError).toBeNull();
  });

  it("should cancel add and reset state", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setShowNewRow(true);
      result.current.setNewMember("c");
      result.current.setNewScore("3");
      result.current.setScoreError("error");
    });
    act(() => {
      result.current.cancelAdd();
    });
    expect(result.current.showNewRow).toBe(false);
    expect(result.current.newMember).toBe("");
    expect(result.current.newScore).toBe("");
    expect(result.current.scoreError).toBeNull();
  });

  it("should commit add and call onChange", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setShowNewRow(true);
      result.current.setNewMember("c");
      result.current.setNewScore("3");
    });
    act(() => {
      result.current.commitAdd();
    });
    expect(mockOnChange).toHaveBeenCalledWith([
      ...mockValue,
      { member: "c", score: 3 },
    ]);
    expect(result.current.showNewRow).toBe(false);
    expect(result.current.newMember).toBe("");
    expect(result.current.newScore).toBe("");
  });

  it("should update existing member on add if duplicate", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setShowNewRow(true);
      result.current.setNewMember("a");
      result.current.setNewScore("100");
    });
    act(() => {
      result.current.commitAdd();
    });
    expect(mockOnChange).toHaveBeenCalledWith([
      { member: "a", score: 100 },
      { member: "b", score: 2 },
    ]);
  });

  it("should delete member and call onChange", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.deleteMember("a");
    });
    expect(mockOnChange).toHaveBeenCalledWith([{ member: "b", score: 2 }]);
  });

  it("should clear editing member when deleted", () => {
    const { result } = renderHook(() => useZSetEditing(mockValue, mockOnChange));
    act(() => {
      result.current.setEditingMember("a");
    });
    act(() => {
      result.current.deleteMember("a");
    });
    expect(result.current.editingMember).toBeNull();
  });
});
