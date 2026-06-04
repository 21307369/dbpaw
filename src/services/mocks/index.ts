import { handleQuery } from "./query";
import { handleMetadata } from "./metadata";
import { handleTableData } from "./tableData";
import { handleConnections } from "./connections";
import { handleQueries } from "./queries";
import { handleTransfer } from "./transfer";
import { handleElasticsearch } from "./elasticsearch";
import { handleMongodb } from "./mongodb";
import { handleAi } from "./ai";
import { handleSystem } from "./system";
import { handleMcp } from "./mcp";

const handlers = [
  handleQuery,
  handleMetadata,
  handleTableData,
  handleConnections,
  handleQueries,
  handleTransfer,
  handleElasticsearch,
  handleMongodb,
  handleAi,
  handleSystem,
  handleMcp,
];

export async function invokeMock<T>(cmd: string, args?: any): Promise<T> {
  console.log(`[Mock] ${cmd}`, args);
  for (const handler of handlers) {
    const result = handler(cmd, args);
    if (result !== null) return result as Promise<T>;
  }
  console.warn(`[Mock] Unknown command: ${cmd}`);
  throw new Error(`Mock: Unknown command '${cmd}'`);
}

// Re-export mock data for backward compatibility
export { mockConnections, mockGetMysqlCharsets, mockGetMysqlCollations, mockTestConnectionEphemeral } from "./connections";
export {
  mockTables, mockTableStructure, mockTableMetadata, mockSchemaForeignKeys,
  mockSchemaOverview, mockDatabases, mockListTables, mockGetTableStructure,
  mockGetTableDDL, mockListEvents, mockListSequences, mockListTypes,
  mockListSynonyms, mockListPackages, mockListRoutines, mockGetRoutineDDL,
  mockGetTableMetadata, mockGetSchemaForeignKeys, mockListTablesByConn,
  mockListDatabases, mockListDatabasesById, mockGetSchemaOverview,
} from "./metadata";
export {
  mockQueryResult, mockMultipleResultSets, mockComplexTypeData, mockArrayTypeData,
  mockExecuteQuery, mockCancelQuery, mockExecuteByConn,
  mockListSqlExecutionLogs, mockListRedisCommandLogs,
} from "./query";
export { mockTableData, mockGetTableData, mockGetTableDataByConn } from "./tableData";
export { mockSavedQueries, mockGetSavedQueries, mockSaveQuery, mockUpdateSavedQuery, mockDeleteSavedQuery } from "./queries";
export { mockExportTableData, mockExportDatabaseSql, mockExportQueryResult, mockImportSqlFile } from "./transfer";
export {
  mockMcpStatus, mockMcpStart, mockMcpStop, mockMcpGetTools,
  mockMcpDetectClients, mockMcpConfigureClient,
} from "./mcp";
