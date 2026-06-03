import { useCallback } from "react";
import { api } from "@/services/api";
import type { Connection, TableInfo } from "../connection-list/types";
import { isRedisClusterDatabaseList } from "@/components/business/Redis/redis-utils";

export function useRedisKeys(params: {
  connectionsRef: React.MutableRefObject<Connection[]>;
  setConnections: (fn: (prev: Connection[]) => Connection[]) => void;
  searchTerm: string;
}) {
  const { connectionsRef, setConnections, searchTerm } = params;

  const redisKeyToTableInfo = (key: {
    key: string;
    keyType: string;
    ttl: number;
  }): TableInfo => ({
    name: key.key,
    schema: key.keyType,
    columns: [
      {
        name:
          key.ttl > 0
            ? `ttl ${key.ttl}s`
            : key.ttl === -1
              ? "persist"
              : "expired",
        type: key.keyType,
      },
    ],
  });

  const loadRedisKeysPage = useCallback(
    async (
      connectionId: string,
      databaseName: string,
      cursor: string,
      append: boolean,
    ): Promise<TableInfo[]> => {
      const targetConnection = connectionsRef.current.find(
        (conn) => conn.id === connectionId,
      );
      const isRedisCluster =
        targetConnection &&
        isRedisClusterDatabaseList(targetConnection.databases);
      if (isRedisCluster && !searchTerm.trim()) {
        setConnections((prev) =>
          prev.map((conn) => {
            if (conn.id !== connectionId) return conn;
            return {
              ...conn,
              databases: conn.databases.map((db) => {
                if (db.name !== databaseName) return db;
                return {
                  ...db,
                  tables: [],
                  redisCursor: "0",
                  redisIsPartial: false,
                  redisRequiresPattern: true,
                };
              }),
            };
          }),
        );
        return [];
      }
      const pattern = searchTerm.trim() ? `*${searchTerm.trim()}*` : "*";
      const response = await api.redis.scanKeys({
        id: Number(connectionId),
        database: databaseName,
        cursor,
        pattern,
        limit: 200,
      });
      const newKeys = response.keys.map(redisKeyToTableInfo);
      setConnections((prev) =>
        prev.map((conn) => {
          if (conn.id !== connectionId) return conn;
          return {
            ...conn,
            databases: conn.databases.map((db) => {
              if (db.name !== databaseName) return db;
              return {
                ...db,
                tables: append ? [...db.tables, ...newKeys] : newKeys,
                redisCursor: response.cursor,
                redisIsPartial: response.isPartial,
                redisRequiresPattern: false,
              };
            }),
          };
        }),
      );
      return newKeys;
    },
    [searchTerm],
  );

  return { loadRedisKeysPage, redisKeyToTableInfo };
}
