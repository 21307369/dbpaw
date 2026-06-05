import { useEffect, useState } from "react";
import { isTauri } from "@/services/api";

export function useWindowFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    let mounted = true;
    let unlistenResized: null | (() => void) = null;

    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
      const appWindow = getCurrentWindow();

      const syncFullscreenState = async () => {
        try {
          const fullscreen = await appWindow.isFullscreen();
          if (mounted) setIsFullscreen(fullscreen);
        } catch {
          // Ignore window state lookup failures in non-native contexts.
        }
      };

      void syncFullscreenState();
      appWindow
        .onResized(() => {
          void syncFullscreenState();
        })
        .then((unlisten) => {
          unlistenResized = unlisten;
        })
        .catch(() => {});
    });

    return () => {
      mounted = false;
      if (unlistenResized) unlistenResized();
    };
  }, []);

  return isFullscreen;
}
