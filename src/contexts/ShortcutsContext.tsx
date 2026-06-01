import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getSetting, saveSetting } from "@/services/store";
import { SHORTCUT_DEFAULTS } from "@/lib/shortcuts/defaults";
import { matchShortcut } from "@/lib/shortcuts/match";
import {
  DISABLED_BINDING,
  SHORTCUTS_STORE_KEY,
  type KeyCombo,
  type ShortcutBindings,
  type ShortcutId,
} from "@/lib/shortcuts/types";

type ShortcutsContextValue = {
  ready: boolean;
  bindings: ShortcutBindings;
  getBinding: (id: ShortcutId) => KeyCombo;
  setBinding: (id: ShortcutId, combo: KeyCombo) => Promise<void>;
  resetBinding: (id: ShortcutId) => Promise<void>;
  resetAll: () => Promise<void>;
  match: (e: KeyboardEvent, id: ShortcutId) => boolean;
};

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

function buildDefaultBindings(): ShortcutBindings {
  const out = {} as ShortcutBindings;
  for (const id of Object.keys(SHORTCUT_DEFAULTS) as ShortcutId[]) {
    out[id] = SHORTCUT_DEFAULTS[id].combo;
  }
  return out;
}

function mergeWithDefaults(stored: Partial<ShortcutBindings>): ShortcutBindings {
  const out = buildDefaultBindings();
  for (const id of Object.keys(stored ?? {}) as ShortcutId[]) {
    if (id in out && typeof stored[id] === "string") {
      out[id] = stored[id] as KeyCombo;
    }
  }
  return out;
}

export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<ShortcutBindings>(
    buildDefaultBindings,
  );
  const [ready, setReady] = useState(false);
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getSetting<Partial<ShortcutBindings>>(
        SHORTCUTS_STORE_KEY,
        {},
      );
      if (cancelled) return;
      setBindings(mergeWithDefaults(stored ?? {}));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback(async (next: ShortcutBindings) => {
    setBindings(next);
    await saveSetting(SHORTCUTS_STORE_KEY, next);
  }, []);

  const setBinding = useCallback(
    async (id: ShortcutId, combo: KeyCombo) => {
      const next = { ...bindingsRef.current, [id]: combo };
      await persist(next);
    },
    [persist],
  );

  const resetBinding = useCallback(
    async (id: ShortcutId) => {
      const next = {
        ...bindingsRef.current,
        [id]: SHORTCUT_DEFAULTS[id].combo,
      };
      await persist(next);
    },
    [persist],
  );

  const resetAll = useCallback(async () => {
    await persist(buildDefaultBindings());
  }, [persist]);

  const getBinding = useCallback(
    (id: ShortcutId) => bindingsRef.current[id] ?? DISABLED_BINDING,
    [],
  );

  const match = useCallback(
    (e: KeyboardEvent, id: ShortcutId) => {
      const combo = bindingsRef.current[id];
      if (!combo || combo === DISABLED_BINDING) return false;
      return matchShortcut(e, combo);
    },
    [],
  );

  const value = useMemo<ShortcutsContextValue>(
    () => ({ ready, bindings, getBinding, setBinding, resetBinding, resetAll, match }),
    [ready, bindings, getBinding, setBinding, resetBinding, resetAll, match],
  );

  return (
    <ShortcutsContext.Provider value={value}>
      {children}
    </ShortcutsContext.Provider>
  );
}

function useShortcutsContext(): ShortcutsContextValue {
  const ctx = useContext(ShortcutsContext);
  if (!ctx) {
    throw new Error(
      "useShortcuts* must be used inside <ShortcutsProvider>",
    );
  }
  return ctx;
}

export function useShortcuts(): ShortcutsContextValue {
  return useShortcutsContext();
}

export function useShortcutBinding(id: ShortcutId): KeyCombo {
  const { bindings } = useShortcutsContext();
  return bindings[id] ?? DISABLED_BINDING;
}

export function useShortcutBindings(): ShortcutBindings {
  const { bindings } = useShortcutsContext();
  return bindings;
}

export function useShortcutMatcher(): (
  e: KeyboardEvent,
  id: ShortcutId,
) => boolean {
  const { match } = useShortcutsContext();
  return match;
}
