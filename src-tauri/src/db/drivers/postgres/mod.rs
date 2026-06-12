pub mod connection;
pub mod metadata;
pub mod query;
pub mod table_data;

use super::{
    DatabaseDriver, DriverCapabilities, DriverResult, ForeignKeyDriver, RoutineDriver,
    SequenceDriver, TypeDriver,
};
use crate::models::{
    ConnectionForm, QueryResult, RoutineInfo, SchemaForeignKey, SchemaOverview, SequenceInfo,
    TableDataResponse, TableInfo, TableMetadata, TableStructure, TypeInfo,
};
use async_trait::async_trait;

pub struct PostgresDriver {
    pub connection: connection::PostgresConnection,
    pub metadata: metadata::PostgresMetadata,
    pub query: query::PostgresQuery,
    pub table_data: table_data::PostgresTableData,
}

impl PostgresDriver {
    pub async fn connect(form: &ConnectionForm) -> DriverResult<Self> {
        let conn = connection::PostgresConnection::new(form).await?;
        let pool = conn.pool.clone();

        Ok(Self {
            connection: conn,
            metadata: metadata::PostgresMetadata { pool: pool.clone() },
            query: query::PostgresQuery { pool: pool.clone() },
            table_data: table_data::PostgresTableData { pool },
        })
    }
}

#[async_trait]
impl DatabaseDriver for PostgresDriver {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities::ROUTINES
            | DriverCapabilities::SEQUENCES
            | DriverCapabilities::TYPES
            | DriverCapabilities::FOREIGN_KEYS
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

    async fn get_schema_overview(&self, schema: Option<String>) -> DriverResult<SchemaOverview> {
        self.metadata.get_schema_overview(schema).await
    }
}

#[async_trait]
impl RoutineDriver for PostgresDriver {
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
impl SequenceDriver for PostgresDriver {
    async fn list_sequences(&self, schema: Option<String>) -> DriverResult<Vec<SequenceInfo>> {
        self.metadata.list_sequences(schema).await
    }
}

#[async_trait]
impl TypeDriver for PostgresDriver {
    async fn list_types(&self, schema: Option<String>) -> DriverResult<Vec<TypeInfo>> {
        self.metadata.list_types(schema).await
    }
}

#[async_trait]
impl ForeignKeyDriver for PostgresDriver {
    async fn get_schema_foreign_keys(
        &self,
        database: Option<&str>,
    ) -> DriverResult<Vec<SchemaForeignKey>> {
        self.metadata.get_schema_foreign_keys(database).await
    }
}
