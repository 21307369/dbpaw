export interface CellRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export interface CellAnchor {
  row: number;
  colIndex: number;
}

export function getNormalizedCellRange(
  anchor: CellAnchor,
  tip: CellAnchor,
): CellRange {
  return {
    minRow: Math.min(anchor.row, tip.row),
    maxRow: Math.max(anchor.row, tip.row),
    minCol: Math.min(anchor.colIndex, tip.colIndex),
    maxCol: Math.max(anchor.colIndex, tip.colIndex),
  };
}

export function buildRangeTSV(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells: string[] = [];
    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = columns[c];
      const val = getCellValue(r, col, row[col]);
      cells.push(
        val === null || val === undefined ? "" : cellValueToString(val),
      );
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

export function buildRangeCSV(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    const cells: string[] = [];
    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = columns[c];
      const val = getCellValue(r, col, row[col]);
      const str = val === null || val === undefined ? "" : cellValueToString(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        cells.push(`"${str.replace(/"/g, '""')}"`);
      } else {
        cells.push(str);
      }
    }
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function buildRangeInsertSQL(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  driver: string,
  tableName: string,
): string {
  const selectedCols: string[] = [];
  for (let c = range.minCol; c <= range.maxCol; c++) {
    selectedCols.push(columns[c]);
  }
  const colNames = selectedCols.map((c) => quoteIdentFn(driver, c)).join(", ");

  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;
    const vals = selectedCols
      .map((col) => {
        const val = getCellValue(r, col, row[col]);
        return formatSQLValue(
          val === null || val === undefined ? "" : String(val),
          row[col],
          "copy",
          driver,
        );
      })
      .join(", ");
    lines.push(`INSERT INTO ${tableName} (${colNames}) VALUES (${vals});`);
  }
  return lines.join("\n");
}

export function buildRangeUpdateSQL(
  range: CellRange,
  columns: string[],
  rows: Record<string, unknown>[],
  primaryKeys: string[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  escapeSQLFn: (s: string) => string,
  buildUpdateStatementFn: (driver: string, table: string, set: string, where: string) => string,
  driver: string,
  tableName: string,
): string {
  if (primaryKeys.length === 0) return "";

  const selectedCols: string[] = [];
  for (let c = range.minCol; c <= range.maxCol; c++) {
    selectedCols.push(columns[c]);
  }

  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const row = rows[r];
    if (!row) continue;

    const setClauses = selectedCols.map((col) => {
      const val = getCellValue(r, col, row[col]);
      const formattedValue = formatSQLValue(
        val === null || val === undefined ? "" : String(val),
        row[col],
        "copy",
        driver,
      );
      return `${quoteIdentFn(driver, col)} = ${formattedValue}`;
    });

    const whereClauses = primaryKeys.map((pk) => {
      const pkValue = row[pk];
      if (pkValue === null || pkValue === undefined) {
        return `${quoteIdentFn(driver, pk)} IS NULL`;
      }
      if (typeof pkValue === "number") {
        return `${quoteIdentFn(driver, pk)} = ${pkValue}`;
      }
      return `${quoteIdentFn(driver, pk)} = '${escapeSQLFn(String(pkValue))}'`;
    });

    lines.push(
      `${buildUpdateStatementFn(driver, tableName, setClauses.join(", "), whereClauses.join(" AND "))};`,
    );
  }
  return lines.join("\n");
}

export function buildRowsTSV(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);
  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";
      return columns
        .map((col) => {
          const value = getCellValue(rowIndex, col, row[col]);
          if (value === null || value === undefined) return "";
          return cellValueToString(value);
        })
        .join("\t");
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildRowsCSV(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  cellValueToString: (v: unknown) => string,
): string {
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);
  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";
      return columns
        .map((col) => {
          const value = getCellValue(rowIndex, col, row[col]);
          if (value === null || value === undefined) return "";
          const str = cellValueToString(value);
          if (
            str.includes(",") ||
            str.includes('"') ||
            str.includes("\n")
          ) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",");
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildRowsInsertSQL(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  driver: string,
  tableName: string,
): string {
  const orderedRows = [...rowIndexes].sort((a, b) => a - b);
  const cols = columns.map((c) => quoteIdentFn(driver, c)).join(", ");

  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";
      const vals = columns
        .map((col) => {
          const val = getCellValue(rowIndex, col, row[col]);
          return formatSQLValue(
            val === null || val === undefined ? "" : String(val),
            row[col],
            "copy",
            driver,
          );
        })
        .join(", ");
      return `INSERT INTO ${tableName} (${cols}) VALUES (${vals});`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

export function buildRowsUpdateSQL(
  rowIndexes: number[],
  columns: string[],
  rows: Record<string, unknown>[],
  primaryKeys: string[],
  getCellValue: (row: number, col: string, raw: unknown) => unknown,
  formatSQLValue: (str: string, raw: unknown, mode: string, driver: string) => string,
  quoteIdentFn: (driver: string, ident: string) => string,
  escapeSQLFn: (s: string) => string,
  buildUpdateStatementFn: (driver: string, table: string, set: string, where: string) => string,
  driver: string,
  tableName: string,
): string {
  if (primaryKeys.length === 0) return "";

  const orderedRows = [...rowIndexes].sort((a, b) => a - b);

  return orderedRows
    .map((rowIndex) => {
      const row = rows[rowIndex];
      if (!row) return "";

      const setClauses = columns.map((col) => {
        const val = getCellValue(rowIndex, col, row[col]);
        const formattedValue = formatSQLValue(
          val === null || val === undefined ? "" : String(val),
          row[col],
          "copy",
          driver,
        );
        return `${quoteIdentFn(driver, col)} = ${formattedValue}`;
      });

      const whereClauses = primaryKeys.map((pk) => {
        const pkValue = row[pk];
        if (pkValue === null || pkValue === undefined) {
          return `${quoteIdentFn(driver, pk)} IS NULL`;
        }
        if (typeof pkValue === "number") {
          return `${quoteIdentFn(driver, pk)} = ${pkValue}`;
        }
        return `${quoteIdentFn(driver, pk)} = '${escapeSQLFn(String(pkValue))}'`;
      });

      return `${buildUpdateStatementFn(driver, tableName, setClauses.join(", "), whereClauses.join(" AND "))};`;
    })
    .filter((line) => line.length > 0)
    .join("\n");
}
