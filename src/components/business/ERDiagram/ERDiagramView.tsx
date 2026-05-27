import { useEffect, useState } from "react";
import { api } from "@/services/api";
import ERDiagramCanvas from "./ERDiagramCanvas";
import { buildDiagramData } from "./types";
import { useTranslation } from "react-i18next";

interface ERDiagramViewProps {
  connectionId: number;
  database?: string;
  schema?: string;
}

export default function ERDiagramView({
  connectionId,
  database,
  schema,
}: ERDiagramViewProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagramData, setDiagramData] = useState<ReturnType<typeof buildDiagramData> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [overview, foreignKeys] = await Promise.all([
          api.metadata.getSchemaOverview(connectionId, database, schema),
          api.metadata.getSchemaForeignKeys(connectionId, database, schema),
        ]);

        if (cancelled) return;

        if (foreignKeys.length === 0) {
          setError(t("erDiagram.noForeignKeys"));
          setLoading(false);
          return;
        }

        const data = buildDiagramData(overview, foreignKeys);
        setDiagramData(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [connectionId, database, schema, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">{t("erDiagram.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-muted-foreground">{error}</span>
      </div>
    );
  }

  if (!diagramData) return null;

  return <ERDiagramCanvas data={diagramData} />;
}
