import type { DbDriver } from "./createTable";

export function quoteIdentifier(name: string, driver: DbDriver): string {
  switch (driver) {
    case "mysql":
    case "mariadb":
    case "tidb":
    case "starrocks":
    case "clickhouse":
      return `\`${name}\``;
    case "mssql":
      return `[${name}]`;
    default:
      return `"${name}"`;
  }
}
