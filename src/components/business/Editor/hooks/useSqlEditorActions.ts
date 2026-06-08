import { useMemo, useCallback, useRef } from "react";
import type { Extension } from "@uiw/react-codemirror";
import {
  sql,
  PostgreSQL,
  MySQL,
  SQLite,
  StandardSQL,
  type SQLNamespace,
} from "@codemirror/lang-sql";
import { EditorView, keymap } from "@codemirror/view";
import { acceptCompletion } from "@codemirror/autocomplete";
import { Prec } from "@codemirror/state";
import { insertTab } from "@codemirror/commands";
import { comboToCodeMirror } from "@/lib/shortcuts/match";
import { useShortcutBinding } from "@/contexts/ShortcutsContext";
import { collectSelectedSql } from "../sqlSelection";
import { buildSqlContextualCompletion } from "../sqlCompletionContext";
import { CLICKHOUSE_COMPLETIONS } from "../clickhouseKeywords";
import { getEditorTheme } from "../sqlThemes";
import type { SchemaOverview } from "@/services/api";

export function useSqlEditorActions(props: {
  driver?: string;
  schemaOverview?: SchemaOverview;
  editorFontSizePx: number;
  theme: string;
  onExecute?: (sql: string) => void;
  handleFormat: () => Promise<string | undefined>;
  triggerSave: () => void;
  handleSqlChange: (val: string) => void;
}) {
  const {
    driver,
    schemaOverview,
    editorFontSizePx,
    theme,
    onExecute,
    handleFormat,
    triggerSave,
    handleSqlChange,
  } = props;

  const editorViewRef = useRef<EditorView | null>(null);

  const executeFromEditorRef = useRef<((view: EditorView) => void) | null>(null);
  const handleFormatRef = useRef(handleFormat);
  handleFormatRef.current = handleFormat;
  const triggerSaveRef = useRef(triggerSave);
  triggerSaveRef.current = triggerSave;
  const handleSqlChangeRef = useRef(handleSqlChange);
  handleSqlChangeRef.current = handleSqlChange;

  const executeFromEditorSelection = useCallback(
    (view: EditorView) => {
      if (!onExecute) return;
      const sqlToRun = collectSelectedSql({
        ranges: view.state.selection.ranges,
        sliceDoc: (from, to) => view.state.sliceDoc(from, to),
        fullDoc: () => view.state.doc.toString(),
      });
      onExecute(sqlToRun);
    },
    [onExecute],
  );
  executeFromEditorRef.current = executeFromEditorSelection;

  const handleExecute = useCallback(() => {
    if (!onExecute) return;
    const view = editorViewRef.current;
    if (view) {
      executeFromEditorSelection(view);
    }
  }, [onExecute, executeFromEditorSelection]);

  const handleClear = useCallback(() => {
    handleSqlChangeRef.current("");
  }, []);

  const executeBinding = useShortcutBinding("editor.execute");
  const saveBinding = useShortcutBinding("editor.save");
  const formatBinding = useShortcutBinding("editor.format");
  const acceptBinding = useShortcutBinding("editor.acceptCompletion");

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
      default:
        return StandardSQL;
    }
  }, [driver]);

  const sqlSchema = useMemo((): SQLNamespace => {
    if (!schemaOverview) return {};
    const schemaMap: SQLNamespace = {};
    schemaOverview.tables.forEach((t) => {
      const colNames = t.columns.map((c) => c.name);
      schemaMap[t.name] = colNames;
      if (t.schema) {
        schemaMap[`${t.schema}.${t.name}`] = colNames;
      }
    });
    return schemaMap;
  }, [schemaOverview]);

  const customCompletion = useMemo(() => {
    const hasSchema = !!schemaOverview;
    const isClickhouse = driver === "clickhouse";
    if (!hasSchema && !isClickhouse) return null;

    return (context: any): any => {
      const results: any[] = [];

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
      const options: any[] = [];
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

  const extensions = useMemo((): Extension[] => {
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
              executeFromEditorRef.current?.(view);
              return true;
            },
          },
          {
            key: comboToCodeMirror(formatBinding),
            run: () => {
              void handleFormatRef.current().then((formatted) => {
                if (formatted !== undefined) {
                  handleSqlChangeRef.current(formatted);
                }
              });
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

  const editorTheme = useMemo(() => getEditorTheme(theme), [theme]);

  return {
    extensions,
    editorTheme,
    editorViewRef,
    handleExecute,
    handleClear,
  };
}
