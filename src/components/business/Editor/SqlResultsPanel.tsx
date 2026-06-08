import { useTranslation } from "react-i18next";
import { TableView } from "@/components/business/DataGrid/TableView";
import type { SingleResultState } from "@/lib/queryExecutionState";

interface SqlResultsPanelProps {
  queryResults: {
    data: any[];
    columns: string[];
    error?: string;
    resultSets?: SingleResultState[];
  };
  hasMultipleResults: boolean;
  activeResultSetIndex: number;
  onResultSetChange: (idx: number) => void;
  displayData: any[];
  displayColumns: string[];
}

export function SqlResultsPanel({
  queryResults,
  hasMultipleResults,
  activeResultSetIndex,
  onResultSetChange,
  displayData,
  displayColumns,
}: SqlResultsPanelProps) {
  const { t } = useTranslation();

  if (queryResults.error) {
    return (
      <div className="h-full p-4 bg-destructive/10 text-destructive overflow-auto font-mono text-sm whitespace-pre-wrap">
        <div className="font-bold mb-2">
          {t("sqlEditor.error.executingQuery")}
        </div>
        {queryResults.error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {hasMultipleResults && (
        <div className="flex border-b bg-muted/30">
          {queryResults.resultSets!.map((rs, idx) => (
            <button
              key={idx}
              className={`px-3 py-1.5 text-sm ${
                idx === activeResultSetIndex
                  ? "border-b-2 border-primary bg-background"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
              onClick={() => onResultSetChange(idx)}
            >
              Result {idx + 1} ({rs.rowCount} rows)
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <TableView data={displayData} columns={displayColumns} hideHeader />
      </div>
    </div>
  );
}
