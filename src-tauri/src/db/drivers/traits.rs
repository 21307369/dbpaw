use crate::error::AppError;
use crate::models::{
    EventInfo, PackageInfo, QueryResult, RoutineInfo, SchemaForeignKey, SchemaOverview,
    SequenceInfo, SynonymInfo, TableDataResponse, TableInfo, TableMetadata, TableStructure,
    TypeInfo,
};
use async_trait::async_trait;
use bitflags::bitflags;

pub type DriverResult<T> = Result<T, AppError>;

bitflags! {
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct DriverCapabilities: u32 {
        const ROUTINES      = 0b0000_0001;
        const EVENTS        = 0b0000_0010;
        const SEQUENCES     = 0b0000_0100;
        const TYPES         = 0b0000_1000;
        const SYNONYMS      = 0b0001_0000;
        const PACKAGES      = 0b0010_0000;
        const FOREIGN_KEYS  = 0b0100_0000;
        const QUERY_WITH_ID = 0b1000_0000;
    }
}

#[async_trait]
pub trait DatabaseDriver: Send + Sync {
    fn capabilities(&self) -> DriverCapabilities {
        DriverCapabilities::empty()
    }

    async fn test_connection(&self) -> DriverResult<()>;
    async fn list_databases(&self) -> DriverResult<Vec<String>>;
    async fn list_tables(&self, schema: Option<String>) -> DriverResult<Vec<TableInfo>>;
    async fn list_routines(&self, schema: Option<String>) -> DriverResult<Vec<RoutineInfo>> {
        let _ = schema;
        Err(AppError::unsupported("Routines are not supported for this driver"))
    }
    async fn list_events(&self, _schema: Option<String>) -> DriverResult<Vec<EventInfo>> {
        Err(AppError::unsupported("Events are not supported for this driver"))
    }
    async fn list_sequences(&self, _schema: Option<String>) -> DriverResult<Vec<SequenceInfo>> {
        Err(AppError::unsupported("Sequences are not supported for this driver"))
    }
    async fn list_types(&self, _schema: Option<String>) -> DriverResult<Vec<TypeInfo>> {
        Err(AppError::unsupported("Types are not supported for this driver"))
    }
    async fn list_synonyms(&self, _schema: Option<String>) -> DriverResult<Vec<SynonymInfo>> {
        Err(AppError::unsupported("Synonyms are not supported for this driver"))
    }
    async fn list_packages(&self, _schema: Option<String>) -> DriverResult<Vec<PackageInfo>> {
        Err(AppError::unsupported("Packages are not supported for this driver"))
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
        Err(AppError::unsupported(
            "Foreign keys are not supported for this driver",
        ))
    }
    async fn close(&self);
}

// Capability sub-traits — drivers implement these to signal support for optional features

#[async_trait]
pub trait RoutineDriver: DatabaseDriver {
    async fn list_routines(&self, schema: Option<String>) -> DriverResult<Vec<RoutineInfo>>;
    async fn get_routine_ddl(
        &self,
        schema: String,
        name: String,
        routine_type: String,
    ) -> DriverResult<String>;
}

#[async_trait]
pub trait EventDriver: DatabaseDriver {
    async fn list_events(&self, schema: Option<String>) -> DriverResult<Vec<EventInfo>>;
}

#[async_trait]
pub trait SequenceDriver: DatabaseDriver {
    async fn list_sequences(&self, schema: Option<String>) -> DriverResult<Vec<SequenceInfo>>;
}

#[async_trait]
pub trait TypeDriver: DatabaseDriver {
    async fn list_types(&self, schema: Option<String>) -> DriverResult<Vec<TypeInfo>>;
}

#[async_trait]
pub trait SynonymDriver: DatabaseDriver {
    async fn list_synonyms(&self, schema: Option<String>) -> DriverResult<Vec<SynonymInfo>>;
}

#[async_trait]
pub trait PackageDriver: DatabaseDriver {
    async fn list_packages(&self, schema: Option<String>) -> DriverResult<Vec<PackageInfo>>;
}

#[async_trait]
pub trait ForeignKeyDriver: DatabaseDriver {
    async fn get_schema_foreign_keys(
        &self,
        database: Option<&str>,
    ) -> DriverResult<Vec<SchemaForeignKey>>;
}
