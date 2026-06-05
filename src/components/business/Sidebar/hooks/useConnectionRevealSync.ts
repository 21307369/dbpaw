import { useEffect, useRef, useState } from "react";

import { supportsSchemaBrowsing } from "@/lib/driver-registry";
import type {
  Connection,
  SelectedTableNode,
  TableInfo,
} from "../connection-list/types";

type SetExpanded = React.Dispatch<React.SetStateAction<Set<string>>>;

const getSchemaNodeKey = (databaseKey: string, schema: string) =>
  `${databaseKey}::${schema}`;

const getTableNodeKey = (
  connectionId: string,
  databaseName: string,
  schemaName: string,
  tableName: string,
) => `${connectionId}-${databaseName}-${schemaName}-${tableName}`;

export function useConnectionRevealSync(options: {
  activeTableTarget?: {
    connectionId: number;
    database: string;
    table: string;
    schema?: string;
  };
  sidebarRevealRequest?: {
    id: number;
    connectionId: number;
    database: string;
    table: string;
    schema?: string;
  };
  redisRefreshRequest?: {
    id: number;
    connectionId: number;
    database: string;
  };
  connections: Connection[];
  connectionsRef: React.MutableRefObject<Connection[]>;
  expandedDatabasesRef: React.MutableRefObject<Set<string>>;
  searchTerm: string;
  setExpandedConnections: SetExpanded;
  setExpandedDatabases: SetExpanded;
  setExpandedSchemas: SetExpanded;
  fetchAndSetTables: (
    connectionId: string,
    databaseName: string,
  ) => Promise<TableInfo[]>;
  loadRedisKeysPage: (
    connectionId: string,
    databaseName: string,
    cursor: string,
    append: boolean,
  ) => Promise<TableInfo[]>;
}) {
  const {
    activeTableTarget,
    sidebarRevealRequest,
    redisRefreshRequest,
    connections,
    connectionsRef,
    expandedDatabasesRef,
    searchTerm,
    setExpandedConnections,
    setExpandedDatabases,
    setExpandedSchemas,
    fetchAndSetTables,
    loadRedisKeysPage,
  } = options;
  const tableNodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledRevealRequestIdRef = useRef<number | null>(null);
  const handledRedisRefreshIdRef = useRef<number | null>(null);
  const [selectedTableNode, setSelectedTableNode] =
    useState<SelectedTableNode | null>(null);
  const [autoScrollRequest, setAutoScrollRequest] = useState<{
    key: string;
    id: number;
  } | null>(null);

  useEffect(() => {
    connectionsRef.current.forEach((conn) => {
      if (conn.type !== "redis") return;
      conn.databases.forEach((db) => {
        const dbKey = `${conn.id}-${db.name}`;
        if (!expandedDatabasesRef.current.has(dbKey) || db.tables.length === 0)
          return;
        void loadRedisKeysPage(conn.id, db.name, "0", false);
      });
    });
  }, [searchTerm, loadRedisKeysPage]);

  useEffect(() => {
    if (!activeTableTarget) {
      setSelectedTableNode(null);
      return;
    }

    const connectionId = String(activeTableTarget.connectionId);
    const databaseName = activeTableTarget.database;
    const tableName = activeTableTarget.table;
    const schemaName = activeTableTarget.schema || "";
    const dbKey = `${connectionId}-${databaseName}`;
    let cancelled = false;

    setExpandedConnections((prev) => {
      const next = new Set(prev);
      next.add(connectionId);
      return next;
    });
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      next.add(dbKey);
      return next;
    });

    const ensureDatabaseTablesLoaded = async () => {
      const targetConnection = connections.find(
        (conn) => conn.id === connectionId,
      );
      const targetDatabase = targetConnection?.databases.find(
        (db) => db.name === databaseName,
      );
      if (!targetDatabase) return;

      const supportsSchemaNode = supportsSchemaBrowsing(
        targetConnection?.type || "postgres",
      );
      const hasLoadedTables = supportsSchemaNode
        ? targetDatabase.schemas.length > 0
        : targetDatabase.tables.length > 0;
      let availableTables = supportsSchemaNode
        ? targetDatabase.schemas.flatMap((schema) => schema.tables)
        : targetDatabase.tables;
      if (!hasLoadedTables) {
        availableTables = await fetchAndSetTables(connectionId, databaseName);
      }
      if (cancelled) return;
      const resolvedSchema =
        schemaName ||
        availableTables.find((table) => table.name === tableName)?.schema ||
        "";
      if (supportsSchemaNode && resolvedSchema) {
        setExpandedSchemas((prev) => {
          const next = new Set(prev);
          next.add(getSchemaNodeKey(dbKey, resolvedSchema));
          return next;
        });
      }
      const resolvedTableKey = getTableNodeKey(
        connectionId,
        databaseName,
        resolvedSchema,
        tableName,
      );
      setSelectedTableNode({
        key: resolvedTableKey,
        connectionId: activeTableTarget.connectionId,
        database: databaseName,
        table: tableName,
        schema: resolvedSchema,
      });
    };

    void ensureDatabaseTablesLoaded();
    return () => {
      cancelled = true;
    };
  }, [activeTableTarget, connections]);

  useEffect(() => {
    if (!sidebarRevealRequest || !activeTableTarget || !selectedTableNode)
      return;
    if (handledRevealRequestIdRef.current === sidebarRevealRequest.id) return;
    if (
      sidebarRevealRequest.connectionId !== activeTableTarget.connectionId ||
      sidebarRevealRequest.database !== activeTableTarget.database ||
      sidebarRevealRequest.table !== activeTableTarget.table
    ) {
      return;
    }
    if (
      selectedTableNode.connectionId !== sidebarRevealRequest.connectionId ||
      selectedTableNode.database !== sidebarRevealRequest.database ||
      selectedTableNode.table !== sidebarRevealRequest.table
    ) {
      return;
    }
    if (
      sidebarRevealRequest.schema &&
      sidebarRevealRequest.schema !== selectedTableNode.schema
    ) {
      return;
    }

    handledRevealRequestIdRef.current = sidebarRevealRequest.id;
    setAutoScrollRequest({
      key: selectedTableNode.key,
      id: sidebarRevealRequest.id,
    });
  }, [activeTableTarget, selectedTableNode, sidebarRevealRequest]);

  useEffect(() => {
    if (!redisRefreshRequest) return;
    if (handledRedisRefreshIdRef.current === redisRefreshRequest.id) return;
    handledRedisRefreshIdRef.current = redisRefreshRequest.id;
    const dbKey = `${String(redisRefreshRequest.connectionId)}-${redisRefreshRequest.database}`;
    if (!expandedDatabasesRef.current.has(dbKey)) return;
    void loadRedisKeysPage(
      String(redisRefreshRequest.connectionId),
      redisRefreshRequest.database,
      "0",
      false,
    );
  }, [redisRefreshRequest, loadRedisKeysPage]);

  useEffect(() => {
    if (!autoScrollRequest) return;
    let cancelled = false;
    let retriesLeft = 12;
    let frame1 = 0;
    let frame2 = 0;

    const run = () => {
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          if (cancelled) return;
          const target = tableNodeRefs.current[autoScrollRequest.key];
          if (target) {
            target.scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: "auto",
            });
            setAutoScrollRequest((prev) =>
              prev?.id === autoScrollRequest.id ? null : prev,
            );
            return;
          }

          retriesLeft -= 1;
          if (retriesLeft > 0) {
            run();
            return;
          }

          setAutoScrollRequest((prev) =>
            prev?.id === autoScrollRequest.id ? null : prev,
          );
        });
      });
    };

    run();

    return () => {
      cancelled = true;
      if (frame1) cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [autoScrollRequest]);

  return {
    tableNodeRefs,
    selectedTableNode,
    selectedTableKey: selectedTableNode?.key ?? null,
  };
}
