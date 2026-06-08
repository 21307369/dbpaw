import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import CodeMirror, { Extension } from "@uiw/react-codemirror";
import {
  sql,
  PostgreSQL,
  MySQL,
  SQLite,
  StandardSQL,
  SQLNamespace,
} from "@codemirror/lang-sql";
import { keymap, EditorView } from "@codemirror/view";
import {
  Completion,
  CompletionContext,
  CompletionResult,
  acceptCompletion,
} from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { insertTab } from "@codemirror/commands";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Play,
  Save,
  Trash2,
  Database,
  Braces,
  Download,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { TableView } from "@/components/business/DataGrid/TableView";
import { useTheme } from "@/components/theme-provider";
import {
  SchemaOverview,
  api,
  SavedQuery,
  TransferFormat,
  isTauri,
} from "@/services/api";
import { SaveQueryDialog } from "./SaveQueryDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useShortcutBinding } from "@/contexts/ShortcutsContext";
import { comboToCodeMirror } from "@/lib/shortcuts/match";
import { toast } from "sonner";
import { collectSelectedSql } from "./sqlSelection";
import { getEditorTheme } from "./sqlThemes";
import { CLICKHOUSE_COMPLETIONS } from "./clickhouseKeywords";
import { useTranslation } from "react-i18next";
import { buildSqlContextualCompletion } from "./sqlCompletionContext";
import { SingleResultState } from "@/lib/queryExecutionState";
import { errorMessage } from "@/lib/errors";

interface SqlEditorProps {
  queryResults?: {
    data: any[];
    columns: string[];
    executionTime?: string;
    error?: string;
    resultSets?: SingleResultState[];
    activeResultSetIndex?: number;
  } | null;
  onExecute?: (sql: string) => void;
  onCancel?: () => void;
  databaseName?: string;
  availableDatabases?: string[];
  value?: string;
  onChange?: (value: string) => void;
  onDatabaseChange?: (database: string) => void;
  connectionId?: number;
  driver?: string;
  schemaOverview?: SchemaOverview;
  savedQueryId?: number;
  initialName?: string;
  initialDescription?: string;
  onSaveSuccess?: (savedQuery: SavedQuery) => void;
  isExecuting?: boolean;
}

export function SqlEditor({
  queryResults,
  onExecute,
  onCancel,
  databaseName,
  availableDatabases,
  value,
  onChange,
  onDatabaseChange,
  connectionId: _connectionId,
  driver,
  schemaOverview,
  savedQueryId,
  initialName,
  initialDescription,
  onSaveSuccess,
  isExecuting,
}: SqlEditorProps) {
  const { t } = useTranslation();
  const [internalSql, setInternalSql] = useState("");
  const { theme, editorFontSizePx } = useTheme();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [activeResultSetIndex, setActiveResultSetIndex] = useState(0);
  const canSwitchDatabase =
    !!databaseName &&
    !!onDatabaseChange &&
    !!availableDatabases &&
    availableDatabases.length > 1;
  const resultStatus = useMemo(() => {
    if (!queryResults) return null;
    if (queryResults.error) {
      return {
        text: t("sqlEditor.result.failed"),
        toneClass: "text-destructive",
        Icon: XCircle,
      };
    }

    const hasMultipleResults =
      queryResults.resultSets && queryResults.resultSets.length > 1;
    if (hasMultipleResults) {
      const totalRows = queryResults.resultSets!.reduce(
        (sum, rs) => sum + rs.rowCount,
        0,
      );
      return {
        text: `${t("sqlEditor.result.success")} ${queryResults.resultSets!.length} results (${totalRows} rows)`,
        toneClass: "text-emerald-600 dark:text-emerald-400",
        Icon: CheckCircle2,
      };
    }

    const returnedRows = queryResults.data.length;
    const hasResultSet = queryResults.columns.length > 0;
    const suffix = hasResultSet
      ? returnedRows === 1
        ? t("sqlEditor.result.rowsSuffix", { count: returnedRows })
        : t("sqlEditor.result.rowsSuffixPlural", { count: returnedRows })
      : "";

    return {
      text: `${t("sqlEditor.result.success")}${suffix}`,
      toneClass: "text-emerald-600 dark:text-emerald-400",
      Icon: CheckCircle2,
    };
  }, [queryResults, t]);

  const hasMultipleResults =
    queryResults?.resultSets && queryResults.resultSets.length > 1;
  const currentResultSet = useMemo(() => {
    if (!queryResults) return null;
    if (hasMultipleResults && queryResults.resultSets) {
      return queryResults.resultSets[activeResultSetIndex] || null;
    }
    return null;
  }, [queryResults, hasMultipleResults, activeResultSetIndex]);

  const displayData = currentResultSet?.data ?? queryResults?.data ?? [];
  const displayColumns =
    currentResultSet?.columns ?? queryResults?.columns ?? [];

  // Use controlled value if provided, otherwise internal state
  const code = value !== undefined ? value : internalSql;

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Debounce onChange to prevent excessive parent re-renders
  const handleSqlChange = useCallback(
    (val: string) => {
      // Always update internal state immediately if we are using it
      if (value === undefined) {
        setInternalSql(val);
      }

      // Clear previous timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Debounce the callback to parent
      timeoutRef.current = setTimeout(() => {
        if (onChange) {
          onChange(val);
        }
      }, 300);
    },
    [onChange, value],
  );

  const executeFromEditorSelection = useCallback(
    (view: EditorView) => {
      if (!onExecute) {
        return;
      }
      const sqlToRun = collectSelectedSql({
        ranges: view.state.selection.ranges,
        sliceDoc: (from, to) => view.state.sliceDoc(from, to),
        fullDoc: () => view.state.doc.toString(),
      });

      onExecute(sqlToRun);
    },
    [onExecute],
  );

  const handleExecute = useCallback(() => {
    if (!onExecute) return;
    const view = editorViewRef.current;
    if (view) {
      executeFromEditorSelection(view);
      return;
    }
    onExecute(code);
  }, [onExecute, code, executeFromEditorSelection]);

  const handleClear = () => {
    handleSqlChange("");
  };

  const handleFormat = useCallback(async () => {
    if (isFormatting) return;

    setIsFormatting(true);
    try {
      const { format } = await import("sql-formatter");
      const dialectMap: Record<string, string> = {
        postgres: "postgresql",
        postgresql: "postgresql",
        mysql: "mysql",
        tidb: "mysql",
        mariadb: "mysql",
        starrocks: "mysql",
        sqlite: "sqlite",
        duckdb: "sqlite",
        clickhouse: "sql",
        mssql: "transactsql",
      };
      const language = ((driver && dialectMap[driver]) || "sql") as any;
      const formatted = format(code, {
        language,
        keywordCase: "upper",
        tabWidth: 2,
      });
      handleSqlChange(formatted);
    } catch (e) {
      console.error("Format failed:", e);
      toast.error(t("sqlEditor.error.formatFailed"), {
        description: errorMessage(e),
      });
    } finally {
      setIsFormatting(false);
    }
  }, [code, driver, handleSqlChange, isFormatting, t]);

  const savedQueryIdRef = useRef(savedQueryId);
  const editorViewRef = useRef<EditorView | null>(null);
  useEffect(() => {
    savedQueryIdRef.current = savedQueryId;
  }, [savedQueryId]);

  const executeSave = useCallback(
    async (name: string, description: string) => {
      try {
        const currentId = savedQueryIdRef.current;
        let result: SavedQuery;
        if (currentId) {
          result = await api.queries.update(currentId, {
            name,
            description,
            query: code,
            connectionId: _connectionId || undefined,
            database: databaseName,
          });
        } else {
          result = await api.queries.create({
            name,
            description,
            query: code,
            connectionId: _connectionId || undefined,
            database: databaseName,
          });
        }
        toast.success(t("sqlEditor.save.success"));
        if (onSaveSuccess) {
          onSaveSuccess(result);
        }
      } catch (e) {
        console.error("Failed to save query", e);
        toast.error(t("sqlEditor.save.failed"), {
          description: errorMessage(e),
        });
      }
    },
    [code, _connectionId, databaseName, onSaveSuccess, t],
  );

  const handleSave = async (name: string, description: string) => {
    await executeSave(name, description);
  };

  const handleExportResult = useCallback(
    async (format: TransferFormat) => {
      if (!_connectionId) {
        toast.error(t("sqlEditor.export.runWithSavedConnection"));
        return;
      }
      if (!isTauri()) {
        toast.error(t("sqlEditor.export.desktopOnly"));
        return;
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const defaultPath = `query_result_${timestamp}.${format}`;
      const filters =
        format === "csv"
          ? [{ name: "CSV", extensions: ["csv"] }]
          : format === "json"
            ? [{ name: "JSON", extensions: ["json"] }]
            : [{ name: "SQL", extensions: ["sql"] }];

      let filePath: string | undefined;
      try {
        const selected = await save({
          title: t("sqlEditor.export.saveFileTitle"),
          defaultPath,
          filters,
        });
        if (!selected) return;
        filePath = Array.isArray(selected) ? selected[0] : selected;
        if (!filePath) return;
      } catch (e) {
        toast.error(t("sqlEditor.export.openSaveDialogFailed"), {
          description: errorMessage(e),
        });
        return;
      }

      try {
        const result = await api.transfer.exportQueryResult({
          id: _connectionId,
          database: databaseName,
          sql: code,
          driver: driver || "postgres",
          format,
          filePath,
        });
        toast.success(
          t("sqlEditor.export.completed", { count: result.rowCount }),
          {
            description: result.filePath,
          },
        );
      } catch (e) {
        toast.error(t("sqlEditor.export.failed"), {
          description: errorMessage(e),
        });
      }
    },
    [_connectionId, databaseName, code, driver, t],
  );

  const triggerSave = useCallback(() => {
    const currentId = savedQueryIdRef.current;
    if (currentId) {
      executeSave(
        initialName || t("sqlEditor.untitled"),
        initialDescription || "",
      );
    } else {
      setIsSaveDialogOpen(true);
    }
  }, [initialName, initialDescription, executeSave, t]);

  // Stable refs so keymap handlers never cause extensions to be rebuilt
  const executeFromEditorRef = useRef(executeFromEditorSelection);
  executeFromEditorRef.current = executeFromEditorSelection;
  const handleFormatRef = useRef(handleFormat);
  handleFormatRef.current = handleFormat;
  const triggerSaveRef = useRef(triggerSave);
  triggerSaveRef.current = triggerSave;

  const executeBinding = useShortcutBinding("editor.execute");
  const saveBinding = useShortcutBinding("editor.save");
  const formatBinding = useShortcutBinding("editor.format");
  const acceptBinding = useShortcutBinding("editor.acceptCompletion");

  // Determine Dialect
  const dialect = useMemo(() => {
    switch (driver) {
      case "postgres":
        return PostgreSQL;
      case "mysql":
      case "tidb":
      case "mariadb":
      case "starrocks":
        return MySQL;
      case "sqlite":
      case "duckdb":
        return SQLite;
      case "clickhouse":
        return StandardSQL;
      case "mssql":
        return StandardSQL;
      default:
        return StandardSQL;
    }
  }, [driver]);

  // Build Schema for CodeMirror
  const sqlSchema = useMemo(() => {
    if (!schemaOverview) {
      return {};
    }

    const schemaMap: SQLNamespace = {};

    schemaOverview.tables.forEach((t) => {
      const colNames = t.columns.map((c) => c.name);
      // Add table
      schemaMap[t.name] = colNames;
      // Add schema.table
      if (t.schema) {
        schemaMap[`${t.schema}.${t.name}`] = colNames;
      }
    });

    return schemaMap;
  }, [schemaOverview]);

  const customCompletion = useMemo(():
    | ((ctx: CompletionContext) => CompletionResult | null)
    | null => {
    const hasSchema = !!schemaOverview;
    const isClickhouse = driver === "clickhouse";
    if (!hasSchema && !isClickhouse) return null;

    return (context: CompletionContext): CompletionResult | null => {
      const results: CompletionResult[] = [];

      if (hasSchema) {
        const r = buildSqlContextualCompletion({
          textBeforeCursor: context.state.sliceDoc(0, context.pos),
          explicit: context.explicit,
          schemaOverview: schemaOverview!,
        });
        if (r) results.push(r);
      }

      if (isClickhouse) {
        const word = context.matchBefore(/\w*/);
        if (word && (word.from !== word.to || context.explicit)) {
          results.push({ from: word.from, options: CLICKHOUSE_COMPLETIONS });
        }
      }

      if (results.length === 0) return null;
      if (results.length === 1) return { ...results[0], validFor: /^[\w$]*$/ };

      const from = results.reduce(
        (min, r) => Math.min(min, r.from),
        results[0].from,
      );
      const seen = new Set<string>();
      const options: Completion[] = [];
      for (const result of results) {
        for (const option of result.options) {
          const key = `${option.label}::${option.type ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
            options.push(option);
          }
        }
      }
      return { from, options, validFor: /^[\w$]*$/ };
    };
  }, [schemaOverview, driver]);

  // Extensions
  const extensions = useMemo(() => {
    const fontSizeExt = EditorView.theme({
      ".cm-scroller": {
        fontSize: `${editorFontSizePx}px`,
      },
    });
    const exts: Extension[] = [
      EditorView.lineWrapping,
      fontSizeExt,
      sql({
        dialect,
        schema: sqlSchema,
        upperCaseKeywords: true,
      }),
      Prec.high(
        keymap.of([
          {
            key: comboToCodeMirror(acceptBinding),
            run: (view) => acceptCompletion(view) || insertTab(view),
          },
          {
            key: comboToCodeMirror(executeBinding),
            run: (view) => {
              executeFromEditorRef.current(view);
              return true;
            },
          },
          {
            key: comboToCodeMirror(formatBinding),
            run: () => {
              void handleFormatRef.current();
              return true;
            },
          },
          {
            key: comboToCodeMirror(saveBinding),
            run: () => {
              triggerSaveRef.current();
              return true;
            },
          },
        ]),
      ),
    ];

    if (customCompletion) {
      exts.push(
        dialect.language.data.of({
          autocomplete: customCompletion,
        }),
      );
    }

    return exts;
  }, [
    dialect,
    sqlSchema,
    customCompletion,
    editorFontSizePx,
    executeBinding,
    saveBinding,
    formatBinding,
    acceptBinding,
  ]);

  // Theme
  const editorTheme = useMemo(() => getEditorTheme(theme), [theme]);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          {databaseName &&
            (canSwitchDatabase ? (
              <div className="flex items-center gap-2">
                <Database
                  className={`w-3 h-3 ${schemaOverview ? "text-green-500" : "text-muted-foreground"}`}
                />
                <Select value={databaseName} onValueChange={onDatabaseChange}>
                  <SelectTrigger
                    size="sm"
                    className="h-8 min-w-[180px] bg-muted/50 text-xs"
                    aria-label={t("sqlEditor.database.ariaLabel")}
                  >
                    <SelectValue
                      placeholder={t("sqlEditor.database.placeholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDatabases?.map((database) => (
                      <SelectItem key={database} value={database}>
                        {database}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {savedQueryId && (
                  <span className="text-[10px] opacity-50">
                    #{savedQueryId}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-muted/50 rounded text-xs text-muted-foreground border border-border">
                <Database
                  className={`w-3 h-3 ${schemaOverview ? "text-green-500" : "text-muted-foreground"}`}
                />
                <span>{databaseName}</span>
                {savedQueryId && (
                  <span className="text-[10px] opacity-50 ml-1">
                    #{savedQueryId}
                  </span>
                )}
              </div>
            ))}

          <div className="w-px h-4 bg-border mx-2" />

          <TooltipProvider>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={handleExecute}
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    disabled={isExecuting}
                  >
                    {isExecuting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("sqlEditor.tooltip.runSql")}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => void handleFormat()}
                    disabled={isFormatting}
                  >
                    <Braces className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("sqlEditor.tooltip.formatSql")}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onCancel}
                  >
                    <span className="h-3 w-3 bg-foreground/80 rounded-[1px]" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("sqlEditor.tooltip.cancelQuery")}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={triggerSave}
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("sqlEditor.tooltip.saveQuery")}</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleClear}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("sqlEditor.tooltip.clearEditor")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {resultStatus && (
            <>
              <span
                className={`text-xs inline-flex items-center gap-1 ${resultStatus.toneClass}`}
              >
                <resultStatus.Icon className="w-3.5 h-3.5" />
                {resultStatus.text}
              </span>
            </>
          )}
          {queryResults && !queryResults.error && (
            <>
              <div className="w-px h-3 bg-border mx-2" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <Download className="w-4 h-4" />
                    {t("sqlEditor.export.result")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => void handleExportResult("csv")}
                  >
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleExportResult("json")}
                  >
                    JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void handleExportResult("sql_dml")}
                  >
                    SQL
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel defaultSize={queryResults ? 50 : 100} minSize={30}>
            <div className="h-full flex flex-col text-base">
              <CodeMirror
                value={code}
                height="100%"
                extensions={extensions}
                theme={editorTheme}
                onChange={handleSqlChange}
                onCreateEditor={(view) => {
                  editorViewRef.current = view;
                }}
                className="h-full"
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  autocompletion: true,
                }}
              />
            </div>
          </ResizablePanel>

          {queryResults && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={20}>
                <div className="h-full flex flex-col">
                  {queryResults.error ? (
                    <div className="h-full p-4 bg-destructive/10 text-destructive overflow-auto font-mono text-sm whitespace-pre-wrap">
                      <div className="font-bold mb-2">
                        {t("sqlEditor.error.executingQuery")}
                      </div>
                      {queryResults.error}
                    </div>
                  ) : (
                    <>
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
                              onClick={() => setActiveResultSetIndex(idx)}
                            >
                              Result {idx + 1} ({rs.rowCount} rows)
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex-1 overflow-hidden">
                        <TableView
                          data={displayData}
                          columns={displayColumns}
                          hideHeader
                        />
                      </div>
                    </>
                  )}
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      <SaveQueryDialog
        open={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSave={handleSave}
        initialName={initialName}
        initialDescription={initialDescription}
      />
    </div>
  );
}
