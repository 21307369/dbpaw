import { describe, expect, it } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { SavedQuery } from "@/services/api";
import type { Connection } from "../connection-list/types";
import { useConnectionTreeSearch } from "./useConnectionTreeSearch";

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "1",
    name: "local",
    type: "postgres",
    host: "localhost",
    port: "5432",
    username: "postgres",
    databases: [
      {
        name: "app",
        schemas: [
          {
            name: "public",
            tables: [{ name: "users", schema: "public", columns: [] }],
            procedures: [],
            functions: [],
          },
        ],
        tables: [{ name: "logs", schema: "", columns: [] }],
        routines: [],
      },
    ],
    isConnected: true,
    connectState: "success",
    ...overrides,
  };
}

function makeSavedQuery(overrides: Partial<SavedQuery> = {}): SavedQuery {
  return {
    id: 1,
    name: "Find active accounts",
    sql: "select 1",
    connectionId: 1,
    database: "app",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("useConnectionTreeSearch", () => {
  it("filters database children by table name", () => {
    const connection = makeConnection();
    const { result } = renderHook(() =>
      useConnectionTreeSearch({
        connections: [connection],
        savedQueriesByConnection: {},
        showSavedQueriesInTree: false,
        setExpandedConnections: () => {},
        setExpandedDatabases: () => {},
        setExpandedSchemas: () => {},
        setExpandedDatabaseGroups: () => {},
        setExpandedQueryGroups: () => {},
      }),
    );

    act(() => result.current.setSearchTerm("user"));

    expect(result.current.filteredConnections).toHaveLength(1);
    expect(
      result.current.filteredConnections[0].databases[0].schemas[0].tables,
    ).toEqual([{ name: "users", schema: "public", columns: [] }]);
    expect(result.current.filteredConnections[0].databases[0].tables).toEqual(
      [],
    );
  });

  it("keeps a connection when only a saved query matches", () => {
    const connection = makeConnection();
    const { result } = renderHook(() =>
      useConnectionTreeSearch({
        connections: [connection],
        savedQueriesByConnection: { "1": [makeSavedQuery()] },
        showSavedQueriesInTree: true,
        setExpandedConnections: () => {},
        setExpandedDatabases: () => {},
        setExpandedSchemas: () => {},
        setExpandedDatabaseGroups: () => {},
        setExpandedQueryGroups: () => {},
      }),
    );

    act(() => result.current.setSearchTerm("active"));

    expect(result.current.filteredConnections).toHaveLength(1);
    expect(result.current.filteredConnections[0].databases).toEqual([]);
  });

  it("expands matching tree paths while searching", () => {
    const expandedConnections = new Set<string>();
    const expandedDatabases = new Set<string>();
    const expandedSchemas = new Set<string>();
    const expandedDatabaseGroups = new Set<string>();
    const expandedQueryGroups = new Set<string>();
    const applySet =
      (target: Set<string>) =>
      (updater: (prev: Set<string>) => Set<string>) => {
        const next = updater(target);
        target.clear();
        next.forEach((value) => target.add(value));
      };

    const { result } = renderHook(() =>
      useConnectionTreeSearch({
        connections: [makeConnection()],
        savedQueriesByConnection: { "1": [makeSavedQuery()] },
        showSavedQueriesInTree: true,
        setExpandedConnections: applySet(expandedConnections),
        setExpandedDatabases: applySet(expandedDatabases),
        setExpandedSchemas: applySet(expandedSchemas),
        setExpandedDatabaseGroups: applySet(expandedDatabaseGroups),
        setExpandedQueryGroups: applySet(expandedQueryGroups),
      }),
    );

    act(() => result.current.setSearchTerm("user"));

    expect(expandedConnections.has("1")).toBe(true);
    expect(expandedDatabases.has("1-app")).toBe(true);
    expect(expandedSchemas.has("1-app::public")).toBe(true);
    expect(expandedDatabaseGroups.has("1::databases")).toBe(true);
    expect(expandedQueryGroups.has("1::queries")).toBe(true);
  });
});
