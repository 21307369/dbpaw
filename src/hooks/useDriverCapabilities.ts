import { useState, useEffect } from "react";
import { api } from "@/services/api";
import {
  decodeCapabilities,
  EMPTY_CAPABILITIES,
  DriverCapabilities,
} from "@/lib/driver-capabilities";

const capabilitiesCache = new Map<number, DriverCapabilities>();

export function useDriverCapabilities(
  connectionId: number | null,
): DriverCapabilities {
  const [capabilities, setCapabilities] = useState<DriverCapabilities>(() =>
    connectionId !== null
      ? capabilitiesCache.get(connectionId) ?? EMPTY_CAPABILITIES
      : EMPTY_CAPABILITIES,
  );

  useEffect(() => {
    if (connectionId === null) {
      setCapabilities(EMPTY_CAPABILITIES);
      return;
    }

    const cached = capabilitiesCache.get(connectionId);
    if (cached) {
      setCapabilities(cached);
      return;
    }

    let cancelled = false;
    api.metadata
      .getCapabilities(connectionId)
      .then((bits) => {
        if (cancelled) return;
        const caps = decodeCapabilities(bits);
        capabilitiesCache.set(connectionId, caps);
        setCapabilities(caps);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(EMPTY_CAPABILITIES);
      });

    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  return capabilities;
}
