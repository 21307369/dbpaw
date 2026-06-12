import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, mock, beforeEach } from "bun:test";
import { useZSetLexRange } from "../useZSetLexRange";

const mockOnZRangeByLex = mock(() => {});

describe("useZSetLexRange", () => {
  beforeEach(() => {
    mockOnZRangeByLex.mockClear();
  });

  it("should initialize with default state", () => {
    const { result } = renderHook(() => useZSetLexRange(mockOnZRangeByLex));
    expect(result.current.lexMin).toBe("-");
    expect(result.current.lexMax).toBe("+");
    expect(result.current.lexActive).toBe(false);
    expect(result.current.lexMembers).toBeNull();
    expect(result.current.lexTotal).toBeNull();
    expect(result.current.isLexing).toBe(false);
  });

  it("should execute lex range and update state", async () => {
    mockOnZRangeByLex.mockResolvedValue({
      members: ["a", "b", "c"],
      total: 3,
    });
    const { result } = renderHook(() => useZSetLexRange(mockOnZRangeByLex));
    act(() => {
      result.current.setLexMin("[a");
      result.current.setLexMax("[c");
    });
    await act(async () => {
      await result.current.handleLexRange();
    });
    expect(mockOnZRangeByLex).toHaveBeenCalledWith("[a", "[c");
    expect(result.current.lexMembers).toEqual(["a", "b", "c"]);
    expect(result.current.lexTotal).toBe(3);
    expect(result.current.lexActive).toBe(true);
    expect(result.current.isLexing).toBe(false);
  });

  it("should clear lex filter and reset state", async () => {
    mockOnZRangeByLex.mockResolvedValue({
      members: ["a", "b"],
      total: 2,
    });
    const { result } = renderHook(() => useZSetLexRange(mockOnZRangeByLex));
    await act(async () => {
      await result.current.handleLexRange();
    });
    expect(result.current.lexActive).toBe(true);
    act(() => {
      result.current.clearLex();
    });
    expect(result.current.lexActive).toBe(false);
    expect(result.current.lexMembers).toBeNull();
    expect(result.current.lexTotal).toBeNull();
  });

  it("should handle error gracefully", async () => {
    mockOnZRangeByLex.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useZSetLexRange(mockOnZRangeByLex));
    await act(async () => {
      await result.current.handleLexRange();
    });
    expect(result.current.lexMembers).toBeNull();
    expect(result.current.isLexing).toBe(false);
  });

  it("should not execute if callback is undefined", async () => {
    const { result } = renderHook(() => useZSetLexRange(undefined));
    await act(async () => {
      await result.current.handleLexRange();
    });
    expect(result.current.isLexing).toBe(false);
    expect(result.current.lexActive).toBe(false);
  });
});
