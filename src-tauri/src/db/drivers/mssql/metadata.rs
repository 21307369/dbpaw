use super::super::DriverResult;
use crate::error::AppError;
use crate::models::{
    ColumnInfo, ColumnSchema, ForeignKeyInfo, IndexInfo, RoutineInfo, SchemaForeignKey,
    SchemaOverview, SynonymInfo, TableInfo, TableMetadata, TableSchema, TableStructure,
};
use std::collections::{HashMap, HashSet};

use super::connection::validation_error;
use super::query::escape_literal;
use super::MssqlDriver;

#[allow(dead_code)]
pub(crate) struct MssqlColumnInfo {
    pub name: String,
    pub data_type: String,
    pub full_type: String,
    pub is_nullable: bool,
    pub is_identity: bool,
    pub is_computed: bool,
    pub computed_definition: Option<String>,
    pub default_definition: Option<String>,
    pub default_constraint_name: Option<String>,
    pub comment: Option<String>,
}

pub(crate) struct MssqlKeyConstraint {
    pub name: String,
    pub constraint_type: String,
    pub columns: Vec<String>,
}

pub(crate) fn routine_type_sql_filter(routine_type: &str) -> DriverResult<&'static str> {
    if routine_type.eq_ignore_ascii_case("procedure") {
        Ok("('P')")
    } else if routine_type.eq_ignore_ascii_case("function") {
        Ok("('FN','IF','TF','FS','FT')")
    } else {
        Err(validation_error(format!(
            "Unsupported routine type '{}'",
            routine_type
        )))
    }
}

pub(crate) fn quote_ident(ident: &str) -> DriverResult<String> {
    let trimmed = ident.trim();
    if trimmed.is_empty() {
        return Err(validation_error("identifier cannot be empty"));
    }
    if trimmed.chars().any(|c| c == '\0') {
        return Err(validation_error("identifier contains null byte"));
    }
    Ok(format!("[{}]", trimmed.replace(']', "]]")))
}

pub(crate) fn table_ref(schema: &str, table: &str) -> DriverResult<String> {
    Ok(format!("{}.{}", quote_ident(schema)?, quote_ident(table)?))
}

pub(crate) fn mssql_full_type_string(
    data_type: &str,
    max_length: i64,
    precision: i64,
    scale: i64,
) -> String {
    let dt = data_type.to_ascii_lowercase();
    match dt.as_str() {
        "varchar" | "char" | "varbinary" | "binary" => {
            let len = if max_length == -1 {
                "MAX".to_string()
            } else {
                max_length.to_string()
            };
            format!("{}({})", data_type, len)
        }
        "nvarchar" | "nchar" => {
            let len = if max_length == -1 {
                "MAX".to_string()
            } else {
                max_length.to_string()
            };
            format!("{}({})", data_type, len)
        }
        "decimal" | "numeric" => format!("{}({},{})", data_type, precision, scale),
        "datetime2" | "datetimeoffset" | "time" => {
            if scale > 0 {
                format!("{}({})", data_type, scale)
            } else {
                data_type.to_string()
            }
        }
        _ => data_type.to_string(),
    }
}

pub(crate) fn build_mssql_select_list(columns: &[(String, String)]) -> DriverResult<String> {
    let mut parts = Vec::new();
    for (name, data_type) in columns {
        let ident = quote_ident(name)?;
        let dt = data_type.to_ascii_lowercase();
        let expr = match dt.as_str() {
            "sql_variant" | "geometry" | "geography" | "hierarchyid" => {
                format!("CAST({} AS NVARCHAR(MAX)) AS {}", ident, ident)
            }
            _ => ident,
        };
        parts.push(expr);
    }
    Ok(parts.join(", "))
}

fn render_mssql_create_table_ddl(
    schema: &str,
    table: &str,
    columns: &[MssqlColumnInfo],
    key_constraints: &[MssqlKeyConstraint],
    check_constraints: &[(String, String)],
    foreign_keys: &[ForeignKeyInfo],
    indexes: &[IndexInfo],
) -> String {
    let mut lines: Vec<String> = Vec::new();

    for col in columns {
        if col.is_computed {
            let def = col.computed_definition.as_deref().unwrap_or("(NULL)");
            lines.push(format!(
                "    {} AS {}",
                quote_ident(&col.name).unwrap_or_else(|_| col.name.clone()),
                def
            ));
            continue;
        }
        let mut parts = vec![
            format!(
                "    {}",
                quote_ident(&col.name).unwrap_or_else(|_| col.name.clone())
            ),
            col.full_type.clone(),
        ];
        if !col.is_nullable {
            parts.push("NOT NULL".to_string());
        }
        if let Some(ref def) = col.default_definition {
            parts.push(format!("DEFAULT {}", def));
        }
        lines.push(parts.join(" "));
    }

    for kc in key_constraints {
        let col_list: Vec<String> = kc
            .columns
            .iter()
            .map(|c| quote_ident(c).unwrap_or_else(|_| c.clone()))
            .collect();
        lines.push(format!(
            "    CONSTRAINT {} {} ({})",
            quote_ident(&kc.name).unwrap_or_else(|_| kc.name.clone()),
            kc.constraint_type,
            col_list.join(", ")
        ));
    }

    for (name, definition) in check_constraints {
        lines.push(format!(
            "    CONSTRAINT {} CHECK ({})",
            quote_ident(name).unwrap_or_else(|_| name.clone()),
            definition
        ));
    }

    for fk in foreign_keys {
        let fk_cols: Vec<String> =
            vec![quote_ident(&fk.column).unwrap_or_else(|_| fk.column.clone())];
        let pk_cols: Vec<String> = vec![
            quote_ident(&fk.referenced_column).unwrap_or_else(|_| fk.referenced_column.clone())
        ];
        let ref_table = format!(
            "{}.{}",
            quote_ident(&fk.referenced_schema.as_deref().unwrap_or("dbo"))
                .unwrap_or_else(|_| "dbo".to_string()),
            quote_ident(&fk.referenced_table).unwrap_or_else(|_| fk.referenced_table.clone())
        );
        let mut fk_line = format!(
            "    CONSTRAINT {} FOREIGN KEY ({}) REFERENCES {} ({})",
            quote_ident(&fk.name).unwrap_or_else(|_| fk.name.clone()),
            fk_cols.join(", "),
            ref_table,
            pk_cols.join(", ")
        );
        if let Some(ref on_update) = fk.on_update {
            fk_line.push_str(&format!(" ON UPDATE {}", on_update));
        }
        if let Some(ref on_delete) = fk.on_delete {
            fk_line.push_str(&format!(" ON DELETE {}", on_delete));
        }
        lines.push(fk_line);
    }

    let mut result = format!(
        "CREATE TABLE {}.{} (\n",
        quote_ident(schema).unwrap_or_else(|_| schema.to_string()),
        quote_ident(table).unwrap_or_else(|_| table.to_string())
    );
    result.push_str(&lines.join(",\n"));
    result.push_str("\n);\n");

    for idx in indexes {
        let unique = if idx.unique { "UNIQUE " } else { "" };
        let col_list: Vec<String> = idx
            .columns
            .iter()
            .map(|c| quote_ident(c).unwrap_or_else(|_| c.clone()))
            .collect();
        result.push_str(&format!(
            "\nCREATE {}INDEX {} ON {}.{} ({});",
            unique,
            quote_ident(&idx.name).unwrap_or_else(|_| idx.name.clone()),
            quote_ident(schema).unwrap_or_else(|_| schema.to_string()),
            quote_ident(table).unwrap_or_else(|_| table.to_string()),
            col_list.join(", ")
        ));
    }

    result
}

fn quote_ident_or(name: &str) -> String {
    quote_ident(name).unwrap_or_else(|_| format!("[{}]", name))
}

impl MssqlDriver {
    pub(crate) async fn load_mssql_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> DriverResult<Vec<MssqlColumnInfo>> {
        let sql = format!(
            "SELECT c.name, t.name AS data_type, c.is_nullable, c.max_length, c.precision, c.scale, c.is_identity, c.is_computed, cc.definition AS computed_definition, dc.definition AS default_definition, dc.name AS default_constraint_name FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id JOIN sys.tables tbl ON tbl.object_id = c.object_id JOIN sys.schemas s ON s.schema_id = tbl.schema_id LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id WHERE s.name = '{}' AND tbl.name = '{}' ORDER BY c.column_id",
            escape_literal(schema), escape_literal(table)
        );
        let rows = self.fetch_rows(&sql).await?;

        let comment_sql = format!(
            "SELECT c.name, CAST(ep.value AS NVARCHAR(4000)) FROM sys.extended_properties ep JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id JOIN sys.tables t ON t.object_id = c.object_id JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE ep.name = 'MS_Description' AND s.name = '{}' AND t.name = '{}'",
            escape_literal(schema), escape_literal(table)
        );
        let comment_rows = self.fetch_rows(&comment_sql).await?;
        let comment_map: HashMap<String, String> = comment_rows
            .iter()
            .filter_map(|row| {
                let val = Self::parse_string(row, 1);
                if val.is_empty() {
                    None
                } else {
                    Some((Self::parse_string(row, 0), val))
                }
            })
            .collect();

        let mut cols = Vec::new();
        for row in rows {
            let data_type = Self::parse_string(&row, 1);
            let max_length_raw = Self::parse_i64(&row, 3);
            let max_length = if data_type.eq_ignore_ascii_case("nvarchar")
                || data_type.eq_ignore_ascii_case("nchar")
            {
                max_length_raw / 2
            } else {
                max_length_raw
            };
            let precision = Self::parse_i64(&row, 4);
            let scale = Self::parse_i64(&row, 5);
            let full_type = mssql_full_type_string(&data_type, max_length, precision, scale);
            let name = Self::parse_string(&row, 0);
            let computed_def = Self::parse_string(&row, 8);
            let default_def = Self::parse_string(&row, 9);
            let default_cn = Self::parse_string(&row, 10);
            cols.push(MssqlColumnInfo {
                name: name.clone(),
                data_type,
                full_type,
                is_nullable: Self::parse_i64(&row, 2) == 1,
                is_identity: Self::parse_i64(&row, 6) == 1,
                is_computed: Self::parse_i64(&row, 7) == 1,
                computed_definition: if computed_def.is_empty() {
                    None
                } else {
                    Some(computed_def)
                },
                default_definition: if default_def.is_empty() {
                    None
                } else {
                    Some(default_def)
                },
                default_constraint_name: if default_cn.is_empty() {
                    None
                } else {
                    Some(default_cn)
                },
                comment: comment_map.get(&name).cloned(),
            });
        }
        Ok(cols)
    }

    pub(crate) async fn load_mssql_key_constraints(
        &self,
        schema: &str,
        table: &str,
    ) -> DriverResult<Vec<MssqlKeyConstraint>> {
        let sql = format!(
            "SELECT kc.name, kc.type_desc, c.name AS col_name, ic.key_ordinal FROM sys.key_constraints kc JOIN sys.index_columns ic ON ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id JOIN sys.tables t ON t.object_id = kc.parent_object_id JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = '{}' AND t.name = '{}' ORDER BY kc.name, ic.key_ordinal",
            escape_literal(schema), escape_literal(table)
        );
        let rows = self.fetch_rows(&sql).await?;
        let mut map: HashMap<String, (String, Vec<(i64, String)>)> = HashMap::new();
        for row in rows {
            let name = Self::parse_string(&row, 0);
            let type_desc = Self::parse_string(&row, 1);
            let col = Self::parse_string(&row, 2);
            let ord = Self::parse_i64(&row, 3);
            map.entry(name)
                .or_insert((type_desc, Vec::new()))
                .1
                .push((ord, col));
        }
        Ok(map
            .into_iter()
            .map(|(name, (type_desc, mut cols))| {
                cols.sort_by_key(|(ord, _)| *ord);
                MssqlKeyConstraint {
                    name,
                    constraint_type: if type_desc.contains("PRIMARY") {
                        "PRIMARY KEY".to_string()
                    } else {
                        "UNIQUE".to_string()
                    },
                    columns: cols.into_iter().map(|(_, c)| c).collect(),
                }
            })
            .collect())
    }

    pub(crate) async fn load_mssql_check_constraints(
        &self,
        schema: &str,
        table: &str,
    ) -> DriverResult<Vec<(String, String)>> {
        let sql = format!(
            "SELECT cc.name, cc.definition FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id = cc.parent_object_id JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = '{}' AND t.name = '{}' AND cc.is_ms_shipped = 0 ORDER BY cc.name",
            escape_literal(schema), escape_literal(table)
        );
        let rows = self.fetch_rows(&sql).await?;
        Ok(rows
            .into_iter()
            .map(|row| (Self::parse_string(&row, 0), Self::parse_string(&row, 1)))
            .collect())
    }

    pub(crate) async fn load_mssql_foreign_keys(
        &self,
        schema: &str,
        table: &str,
    ) -> DriverResult<Vec<ForeignKeyInfo>> {
        let sql = format!(
            "SELECT fk.name, pc.name, rs.name, rt.name, rc.name, fk.update_referential_action_desc, fk.delete_referential_action_desc FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id JOIN sys.tables pt ON pt.object_id = fk.parent_object_id JOIN sys.schemas ps ON ps.schema_id = pt.schema_id JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id JOIN sys.schemas rs ON rs.schema_id = rt.schema_id JOIN sys.columns rc ON rc.object_id = rt.object_id AND rc.column_id = fkc.referenced_column_id WHERE ps.name = '{}' AND pt.name = '{}' ORDER BY fk.name, fkc.constraint_column_id",
            escape_literal(schema), escape_literal(table)
        );
        let rows = self.fetch_rows(&sql).await?;
        let mut fks = Vec::new();
        for row in rows {
            fks.push(ForeignKeyInfo {
                name: Self::parse_string(&row, 0),
                column: Self::parse_string(&row, 1),
                referenced_schema: Some(Self::parse_string(&row, 2)),
                referenced_table: Self::parse_string(&row, 3),
                referenced_column: Self::parse_string(&row, 4),
                on_update: Some(Self::parse_string(&row, 5)),
                on_delete: Some(Self::parse_string(&row, 6)),
            });
        }
        Ok(fks)
    }

    pub(crate) async fn load_mssql_indexes(
        &self,
        schema: &str,
        table: &str,
        include_constraints: bool,
    ) -> DriverResult<Vec<IndexInfo>> {
        let constraint_filter = if include_constraints {
            ""
        } else {
            " AND i.is_primary_key = 0 AND i.is_unique_constraint = 0"
        };
        let sql = format!(
            "SELECT i.name, i.is_unique, i.type_desc, c.name, ic.key_ordinal FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id JOIN sys.tables t ON t.object_id = i.object_id JOIN sys.schemas s ON s.schema_id = t.schema_id WHERE s.name = '{}' AND t.name = '{}' AND i.name IS NOT NULL{} ORDER BY i.name, ic.key_ordinal",
            escape_literal(schema), escape_literal(table), constraint_filter
        );
        let rows = self.fetch_rows(&sql).await?;
        let mut map: HashMap<String, (bool, Option<String>, Vec<(i64, String)>)> = HashMap::new();
        for row in rows {
            let name = Self::parse_string(&row, 0);
            let unique = Self::parse_i64(&row, 1) == 1;
            let idx_type = Self::parse_string(&row, 2);
            let col = Self::parse_string(&row, 3);
            let ord = Self::parse_i64(&row, 4);
            let entry = map
                .entry(name)
                .or_insert((unique, Some(idx_type.clone()), Vec::new()));
            entry.0 = unique;
            if entry.1.is_none() && !idx_type.is_empty() {
                entry.1 = Some(idx_type);
            }
            entry.2.push((ord, col));
        }
        let mut indexes: Vec<IndexInfo> = map
            .into_iter()
            .map(|(name, (unique, index_type, mut cols))| {
                cols.sort_by_key(|(ord, _)| *ord);
                IndexInfo {
                    name,
                    unique,
                    index_type: Some(index_type.unwrap_or_default()),
                    columns: cols.into_iter().map(|(_, c)| c).collect(),
                }
            })
            .collect();
        indexes.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(indexes)
    }

    // --- Metadata trait impl methods ---

    pub(crate) async fn list_databases_impl(&self) -> DriverResult<Vec<String>> {
        let rows = self.fetch_rows("SELECT name FROM sys.databases WHERE state = 0 AND name NOT IN ('tempdb') ORDER BY name").await?;
        Ok(rows
            .iter()
            .map(|row| Self::parse_string(row, 0))
            .filter(|s| !s.is_empty())
            .collect())
    }

    pub(crate) async fn list_tables_impl(
        &self,
        schema: Option<String>,
    ) -> DriverResult<Vec<TableInfo>> {
        let schema_filter = schema
            .filter(|s| !s.trim().is_empty())
            .map(|s| format!("AND s.name = '{}'", escape_literal(s.trim())));
        let sql = format!(
            "SELECT s.name AS schema_name, o.name AS table_name, CASE WHEN o.type = 'V' THEN 'view' ELSE 'table' END AS table_type FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.type IN ('U','V') {} ORDER BY s.name, o.name",
            schema_filter.unwrap_or_default()
        );
        let rows = self.fetch_rows(&sql).await?;
        Ok(rows
            .into_iter()
            .map(|row| TableInfo {
                schema: Self::parse_string(&row, 0),
                name: Self::parse_string(&row, 1),
                r#type: Self::parse_string(&row, 2),
            })
            .collect())
    }

    pub(crate) async fn get_table_structure_impl(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableStructure> {
        let pk_sql = format!(
            "SELECT kcu.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA AND tc.TABLE_NAME = kcu.TABLE_NAME WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = '{}' AND tc.TABLE_NAME = '{}'",
            escape_literal(&schema), escape_literal(&table)
        );
        let pk_rows = self.fetch_rows(&pk_sql).await?;
        let pk_set: HashSet<String> = pk_rows
            .iter()
            .map(|row| Self::parse_string(row, 0))
            .collect();

        let mssql_cols = self.load_mssql_columns(&schema, &table).await?;
        let columns = mssql_cols
            .into_iter()
            .map(|col| ColumnInfo {
                name: col.name.clone(),
                r#type: col.full_type,
                nullable: col.is_nullable,
                default_value: col.default_definition,
                primary_key: pk_set.contains(&col.name),
                comment: col.comment,
                default_constraint_name: col.default_constraint_name,
            })
            .collect();
        Ok(TableStructure { columns })
    }

    pub(crate) async fn get_table_metadata_impl(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<TableMetadata> {
        let columns = self
            .get_table_structure_impl(schema.clone(), table.clone())
            .await?
            .columns;
        let indexes = self.load_mssql_indexes(&schema, &table, true).await?;
        let foreign_keys = self.load_mssql_foreign_keys(&schema, &table).await?;
        Ok(TableMetadata {
            columns,
            indexes,
            foreign_keys,
            clickhouse_extra: None,
            cassandra_extra: None,
            special_type_summaries: vec![],
        })
    }

    pub(crate) async fn get_table_ddl_impl(
        &self,
        schema: String,
        table: String,
    ) -> DriverResult<String> {
        let columns = self.load_mssql_columns(&schema, &table).await?;
        let key_constraints = self.load_mssql_key_constraints(&schema, &table).await?;
        let check_constraints = self.load_mssql_check_constraints(&schema, &table).await?;
        let foreign_keys = self.load_mssql_foreign_keys(&schema, &table).await?;
        let indexes = self.load_mssql_indexes(&schema, &table, false).await?;
        Ok(render_mssql_create_table_ddl(
            &schema,
            &table,
            &columns,
            &key_constraints,
            &check_constraints,
            &foreign_keys,
            &indexes,
        ))
    }

    pub(crate) async fn get_schema_overview_impl(
        &self,
        schema: Option<String>,
    ) -> DriverResult<SchemaOverview> {
        let sql = if let Some(schema_name) = schema.filter(|s| !s.trim().is_empty()) {
            format!("SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = '{}' ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION", escape_literal(schema_name.trim()))
        } else {
            "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA', 'sys') ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION".to_string()
        };
        let rows = self.fetch_rows(&sql).await?;
        let mut table_map: HashMap<(String, String), Vec<ColumnSchema>> = HashMap::new();
        for row in rows {
            let schema_name = Self::parse_string(&row, 0);
            let table_name = Self::parse_string(&row, 1);
            let col_name = Self::parse_string(&row, 2);
            let col_type = Self::parse_string(&row, 3);
            table_map
                .entry((schema_name, table_name))
                .or_default()
                .push(ColumnSchema {
                    name: col_name,
                    r#type: col_type,
                });
        }
        let mut tables: Vec<TableSchema> = table_map
            .into_iter()
            .map(|((schema, name), columns)| TableSchema {
                schema,
                name,
                columns,
            })
            .collect();
        tables.sort_by(|a, b| a.schema.cmp(&b.schema).then(a.name.cmp(&b.name)));
        Ok(SchemaOverview { tables })
    }

    pub(crate) async fn list_routines_impl(
        &self,
        schema: Option<String>,
    ) -> DriverResult<Vec<RoutineInfo>> {
        let schema_filter = schema
            .filter(|s| !s.trim().is_empty())
            .map(|s| format!("AND s.name = '{}'", escape_literal(s.trim())));
        let sql = format!(
            "SELECT s.name AS schema_name, o.name AS routine_name, CASE WHEN o.type = 'P' THEN 'procedure' ELSE 'function' END AS routine_type FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.type IN ('P','FN','IF','TF','FS','FT') AND o.is_ms_shipped = 0 {} ORDER BY s.name, routine_type, o.name",
            schema_filter.unwrap_or_default()
        );
        let rows = self.fetch_rows(&sql).await?;
        Ok(rows
            .into_iter()
            .map(|row| RoutineInfo {
                schema: Self::parse_string(&row, 0),
                name: Self::parse_string(&row, 1),
                r#type: Self::parse_string(&row, 2),
            })
            .collect())
    }

    pub(crate) async fn get_routine_ddl_impl(
        &self,
        schema: String,
        name: String,
        routine_type: String,
    ) -> DriverResult<String> {
        let type_filter = routine_type_sql_filter(&routine_type)?;
        let sql = format!(
            "SELECT m.definition FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id JOIN sys.sql_modules m ON m.object_id = o.object_id WHERE s.name = '{}' AND o.name = '{}' AND o.type IN {} AND o.is_ms_shipped = 0",
            escape_literal(&schema), escape_literal(&name), type_filter
        );
        let rows = self.fetch_rows(&sql).await?;
        let ddl = rows
            .first()
            .map(|row| Self::parse_string(row, 0))
            .unwrap_or_default();
        if ddl.trim().is_empty() {
            return Err(AppError::not_found(format!(
                "Routine '{}.{}' does not exist or its definition is not visible",
                schema, name
            )));
        }
        Ok(ddl)
    }

    pub(crate) async fn list_synonyms_impl(
        &self,
        schema: Option<String>,
    ) -> DriverResult<Vec<SynonymInfo>> {
        let schema_filter = schema
            .filter(|s| !s.trim().is_empty())
            .map(|s| format!("AND s.name = '{}'", escape_literal(s.trim())));
        let sql = format!(
            "SELECT s.name AS schema_name, o.name AS synonym_name, 'synonym' AS base_object_type FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id WHERE o.type = 'SN' {} ORDER BY s.name, o.name",
            schema_filter.unwrap_or_default()
        );
        let rows = self.fetch_rows(&sql).await?;
        Ok(rows
            .into_iter()
            .map(|row| SynonymInfo {
                schema: Self::parse_string(&row, 0),
                name: Self::parse_string(&row, 1),
                base_object_type: Self::parse_string(&row, 2),
            })
            .collect())
    }

    pub(crate) async fn get_schema_foreign_keys_impl(
        &self,
        database: Option<&str>,
    ) -> DriverResult<Vec<SchemaForeignKey>> {
        let schema_filter = database
            .filter(|s| !s.trim().is_empty())
            .map(|s| format!("AND ss.name = '{}'", escape_literal(s.trim())));
        let sql = format!(
            "SELECT fk.name, ss.name, ts.name, cp.name, rs.name, tr.name, cr.name, fk.update_referential_action_desc, fk.delete_referential_action_desc FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id JOIN sys.tables ts ON fkc.parent_object_id = ts.object_id JOIN sys.schemas ss ON ts.schema_id = ss.schema_id JOIN sys.columns cp ON fkc.parent_object_id = cp.object_id AND fkc.parent_column_id = cp.column_id JOIN sys.tables tr ON fkc.referenced_object_id = tr.object_id JOIN sys.schemas rs ON tr.schema_id = rs.schema_id JOIN sys.columns cr ON fkc.referenced_object_id = cr.object_id AND fkc.referenced_column_id = cr.column_id {} ORDER BY fk.name, fkc.constraint_column_id",
            schema_filter.unwrap_or_default()
        );
        let rows = self.fetch_rows(&sql).await?;
        let mut foreign_keys = Vec::new();
        for row in rows {
            let on_update_raw = Self::parse_string(&row, 7);
            let on_delete_raw = Self::parse_string(&row, 8);
            foreign_keys.push(SchemaForeignKey {
                name: Self::parse_string(&row, 0),
                source_schema: Some(Self::parse_string(&row, 1)),
                source_table: Self::parse_string(&row, 2),
                source_column: Self::parse_string(&row, 3),
                target_schema: Some(Self::parse_string(&row, 4)),
                target_table: Self::parse_string(&row, 5),
                target_column: Self::parse_string(&row, 6),
                on_update: if on_update_raw.is_empty() {
                    None
                } else {
                    Some(on_update_raw)
                },
                on_delete: if on_delete_raw.is_empty() {
                    None
                } else {
                    Some(on_delete_raw)
                },
            });
        }
        Ok(foreign_keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_ident_allows_common_mssql_names() {
        assert_eq!(
            quote_ident("order-detail 2026").unwrap(),
            "[order-detail 2026]"
        );
        assert_eq!(quote_ident("用户表").unwrap(), "[用户表]");
    }

    #[test]
    fn quote_ident_escapes_bracket_and_trims() {
        assert_eq!(quote_ident("  a]b ").unwrap(), "[a]]b]");
    }

    #[test]
    fn quote_ident_rejects_empty_and_null_byte() {
        assert!(quote_ident("   ").is_err());
        assert!(quote_ident("abc\0def").is_err());
    }

    #[test]
    fn test_routine_type_sql_filter_maps_supported_types() {
        assert_eq!(routine_type_sql_filter("procedure").unwrap(), "('P')");
        assert_eq!(routine_type_sql_filter("PROCEDURE").unwrap(), "('P')");
        assert_eq!(
            routine_type_sql_filter("function").unwrap(),
            "('FN','IF','TF','FS','FT')"
        );
        assert!(routine_type_sql_filter("trigger").is_err());
    }

    #[test]
    fn test_mssql_full_type_string_varchar() {
        assert_eq!(mssql_full_type_string("varchar", 255, 0, 0), "varchar(255)");
        assert_eq!(mssql_full_type_string("varchar", -1, 0, 0), "varchar(MAX)");
    }

    #[test]
    fn test_mssql_full_type_string_nvarchar() {
        assert_eq!(mssql_full_type_string("nvarchar", 50, 0, 0), "nvarchar(50)");
        assert_eq!(
            mssql_full_type_string("nvarchar", -1, 0, 0),
            "nvarchar(MAX)"
        );
    }

    #[test]
    fn test_mssql_full_type_string_decimal() {
        assert_eq!(mssql_full_type_string("decimal", 0, 10, 2), "decimal(10,2)");
    }

    #[test]
    fn test_mssql_full_type_string_datetime_with_scale() {
        assert_eq!(mssql_full_type_string("datetime2", 0, 0, 7), "datetime2(7)");
        assert_eq!(mssql_full_type_string("datetime2", 0, 0, 0), "datetime2");
    }

    #[test]
    fn test_mssql_full_type_string_passthrough() {
        assert_eq!(mssql_full_type_string("int", 0, 0, 0), "int");
        assert_eq!(
            mssql_full_type_string("uniqueidentifier", 0, 0, 0),
            "uniqueidentifier"
        );
    }
}
