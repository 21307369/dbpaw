import { useState, useCallback, useRef, useEffect } from "react";

export function useSqlEditorForm(props: {
  value?: string;
  onChange?: (value: string) => void;
}) {
  const { value, onChange } = props;
  const [internalSql, setInternalSql] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const code = value !== undefined ? value : internalSql;

  const handleSqlChange = useCallback(
    (val: string) => {
      if (value === undefined) {
        setInternalSql(val);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (onChange) {
          onChange(val);
        }
      }, 300);
    },
    [onChange, value],
  );

  return { code, handleSqlChange };
}
