import { useEffect, useMemo, useRef } from "react";
import type { TreeCallbacks } from "@/lib/tree-adapters/types.tsx";

interface UseTreeCallbacksParams {
  openRedisKey: (
    connection: string,
    database: string,
    redisKey: string,
    connectionId: number,
    driver: string,
  ) => void;
  openRedisBrowser: (
    connection: string,
    database: string,
    connectionId: number,
    driver: string,
  ) => void;
  openRedisConsole: (
    connection: string,
    database: string,
    connectionId: number,
    driver: string,
  ) => void;
  openRedisServerInfo: (
    connection: string,
    database: string,
    connectionId: number,
    driver: string,
  ) => void;
  openElasticsearchIndex: (
    connection: string,
    index: string,
    connectionId: number,
    driver: string,
  ) => void;
}

export function useTreeCallbacks({
  openRedisKey,
  openRedisBrowser,
  openRedisConsole,
  openRedisServerInfo,
  openElasticsearchIndex,
}: UseTreeCallbacksParams): TreeCallbacks {
  const handlersRef = useRef({
    openRedisKey,
    openRedisBrowser,
    openRedisConsole,
    openRedisServerInfo,
    openElasticsearchIndex,
  });

  useEffect(() => {
    handlersRef.current = {
      openRedisKey,
      openRedisBrowser,
      openRedisConsole,
      openRedisServerInfo,
      openElasticsearchIndex,
    };
  });

  return useMemo<TreeCallbacks>(
    () => ({
      onKeySelect: (ctx) => {
        handlersRef.current.openRedisKey(
          ctx.connectionName,
          ctx.databaseName,
          ctx.leafName,
          Number(ctx.connectionId),
          ctx.connectionType,
        );
      },
      onCreateKey: (ctx) => {
        handlersRef.current.openRedisKey(
          ctx.connectionName,
          ctx.databaseName,
          "",
          Number(ctx.connectionId),
          ctx.connectionType,
        );
      },
      onOpenBrowser: (ctx) => {
        handlersRef.current.openRedisBrowser(
          ctx.connectionName,
          ctx.databaseName,
          Number(ctx.connectionId),
          ctx.connectionType,
        );
      },
      onOpenConsole: (ctx) => {
        handlersRef.current.openRedisConsole(
          ctx.connectionName,
          ctx.databaseName,
          Number(ctx.connectionId),
          ctx.connectionType,
        );
      },
      onOpenServerInfo: (ctx) => {
        handlersRef.current.openRedisServerInfo(
          ctx.connectionName,
          ctx.databaseName,
          Number(ctx.connectionId),
          ctx.connectionType,
        );
      },
      onOpenIndex: (ctx) => {
        handlersRef.current.openElasticsearchIndex(
          ctx.connectionName,
          ctx.leafName,
          Number(ctx.connectionId),
          ctx.connectionType,
        );
      },
    }),
    [],
  );
}
