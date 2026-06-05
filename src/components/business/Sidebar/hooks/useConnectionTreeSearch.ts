import { useEffect, useMemo, useState } from "react";

import type { SavedQuery } from "@/services/api";
import type {
  Connection,
  DatabaseInfo,
  SchemaInfo,
} from "../connection-list/types";

type SetExpanded = React.Dispatch<React.SetStateAction<Set<string>>>;

const getSchemaNodeKey = (databaseKey: string, schema: string) =>
  `${databaseKey}::${schema}`;

export function useConnectionTreeSearch(options: {
  connections: Connection[];
  savedQueriesByConnection: Record<string, SavedQuery[]>;
  showSavedQueriesInTree: boolean;
  setExpandedConnections: SetExpanded;
  setExpandedDatabases: SetExpanded;
  setExpandedSchemas: SetExpanded;
  setExpandedDatabaseGroups: SetExpanded;
  setExpandedQueryGroups: SetExpanded;
}) {
  const {
    connections,
    savedQueriesByConnection,
    showSavedQueriesInTree,
    setExpandedConnections,
    setExpandedDatabases,
    setExpandedSchemas,
    setExpandedDatabaseGroups,
    setExpandedQueryGroups,
  } = options;
  const [searchTerm, setSearchTerm] = useState("");

  const filteredConnections = useMemo(() => {
    if (!searchTerm) return connections;
    const lowerTerm = searchTerm.toLowerCase();
    return connections
      .map((conn) => {
        const filteredDbs = conn.databases
          .map((db) => {
            const filteredSchemas = db.schemas
              .map((schema) => {
                const filteredTables = schema.tables.filter((t) =>
                  t.name.toLowerCase().includes(lowerTerm),
                );
                const filteredProcedures = schema.procedures.filter((routine) =>
                  routine.name.toLowerCase().includes(lowerTerm),
                );
                const filteredFunctions = schema.functions.filter((routine) =>
                  routine.name.toLowerCase().includes(lowerTerm),
                );
                if (
                  filteredTables.length > 0 ||
                  filteredProcedures.length > 0 ||
                  filteredFunctions.length > 0
                ) {
                  return {
                    ...schema,
                    tables: filteredTables,
                    procedures: filteredProcedures,
                    functions: filteredFunctions,
                  };
                }
                return null;
              })
              .filter(Boolean) as SchemaInfo[];
            const filteredTables = db.tables.filter((t) =>
              t.name.toLowerCase().includes(lowerTerm),
            );
            if (filteredSchemas.length > 0 || filteredTables.length > 0) {
              return {
                ...db,
                schemas: filteredSchemas,
                tables: filteredTables,
              };
            }
            return null;
          })
          .filter(Boolean) as DatabaseInfo[];

        const hasMatchingQuery =
          showSavedQueriesInTree &&
          (savedQueriesByConnection[conn.id] || []).some((query) =>
            query.name.toLowerCase().includes(lowerTerm),
          );

        if (filteredDbs.length > 0 || hasMatchingQuery) {
          return { ...conn, databases: filteredDbs };
        }
        return null;
      })
      .filter(Boolean) as Connection[];
  }, [
    connections,
    savedQueriesByConnection,
    searchTerm,
    showSavedQueriesInTree,
  ]);

  useEffect(() => {
    if (!searchTerm) return;

    setExpandedConnections((prev) => {
      const next = new Set(prev);
      filteredConnections.forEach((conn) => {
        next.add(conn.id);
      });
      return next;
    });
    setExpandedDatabases((prev) => {
      const next = new Set(prev);
      filteredConnections.forEach((conn) => {
        conn.databases.forEach((db) => {
          next.add(`${conn.id}-${db.name}`);
        });
      });
      return next;
    });
    setExpandedSchemas((prev) => {
      const next = new Set(prev);
      filteredConnections.forEach((conn) => {
        conn.databases.forEach((db) => {
          const databaseKey = `${conn.id}-${db.name}`;
          db.schemas.forEach((schema) => {
            next.add(getSchemaNodeKey(databaseKey, schema.name));
          });
        });
      });
      return next;
    });
    if (showSavedQueriesInTree) {
      setExpandedDatabaseGroups((prev) => {
        const next = new Set(prev);
        filteredConnections.forEach((conn) => {
          next.add(`${conn.id}::databases`);
        });
        return next;
      });
      setExpandedQueryGroups((prev) => {
        const next = new Set(prev);
        filteredConnections.forEach((conn) => {
          next.add(`${conn.id}::queries`);
        });
        return next;
      });
    }
  }, [searchTerm, filteredConnections, showSavedQueriesInTree]);

  return {
    searchTerm,
    setSearchTerm,
    filteredConnections,
  };
}
