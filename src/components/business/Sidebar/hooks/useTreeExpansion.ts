import { useRef, useState } from "react";
import type { Connection } from "../connection-list/types";

export function useTreeExpansion() {
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDatabases, setExpandedDatabases] = useState<Set<string>>(
    new Set(),
  );
  // These refs are updated every render so effects can read latest values without
  // listing them as deps (avoids re-firing on every connection state update).
  // NOTE: The caller must update connectionsRef.current and expandedDatabasesRef.current
  // every render with the latest values.
  const connectionsRef = useRef<Connection[]>([]);
  const expandedDatabasesRef = useRef<Set<string>>(new Set());

  const [expandedDatabaseGroups, setExpandedDatabaseGroups] = useState<
    Set<string>
  >(new Set());
  const [expandedQueryGroups, setExpandedQueryGroups] = useState<Set<string>>(
    new Set(),
  );
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(
    new Set(),
  );
  const [expandedGroupNodes, setExpandedGroupNodes] = useState<Set<string>>(
    new Set(),
  );
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  const toggleConnection = (id: string, connections: Connection[]) => {
    const connection = connections.find((conn) => conn.id === id);
    if (!connection) return;
    if (connection.connectState !== "success") return;
    setExpandedConnections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDatabase = (
    key: string,
    onNeedsLoading?: (connId: string, dbName: string, key: string) => void,
  ) => {
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        if (onNeedsLoading) {
          const [connId, ...dbNameParts] = key.split("-");
          const dbName = dbNameParts.join("-");
          onNeedsLoading(connId, dbName, key);
        }
      }
      return next;
    });
  };

  const toggleQueryGroup = (key: string) => {
    setExpandedQueryGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDatabaseGroup = (key: string) => {
    setExpandedDatabaseGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSchema = (schemaKey: string) => {
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaKey)) next.delete(schemaKey);
      else next.add(schemaKey);
      return next;
    });
  };

  const toggleGroupNode = (groupKey: string) => {
    setExpandedGroupNodes((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  const toggleTable = (
    tableKey: string,
    onNeedsLoading?: () => void,
  ) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) {
        next.delete(tableKey);
      } else {
        next.add(tableKey);
        if (onNeedsLoading) {
          onNeedsLoading();
        }
      }
      return next;
    });
  };

  return {
    expandedConnections,
    setExpandedConnections,
    expandedDatabases,
    setExpandedDatabases,
    expandedDatabaseGroups,
    setExpandedDatabaseGroups,
    expandedQueryGroups,
    setExpandedQueryGroups,
    expandedSchemas,
    setExpandedSchemas,
    expandedGroupNodes,
    setExpandedGroupNodes,
    expandedTables,
    setExpandedTables,
    connectionsRef,
    expandedDatabasesRef,
    toggleConnection,
    toggleDatabase,
    toggleQueryGroup,
    toggleDatabaseGroup,
    toggleSchema,
    toggleGroupNode,
    toggleTable,
  };
}
