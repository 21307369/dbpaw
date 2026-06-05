import type { RoutineType, SchemaOverview } from "@/services/api";
import type { SingleResultState } from "@/lib/queryExecutionState";

export interface QueryResults {
  data: any[];
  columns: string[];
  executionTime: string;
  error?: string;
  resultSets?: SingleResultState[];
  activeResultSetIndex?: number;
}

export interface EditorTabItem {
  type: "editor";
  id: string;
  title: string;
  connectionId?: number;
  connection?: string;
  database?: string;
  driver?: string;
  sqlContent?: string;
  lastSavedSql?: string;
  isDirty?: boolean;
  queryResults?: QueryResults | null;
  activeQueryId?: string;
  lastQueryId?: string;
  schemaOverview?: SchemaOverview;
  savedQueryId?: number;
  savedQueryDescription?: string;
  availableDatabases?: string[];
}

export interface TableTabItem {
  type: "table";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  schema?: string;
  tableName?: string;
  connectionId?: number;
  driver?: string;
  data?: any[];
  columns?: string[];
  total?: number;
  page?: number;
  pageSize?: number;
  executionTimeMs?: number;
  isLoading?: boolean;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  filter?: string;
  orderBy?: string;
}

export interface DdlTabItem {
  type: "ddl";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
  tableName?: string;
}

export interface RoutineTabItem {
  type: "routine";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  schema?: string;
  connectionId?: number;
  driver?: string;
  routineName?: string;
  routineType?: RoutineType;
}

export interface CreateTableTabItem {
  type: "create-table";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
  driver?: string;
}

export interface AlterTableTabItem {
  type: "alter-table";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
  tableName?: string;
  driver?: string;
}

export interface RedisKeyTabItem {
  type: "redis-key";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
  redisKey?: string;
}

export interface RedisConsoleTabItem {
  type: "redis-console";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
}

export interface RedisBrowserTabItem {
  type: "redis-browser";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
}

export interface RedisServerInfoTabItem {
  type: "redis-server-info";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
}

export interface ElasticsearchIndexTabItem {
  type: "elasticsearch-index";
  id: string;
  title: string;
  connection?: string;
  database?: string;
  connectionId?: number;
  driver?: string;
  elasticsearchIndex?: string;
}

export interface ERDiagramTabItem {
  type: "er-diagram";
  id: string;
  title: string;
  connectionId?: number;
  database?: string;
  schema?: string;
}

export type TabItem =
  | EditorTabItem
  | TableTabItem
  | DdlTabItem
  | RoutineTabItem
  | CreateTableTabItem
  | AlterTableTabItem
  | RedisKeyTabItem
  | RedisConsoleTabItem
  | RedisBrowserTabItem
  | RedisServerInfoTabItem
  | ElasticsearchIndexTabItem
  | ERDiagramTabItem;
