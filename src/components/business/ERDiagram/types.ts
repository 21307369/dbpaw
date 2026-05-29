import type { SchemaOverview, SchemaForeignKey } from "@/services/api";

export interface ERDiagramTableNode {
  id: string;
  schema: string;
  name: string;
  columns: {
    name: string;
    type: string;
    isForeignKey: boolean;
  }[];
}

export interface ERDiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceColumn: string;
  targetColumn: string;
  fkName: string;
  onUpdate?: string | null;
  onDelete?: string | null;
}

export interface ERDiagramData {
  nodes: ERDiagramTableNode[];
  edges: ERDiagramEdge[];
}

export function buildDiagramData(
  overview: SchemaOverview,
  foreignKeys: SchemaForeignKey[],
): ERDiagramData {
  const validForeignKeys = foreignKeys.filter(
    (fk) => fk.sourceTable && fk.targetTable,
  );

  const fkSourceSet = new Set<string>();
  const fkTargetSet = new Set<string>();

  validForeignKeys.forEach((fk) => {
    fkSourceSet.add(`${fk.sourceTable}.${fk.sourceColumn}`);
    fkTargetSet.add(`${fk.targetTable}.${fk.targetColumn}`);
  });

  const schemaByTable = new Map<string, string>();
  for (const table of overview.tables) {
    schemaByTable.set(table.name, table.schema);
  }

  const nodes: ERDiagramTableNode[] = overview.tables
    .map((table) => ({
      id: `${table.schema}.${table.name}`,
      schema: table.schema,
      name: table.name,
      columns: table.columns
        .filter((col) => {
          const key = `${table.name}.${col.name}`;
          return fkSourceSet.has(key) || fkTargetSet.has(key);
        })
        .map((col) => ({
          name: col.name,
          type: col.type,
          isForeignKey: fkSourceSet.has(`${table.name}.${col.name}`),
        })),
    }))
    .filter((node) => node.columns.length > 0);

  const edges: ERDiagramEdge[] = validForeignKeys.map((fk) => ({
    id: `${fk.name}-${fk.sourceTable}.${fk.sourceColumn}-${fk.targetTable}.${fk.targetColumn}`,
    source: `${fk.sourceSchema || schemaByTable.get(fk.sourceTable) || "public"}.${fk.sourceTable}`,
    target: `${fk.targetSchema || schemaByTable.get(fk.targetTable) || "public"}.${fk.targetTable}`,
    sourceColumn: fk.sourceColumn,
    targetColumn: fk.targetColumn,
    fkName: fk.name,
    onUpdate: fk.onUpdate,
    onDelete: fk.onDelete,
  }));

  return { nodes, edges };
}
