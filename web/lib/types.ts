// Payload types — mirror the data contract (docs/data-contract.md) and prep output.
// The app reads semantics from these; it never infers meaning from column names.

export type Mode = "rate" | "gap" | "percentile";

export interface MetricMeta {
  metric_id: string;
  label: string;
  short_label: string;
  topic: string;
  unit: "percent" | "percentile";
  format: string; // d3 format spec, e.g. ".1f"
  lower_is_better: boolean;
  domain: [number, number, number]; // [min, benchmark/mid, max]
  scale_kind: "sequential";
  benchmark_kind: string;
  benchmark: number;
  p90: number;
  denominator: string;
  description: string;
  source: string;
  source_url: string;
  source_from: "tiles" | "parquet";
  source_year: number | null;
  vintage_note: string;
  confidence_interval_available: boolean;
  suppression_rule: string;
  missingness_note: string;
  n_zip: number;
  missing_count: number;
  value_min: number;
  value_max: number;
}

export interface MetricCatalog {
  metrics: MetricMeta[];
  default_metric: string;
  generated_at: string;
  sources: { pmtiles: string; parquet: string };
}

export interface MapValues {
  metric_id: string;
  join_key: string;
  unit: string;
  domain: [number, number, number];
  benchmark: number;
  values: Record<string, number>;
  source: string;
  source_year: number | null;
  generated_at: string;
}

export interface RankedPlace {
  zip: string;
  city: string;
  state: string;
  value: number;
  population: number;
  gap: number;
}

export interface HistBin {
  x0: number;
  x1: number;
  count: number;
}

export interface Correlation {
  context: string;
  label: string;
  short: string;
  rho: number | null;
  n: number;
}

export interface GradientDecile {
  decile: number;
  value: number;
  lci: number;
  uci: number;
  n: number;
  adi_lo: number;
  adi_hi: number;
}

export interface ScatterPoint {
  zip: string;
  x: number;
  y: number;
}

export interface ResidualPlace {
  zip: string;
  city: string;
  state: string;
  x: number;
  y: number;
  resid: number;
}

export interface ChartsPayload {
  metric_id: string;
  benchmark: number;
  high_burden_threshold: number;
  summary: {
    national_average: number;
    unweighted_mean: number;
    n_zip: number;
    high_burden_population: number;
    total_population: number;
    high_burden_pct_pop: number;
  };
  ranked_top: RankedPlace[];
  ranked_bottom: RankedPlace[];
  distribution: { bins: HistBin[]; benchmark: number; p90: number };
  correlations: Correlation[];
  disparity_gradient: { by: string; deciles: GradientDecile[]; top_minus_bottom: number | null };
  scatter: {
    context: string;
    points: ScatterPoint[];
    loess: [number, number][];
    worse_than_expected: ResidualPlace[];
    better_than_expected: ResidualPlace[];
  };
  source: string;
  generated_at: string;
}

export interface Insight {
  insight_id: string;
  type: string;
  rank: number;
  claim: string;
  value: number | null;
  supporting_geo_id: string | null;
  supporting_chart: string;
  severity: "info" | "low" | "medium" | "high";
  method_note: string;
}

export interface InsightsPayload {
  metric_id: string;
  insights: Insight[];
  generated_at: string;
}

// geo_catalog: compact [city, state, region, lat, lon, pop]
export type GeoRecord = [string, string, string, number, number, number];
export interface GeoCatalog {
  fields: string[];
  zips: Record<string, GeoRecord>;
  generated_at: string;
}

export interface Region {
  id: string;
  label: string;
  kind: "national" | "census_region" | "state";
  bounds: [number, number, number, number]; // [w, s, e, n]
  default?: boolean;
  n_zip?: number;
}
export interface RegionCatalog {
  regions: Region[];
  generated_at: string;
}

// ---- snapshot ("by place") artifacts (precomputed by scripts/build-profiles.mjs) ----
export interface MetricDistribution {
  bins: [number, number, number][]; // [x0, x1, count]
  benchmark: number;
  p90: number;
  min: number;
  max: number;
  lower_is_better: boolean;
}
export type MetricDistributions = Record<string, MetricDistribution>;

// state -> metric_id -> population-weighted mean value
export type StateSummary = Record<string, Record<string, number>>;

export interface ProfileZip {
  c: [string, string]; // [city, state]
  pop: number;
  comp: number | null; // composite burden percentile 0..100 (higher = more burden)
  m: ([number, number] | null)[]; // per metric, in metric_catalog order: [value, national pct] | null
}
export interface ProfileShard {
  zips: Record<string, ProfileZip>;
}

// Shared props for every analytical panel (uniform render + cross-highlight contract).
export interface PanelProps {
  charts: ChartsPayload;
  meta: MetricMeta;
  selected?: string; // selected ZIP (shared cross-highlight key)
  selectedValue?: number; // this metric's value for the selected ZIP, if known
  onSelect?: (zip: string | null) => void;
  onHover?: (zip: string | null) => void;
}

export const PMTILES_URL =
  "https://ontopic-public-data.t3.tigrisfiles.io/pmtiles/Health_Zip_converted.pmtiles";
export const SOURCE_LAYER = "zipcode_demographics";
export const JOIN_KEY = "zip_code";
