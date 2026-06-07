use crate::error::AppError;
use crate::models::{
    EventInfo, PackageInfo, QueryResult, RoutineInfo, SchemaForeignKey, SchemaOverview,
    SequenceInfo, SynonymInfo, TableDataResponse, TableInfo, TableMetadata, TableStructure,
    TypeInfo,
};
use async_trait::async_trait;

pub type DriverResult<T> = Result<T, AppError>;

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    async fn test_connection(&self) -> DriverResult<()>;
    async fn list_databases(&self) -> DriverResult<Vec<String>>;
    async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>>;
    async fn list_routines(&self, schema: Option<String>) -> DriverResult<Vec<RoutineInfo>> {
        let _ = schema;
        Ok(vec![])
    }
    async fn list_events(&self, _schema: Option<String>) -> DriverResult<Vec<EventInfo>> {
        Ok(vec![])
    }
    async fn list_sequences(&self, _schema: Option<String>) -> DriverResult<Vec<SequenceInfo>> {
        Ok(vec![])
    }
    async fn list_types(&self, _schema: Option<String>) -> DriverResult<Vec<TypeInfo>> {
        Ok(vec![])
    }
    async fn list_synonyms(&self, _schema: Option<String>) -> DriverResult<Vec<SynonymInfo>> {
        Ok(vec![])
    }
    async fn list_packages(&self, _schema: Option<String>) -> DriverResult<Vec<PackageInfo>> {
        Ok(vec![])
    }
    async fn get_routine_ddl(
        &self,
        schema: String,
        name: String,
        routine_type: String,
    ) -> DriverResult<String> {
        let _ = (schema, name, routine_type);
        Err(AppError::unsupported(
            "Routines are not supported for this driver",
        ))
    }
    async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableStructure>;
    async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableMetadata>;
    async fn get_table_ddl(&self, schema: String, table: String) -> DriverResult<String>;
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
    ) -> DriverResult<TableDataResponse>;
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
    ) -> DriverResult<TableDataResponse>;
    async fn execute_query(&self, sql: String) -> DriverResult<QueryResult>;
    async fn execute_query_with_id(
        &self,
        sql: String,
        query_id: Option<&str>,
    ) -> DriverResult<QueryResult> {
        let _ = query_id;
        self.execute_query(sql).await
    }
    async fn get_schema_overview(&self, schema: Option<String>) -> DriverResult<SchemaOverview>;
    async fn get_schema_foreign_keys(
        &self,
        _database: Option<&str>,
    ) -> DriverResult<Vec<SchemaForeignKey>> {
        Ok(vec![])
    }
    async fn close(&self);
}
