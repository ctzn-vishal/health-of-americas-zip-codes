// Build-time data readers (server only). These run during `next build` for the static
// export, so the landing / methods / sources pages render REAL numbers into crawlable
// HTML — never a "Loading…" shell. Reads the same precomputed payloads the client uses.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ArchetypesPayload,
  ChartsPayload,
  CorrelationsPayload,
  GradientsPayload,
  MentalHealthPayload,
  MetricCatalog,
  PcaPayload,
  RegionCatalog,
  SmokingPayload,
  WealthGapPayload,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

async function readJson<T>(rel: string): Promise<T> {
  const raw = await readFile(path.join(DATA_DIR, rel), "utf8");
  return JSON.parse(raw) as T;
}

export const getMetricCatalog = () => readJson<MetricCatalog>("metric_catalog.json");
export const getRegionCatalog = () => readJson<RegionCatalog>("region_catalog.json");
export const getCharts = (metric: string) => readJson<ChartsPayload>(`charts/${metric}.json`);

export interface CoverageReport {
  generated_at: string;
  source_vintage?: string;
  source_limitations?: string[];
  rows?: {
    n_rows?: number;
    n_with_geometry?: number;
    n_without_geometry?: number;
    n_native?: number;
    n_mixed?: number;
    n_aggregated?: number;
    n_no_health?: number;
    total_backfilled_cells?: number;
  };
}

export const getCoverageReport = () => readJson<CoverageReport>("coverage_report.json");

// analytics payloads (small enough to read at build time for server-rendered prose)
export const getCorrelations = () => readJson<CorrelationsPayload>("analytics/correlations.json");
export const getPca = () => readJson<PcaPayload>("analytics/pca.json");
export const getArchetypes = () => readJson<ArchetypesPayload>("analytics/archetypes.json");
export const getGradients = () => readJson<GradientsPayload>("analytics/gradients.json");
export const getMentalHealth = () => readJson<MentalHealthPayload>("analytics/mental_health.json");
export const getSmoking = () => readJson<SmokingPayload>("analytics/smoking.json");
export const getWealthGap = () => readJson<WealthGapPayload>("analytics/wealth_gap.json");

export interface LandingStats {
  nZip: number;
  nMappableZip: number;
  nMetrics: number;
  nStates: number;
  totalPopulation: number;
  defaultMetric: string;
  defaultMetricLabel: string;
  /** Headline affected-population figure for the default metric, e.g. high-burden pop. */
  highBurdenPopulation: number;
  highBurdenThreshold: number;
  adiGapPts: number | null;
}

/** Assemble the handful of figures the hero + sections quote, from the real payloads. */
export async function getLandingStats(): Promise<LandingStats> {
  const [catalog, regions, coverage] = await Promise.all([getMetricCatalog(), getRegionCatalog(), getCoverageReport()]);
  const def =
    catalog.metrics.find((m) => m.metric_id === catalog.default_metric) ?? catalog.metrics[0];
  const charts = await getCharts(def.metric_id);
  const nStates = regions.regions.filter((r) => r.kind === "state").length;
  const grad = charts.disparity_gradient?.deciles ?? [];
  const adiGapPts = charts.disparity_gradient?.top_minus_bottom ?? null;
  void grad;
  return {
    nZip: coverage.rows?.n_rows ?? def.n_zip + def.missing_count,
    nMappableZip: coverage.rows?.n_with_geometry ?? def.n_zip,
    nMetrics: catalog.metrics.length,
    nStates,
    totalPopulation: charts.summary.total_population,
    defaultMetric: def.metric_id,
    defaultMetricLabel: def.label,
    highBurdenPopulation: charts.summary.high_burden_population,
    highBurdenThreshold: charts.high_burden_threshold,
    adiGapPts,
  };
}
