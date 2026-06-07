import { useEffect, useRef } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { MapValues } from "@/lib/types";
import { percentileOf } from "@/lib/format";

/**
 * Paint a metric onto the PMTiles layer via feature-state. Pushes two fields per ZIP:
 *   val — raw value · pct — national percentile (0..100)
 * Recolors WITHOUT rebuilding the source. Mode switches are handled by the paint
 * expression alone (see colors.ts) and do not call this hook.
 */
export function useFeatureStateMetric(
  map: MLMap | null,
  ready: boolean,
  source: string,
  sourceLayer: string,
  payload: MapValues | null,
) {
  const painted = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!map || !ready || !payload) return;
    const entries = Object.entries(payload.values);
    const sorted = entries.map(([, v]) => v).sort((a, b) => a - b);

    // clear ids no longer present
    for (const id of painted.current) {
      if (!(id in payload.values)) {
        map.setFeatureState({ source, sourceLayer, id }, { val: null, pct: null });
      }
    }
    const next = new Set<string>();
    for (const [id, v] of entries) {
      const pct = percentileOf(sorted, v);
      map.setFeatureState({ source, sourceLayer, id: String(id) }, { val: v, pct });
      next.add(String(id));
    }
    painted.current = next;
  }, [map, ready, source, sourceLayer, payload]);
}

/** Set a single interaction flag (hover/selected), clearing the previous id. */
export function setInteractionState(
  map: MLMap,
  source: string,
  sourceLayer: string,
  field: "hover" | "selected",
  id: string | null,
  prev: string | null,
) {
  if (prev && prev !== id) map.setFeatureState({ source, sourceLayer, id: prev }, { [field]: false });
  if (id) map.setFeatureState({ source, sourceLayer, id }, { [field]: true });
}
