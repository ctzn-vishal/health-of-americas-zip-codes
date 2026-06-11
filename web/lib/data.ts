// Static payload loaders. Everything is a plain static asset under /data — no server,
// no secret. Each fetch is cached in-memory so metric switches never refetch.
import type {
  ArchetypesPayload,
  ChartsPayload,
  CorrelationsPayload,
  DotmapPayload,
  GeoCatalog,
  GradientsPayload,
  InsightsPayload,
  MapValues,
  MentalHealthPayload,
  MetricCatalog,
  MetricDistributions,
  PcaPayload,
  SmokingPayload,
  ProfileShard,
  RegionCatalog,
  StateSummary,
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

// snapshot ("by place") payloads
export const loadMetricDistributions = () => get<MetricDistributions>("metric_distributions.json");
export const loadStateSummary = () => get<StateSummary>("state_summary.json");
export const loadProfileShard = (zip2: string) => get<ProfileShard>(`profiles/${zip2}.json`);
export const loadComposite = () => get<MapValues>("map_values/composite.json");

// analytics ("stories") payloads
export const loadCorrelations = () => get<CorrelationsPayload>("analytics/correlations.json");
export const loadPca = () => get<PcaPayload>("analytics/pca.json");
export const loadArchetypes = () => get<ArchetypesPayload>("analytics/archetypes.json");
export const loadGradients = () => get<GradientsPayload>("analytics/gradients.json");
export const loadDotmap = () => get<DotmapPayload>("analytics/dotmap.json");
export const loadMentalHealth = () => get<MentalHealthPayload>("analytics/mental_health.json");
export const loadSmoking = () => get<SmokingPayload>("analytics/smoking.json");
