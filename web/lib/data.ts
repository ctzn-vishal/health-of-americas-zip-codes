// Static payload loaders. Everything is a plain static asset under /data — no server,
// no secret. Each fetch is cached in-memory so metric switches never refetch.
import type {
  ChartsPayload,
  GeoCatalog,
  InsightsPayload,
  MapValues,
  MetricCatalog,
  RegionCatalog,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const cache = new Map<string, Promise<unknown>>();

function get<T>(path: string): Promise<T> {
  const url = `${BASE}/data/${path}`;
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
        return r.json();
      }),
    );
  }
  return cache.get(url) as Promise<T>;
}

export const loadMetricCatalog = () => get<MetricCatalog>("metric_catalog.json");
export const loadRegionCatalog = () => get<RegionCatalog>("region_catalog.json");
export const loadGeoCatalog = () => get<GeoCatalog>("geo_catalog.json");
export const loadMapValues = (metric: string) => get<MapValues>(`map_values/${metric}.json`);
export const loadCharts = (metric: string) => get<ChartsPayload>(`charts/${metric}.json`);
export const loadInsights = (metric: string) => get<InsightsPayload>(`insights/${metric}.json`);
