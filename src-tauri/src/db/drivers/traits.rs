use crate::models::{
    EventInfo, PackageInfo, QueryResult, RoutineInfo, SchemaForeignKey, SchemaOverview,
    SequenceInfo, SynonymInfo, TableDataResponse, TableInfo, TableMetadata, TableStructure,
    TypeInfo,
};
use async_trait::async_trait;

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    async fn test_connection(&self) -> Result<(), String>;
    async fn list_databases(&self) -> Result<Vec<String>, String>;
    async fn list_tables(&self, schema: Option<String>) -> Result<Vec<TableInfo>, String>;
    async fn list_routines(&self, schema: Option<String>) -> Result<Vec<RoutineInfo>, String> {
        let _ = schema;
        Ok(vec![])
    }
    async fn list_events(&self, _schema: Option<String>) -> Result<Vec<EventInfo>, String> {
        Ok(vec![])
    }
    async fn list_sequences(&self, _schema: Option<String>) -> Result<Vec<SequenceInfo>, String> {
        Ok(vec![])
    }
    async fn list_types(&self, _schema: Option<String>) -> Result<Vec<TypeInfo>, String> {
        Ok(vec![])
    }
    async fn list_synonyms(&self, _schema: Option<String>) -> Result<Vec<SynonymInfo>, String> {
        Ok(vec![])
    }
    async fn list_packages(&self, _schema: Option<String>) -> Result<Vec<PackageInfo>, String> {
        Ok(vec![])
    }
    async fn get_routine_ddl(
        &self,
        schema: String,
        name: String,
        routine_type: String,
    ) -> Result<String, String> {
        let _ = (schema, name, routine_type);
        Err("[UNSUPPORTED] Routines are not supported for this driver".to_string())
    }
    async fn get_table_structure(
        &self,
        schema: String,
        table: String,
    ) -> Result<TableStructure, String>;
    async fn get_table_metadata(
        &self,
        schema: String,
        table: String,
    ) -> Result<TableMetadata, String>;
    async fn get_table_ddl(&self, schema: String, table: String) -> Result<String, String>;
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
    ) -> Result<TableDataResponse, String>;
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
    ) -> Result<TableDataResponse, String>;
    async fn execute_query(&self, sql: String) -> Result<QueryResult, String>;
    async fn execute_query_with_id(
        &self,
        sql: String,
        query_id: Option<&str>,
    ) -> Result<QueryResult, String> {
        let _ = query_id;
        self.execute_query(sql).await
    }
    async fn get_schema_overview(&self, schema: Option<String>) -> Result<SchemaOverview, String>;
    async fn get_schema_foreign_keys(
        &self,
        _database: Option<&str>,
    ) -> Result<Vec<SchemaForeignKey>, String> {
        Ok(vec![])
    }
    async fn close(&self);
}
