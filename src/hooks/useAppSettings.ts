import { useEffect, useState } from "react";
import { getSetting } from "@/services/store";

export type SidebarLayoutMode = "tabs" | "tree";

export function useAppSettings() {
  const [sidebarLayout, setSidebarLayout] = useState<SidebarLayoutMode>("tabs");
  const [showColumnComments, setShowColumnComments] = useState(false);
  const [showRowNumbers, setShowRowNumbers] = useState(true);
  const [showZebraStripes, setShowZebraStripes] = useState(false);

  useEffect(() => {
    void getSetting<SidebarLayoutMode>("sidebarLayout", "tabs").then((layout) => {
      setSidebarLayout(layout === "tree" ? "tree" : "tabs");
    });
    void getSetting("showColumnComments", false).then(setShowColumnComments);
    void getSetting("showRowNumbers", true).then(setShowRowNumbers);
    void getSetting("showZebraStripes", false).then(setShowZebraStripes);
  }, []);

  return {
    sidebarLayout,
    setSidebarLayout,
    showColumnComments,
    setShowColumnComments,
    showRowNumbers,
    setShowRowNumbers,
    showZebraStripes,
    setShowZebraStripes,
  };
}
