pub mod connection;
pub mod metadata;
pub mod query;
pub mod table_data;

use super::{
    DatabaseDriver, DriverCapabilities, DriverResult, EventDriver, ForeignKeyDriver, RoutineDriver,
};
use crate::error::AppError;
use crate::models::{
    ConnectionForm, EventInfo, QueryResult, RoutineInfo, SchemaForeignKey, SchemaOverview,
    TableDataResponse, TableInfo, TableMetadata, TableStructure,
};
use async_trait::async_trait;

pub struct MysqlDriver {
    pub connection: connection::MysqlConnection,
    pub metadata: metadata::MysqlMetadata,
    pub query: query::MysqlQuery,
    pub table_data: table_data::MysqlTableData,
}

impl MysqlDriver {
    pub async fn connect(form: &ConnectionForm) -> Result<Self, AppError> {
        let conn = connection::MysqlConnection::connect(form).await?;
        let pool = conn.pool.clone();
        let driver_name = conn.driver_name.clone();
        let compatibility_mode = conn.compatibility_mode;

        Ok(Self {
            connection: conn,
            metadata: metadata::MysqlMetadata {
                pool: pool.clone(),
                driver_name: driver_name.clone(),
                compatibility_mode,
            },
            query: query::MysqlQuery {
                pool: pool.clone(),
                driver_name: driver_name.clone(),
                compatibility_mode,
            },
            table_data: table_data::MysqlTableData {
                pool,
                driver_name,
                compatibility_mode,
            },
        })
    }

    pub async fn kill_query(&self, thread_id: u64) -> DriverResult<()> {
        self.query.kill_query(thread_id).await
    }

    pub async fn lookup_query_thread(query_id: &str) -> Option<u64> {
        query::MysqlQuery::lookup_query_thread(query_id).await
    }

    pub async fn unregister_query_thread(query_id: &str) {
        query::MysqlQuery::unregister_query_thread(query_id).await;
    }
}

#[async_trait]
impl DatabaseDriver for MysqlDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities::ROUTINES
            | DriverCapabilities::EVENTS
            | DriverCapabilities::FOREIGN_KEYS
            | DriverCapabilities::QUERY_WITH_ID
    }

    async fn close(&self) {
        self.connection.close().await;
    }

    async fn test_connection(&self) -> DriverResult<()> {
        self.connection.test_connection().await
    }

    async fn list_databases(&self) -> DriverResult<Vec<String>> {
        self.metadata.list_databases().await
    }

    async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>> {
        self.metadata.list_tables(schema).await
    }

    async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableStructure> {
        self.metadata.get_table_structure(schema, table).await
    }

    async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableMetadata> {
        self.metadata.get_table_metadata(schema, table).await
    }

    async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String> {
        self.metadata.get_table_ddl(schema, table).await
    }

    async fn get_table_data(
        &self,
        schema: String,
        table: String,
        page: i64,
        limit: i64,
        sort_column: Option<String>,
        sort_direction: Option<String>,
        filter: Option<String>,
        order_by: Option<String>,
    ) -> DriverResult<TableDataResponse> {
        self.table_data
            .get_table_data(
                schema,
                table,
                page,
                limit,
                sort_column,
                sort_direction,
                filter,
                order_by,
            )
            .await
    }

    async fn get_table_data_chunk(
        &self,
        schema: String,
        table: String,
        page: i64,
        limit: i64,
        sort_column: Option<String>,
        sort_direction: Option<String>,
        filter: Option<String>,
        order_by: Option<String>,
    ) -> DriverResult<TableDataResponse> {
        self.table_data
            .get_table_data_chunk(
                schema,
                table,
                page,
                limit,
                sort_column,
                sort_direction,
                filter,
                order_by,
            )
            .await
    }

    async fn execute_query(&self, sql: String) -> DriverResult<QueryResult> {
        self.query.execute_query(sql).await
    }

    async fn execute_query_with_id(
        &self,
        sql: String,
        query_id: Option<&str>,
    ) -> DriverResult<QueryResult> {
        self.query.execute_query_with_id(sql, query_id).await
    }

    async fn get_schema_overview(&self, schema: Option<String>) -> DriverResult<SchemaOverview> {
        self.metadata.get_schema_overview(schema).await
    }
}

#[async_trait]
impl RoutineDriver for MysqlDriver {
    async fn list_routines(&self, schema: Option<String>) -> DriverResult<Vec<RoutineInfo>> {
        self.metadata.list_routines(schema).await
    }

    async fn get_routine_ddl(
        &self,
        schema: String,
        name: String,
        routine_type: String,
    ) -> DriverResult<String> {
        self.metadata
            .get_routine_ddl(schema, name, routine_type)
            .await
    }
}

#[async_trait]
impl EventDriver for MysqlDriver {
    async fn list_events(&self, schema: Option<String>) -> DriverResult<Vec<EventInfo>> {
        self.metadata.list_events(schema).await
    }
}

#[async_trait]
impl ForeignKeyDriver for MysqlDriver {
    async fn get_schema_foreign_keys(
        &self,
        database: Option<&str>,
    ) -> DriverResult<Vec<SchemaForeignKey>> {
        self.metadata.get_schema_foreign_keys(database).await
    }
}
