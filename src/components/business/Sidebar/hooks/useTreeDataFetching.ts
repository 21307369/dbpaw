import { useState } from "react";
import { api } from "@/services/api";
import type {
  Connection,
  TableInfo,
  RoutineInfo,
  DatasourceTreeAdapter,
} from "../connection-list/types";
import type {
  EventInfo,
  SequenceInfo,
  TypeInfo,
  SynonymInfo,
  PackageInfo,
  Driver,
} from "@/services/api";
import { supportsRoutines } from "@/lib/driver-registry";
import { groupSqlObjectsBySchema } from "../connection-list/helpers";

export function useTreeDataFetching(params: {
  connections: Connection[];
  setConnections: (fn: (prev: Connection[]) => Connection[]) => void;
  setExpandedSchemas: (fn: (prev: Set<string>) => Set<string>) => void;
  setExpandedTables: (fn: (prev: Set<string>) => Set<string>) => void;
  getAdapter: (connection: Connection) => DatasourceTreeAdapter;
}) {
  const {
    connections,
    setConnections,
    setExpandedSchemas,
    setExpandedTables,
    getAdapter,
  } = params;

  const [databaseEvents, setDatabaseEvents] = useState<
    Map<string, EventInfo[]>
  >(new Map());
  const [databaseSequences, setDatabaseSequences] = useState<
    Map<string, SequenceInfo[]>
  >(new Map());
  const [databaseTypes, setDatabaseTypes] = useState<Map<string, TypeInfo[]>>(
    new Map(),
  );
  const [databaseSynonyms, setDatabaseSynonyms] = useState<
    Map<string, SynonymInfo[]>
  >(new Map());
  const [databasePackages, setDatabasePackages] = useState<
    Map<string, PackageInfo[]>
  >(new Map());
  const [loadingDatabaseKeys, setLoadingDatabaseKeys] = useState<Set<string>>(
    new Set(),
  );
  const [loadingTableKeys, setLoadingTableKeys] = useState<Set<string>>(
    new Set(),
  );

  const fetchSqlTablesAsTableInfo = async (
    connectionId: string,
    databaseName: string,
  ): Promise<TableInfo[]> => {
    const tables = await api.metadata.listTables(
      Number(connectionId),
      databaseName,
    );
    return tables.map((table) => ({
      name: table.name,
      schema: table.schema,
      columns: [],
      type: table.type,
    }));
  };

  const fetchSqlRoutinesAsRoutineInfo = async (
    connectionId: string,
    databaseName: string,
    driver: Driver,
  ): Promise<RoutineInfo[]> => {
    if (!supportsRoutines(driver)) return [];
    try {
      const routines = await api.metadata.listRoutines(
        Number(connectionId),
        databaseName,
      );
      return routines.map((routine) => ({
        name: routine.name,
        schema: routine.schema,
        type: routine.type,
      }));
    } catch (e) {
      console.warn(
        "listRoutines failed",
        e instanceof Error ? e.message : String(e),
      );
      return [];
    }
  };

  const fetchEvents = async (
    connectionId: string,
    databaseName: string,
  ): Promise<EventInfo[]> => {
    try {
      return await api.metadata.listEvents(connectionId, databaseName);
    } catch (err) {
      console.error("Failed to fetch events:", err);
      return [];
    }
  };

  const fetchSequences = async (
    connectionId: string,
    databaseName: string,
  ): Promise<SequenceInfo[]> => {
    try {
      return await api.metadata.listSequences(connectionId, databaseName);
    } catch (err) {
      console.error("Failed to fetch sequences:", err);
      return [];
    }
  };

  const fetchTypes = async (
    connectionId: string,
    databaseName: string,
  ): Promise<TypeInfo[]> => {
    try {
      return await api.metadata.listTypes(connectionId, databaseName);
    } catch (err) {
      console.error("Failed to fetch types:", err);
      return [];
    }
  };

  const fetchSynonyms = async (
    connectionId: string,
    databaseName: string,
  ): Promise<SynonymInfo[]> => {
    try {
      return await api.metadata.listSynonyms(connectionId, databaseName);
    } catch (err) {
      console.error("Failed to fetch synonyms:", err);
      return [];
    }
  };

  const fetchPackages = async (
    connectionId: string,
    databaseName: string,
  ): Promise<PackageInfo[]> => {
    try {
      return await api.metadata.listPackages(connectionId, databaseName);
    } catch (err) {
      console.error("Failed to fetch packages:", err);
      return [];
    }
  };

  const fetchAndSetTables = async (
    connectionId: string,
    databaseName: string,
    options?: { force?: boolean },
  ): Promise<TableInfo[]> => {
    try {
      const targetConnection = connections.find(
        (conn) => conn.id === connectionId,
      );
      if (!targetConnection) {
        return [];
      }
      const datasourceAdapter = getAdapter(targetConnection);
      if (!datasourceAdapter.isDatabaseExpandable) {
        await datasourceAdapter.loadDatabaseChildren(databaseName);
        return [];
      }
      const [nextTables, nextRoutines] = await Promise.all([
        datasourceAdapter.loadDatabaseChildren(databaseName),
        fetchSqlRoutinesAsRoutineInfo(
          connectionId,
          databaseName,
          targetConnection.type,
        ),
      ]);

      // Load events if the group exists
      const groups = datasourceAdapter.databaseGroups || [];
      const eventsGroup = groups.find((g) => g.source === "events");
      if (eventsGroup) {
        const events = await fetchEvents(connectionId, databaseName);
        setDatabaseEvents((prev) =>
          new Map(prev).set(`${connectionId}-${databaseName}`, events),
        );
      }

      // Load sequences if the group exists
      const sequencesGroup = groups.find((g) => g.source === "sequences");
      if (sequencesGroup) {
        const sequences = await fetchSequences(connectionId, databaseName);
        setDatabaseSequences((prev) =>
          new Map(prev).set(`${connectionId}-${databaseName}`, sequences),
        );
      }

      // Load types if the group exists
      const typesGroup = groups.find((g) => g.source === "types");
      if (typesGroup) {
        const types = await fetchTypes(connectionId, databaseName);
        setDatabaseTypes((prev) =>
          new Map(prev).set(`${connectionId}-${databaseName}`, types),
        );
      }

      // Load synonyms if the group exists
      const synonymsGroup = groups.find((g) => g.source === "synonyms");
      if (synonymsGroup) {
        const synonyms = await fetchSynonyms(connectionId, databaseName);
        setDatabaseSynonyms((prev) =>
          new Map(prev).set(`${connectionId}-${databaseName}`, synonyms),
        );
      }

      // Load packages if the group exists
      const packagesGroup = groups.find((g) => g.source === "packages");
      if (packagesGroup) {
        const packages = await fetchPackages(connectionId, databaseName);
        setDatabasePackages((prev) =>
          new Map(prev).set(`${connectionId}-${databaseName}`, packages),
        );
      }
      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.id !== connectionId) return conn;
          const supportsSchemaNode = datasourceAdapter.supportsSchemaNode;
          return {
            ...conn,
            databases: conn.databases.map((db) => {
              if (db.name !== databaseName) return db;
              if (
                !options?.force &&
                (supportsSchemaNode
                  ? db.schemas.length > 0
                  : db.tables.length > 0)
              ) {
                return db;
              }
              if (!supportsSchemaNode) {
                return {
                  ...db,
                  schemas: [],
                  tables: nextTables,
                  routines: nextRoutines,
                };
              }
              return {
                ...db,
                schemas: groupSqlObjectsBySchema(nextTables, nextRoutines),
                tables: [],
              };
            }),
          };
        }),
      );
      return nextTables;
    } catch (e) {
      console.error(
        "listTables failed",
        e instanceof Error ? e.message : String(e),
      );
      return [];
    }
  };

  const fetchAndSetTableColumns = async (
    connectionId: string,
    databaseName: string,
    schema: string,
    tableName: string,
  ) => {
    try {
      const metadata = await api.metadata.getTableMetadata(
        Number(connectionId),
        databaseName,
        schema,
        tableName,
      );
      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.id !== connectionId) return conn;
          return {
            ...conn,
            databases: conn.databases.map((db) => {
              if (db.name !== databaseName) return db;
              return {
                ...db,
                schemas: db.schemas.map((schemaNode) => ({
                  ...schemaNode,
                  tables: schemaNode.tables.map((t) => {
                    if (t.name !== tableName || t.schema !== schema) return t;
                    if (t.columns.length > 0) return t;
                    return {
                      ...t,
                      columns: metadata.columns.map((c) => ({
                        name: c.name,
                        type: c.type,
                        isPrimaryKey: c.primaryKey,
                        nullable: c.nullable,
                      })),
                    };
                  }),
                })),
                tables: db.tables.map((t) => {
                  if (t.name !== tableName || t.schema !== schema) return t;
                  if (t.columns.length > 0) return t;
                  return {
                    ...t,
                    columns: metadata.columns.map((c) => ({
                      name: c.name,
                      type: c.type,
                      isPrimaryKey: c.primaryKey,
                      nullable: c.nullable,
                    })),
                  };
                }),
              };
            }),
          };
        }),
      );
    } catch (e) {
      console.error(
        "getTableMetadata failed",
        e instanceof Error ? e.message : String(e),
      );
    }
  };

  const handleRefreshDatabaseTables = async (
    connectionId: string,
    databaseName: string,
  ) => {
    const databaseKey = `${connectionId}-${databaseName}`;
    const tableKeyPrefix = `${databaseKey}-`;
    const schemaKeyPrefix = `${databaseKey}::`;
    setExpandedSchemas((prev) => {
      const next = new Set(
        [...prev].filter((key) => !key.startsWith(schemaKeyPrefix)),
      );
      return next;
    });
    setExpandedTables((prev) => {
      const next = new Set(
        [...prev].filter((key) => !key.startsWith(tableKeyPrefix)),
      );
      return next;
    });

    await fetchAndSetTables(connectionId, databaseName, { force: true });
  };

  return {
    databaseEvents,
    setDatabaseEvents,
    databaseSequences,
    setDatabaseSequences,
    databaseTypes,
    setDatabaseTypes,
    databaseSynonyms,
    setDatabaseSynonyms,
    databasePackages,
    setDatabasePackages,
    loadingDatabaseKeys,
    setLoadingDatabaseKeys,
    loadingTableKeys,
    setLoadingTableKeys,
    fetchSqlTablesAsTableInfo,
    fetchSqlRoutinesAsRoutineInfo,
    fetchEvents,
    fetchSequences,
    fetchTypes,
    fetchSynonyms,
    fetchPackages,
    fetchAndSetTables,
    fetchAndSetTableColumns,
    handleRefreshDatabaseTables,
  };
}
