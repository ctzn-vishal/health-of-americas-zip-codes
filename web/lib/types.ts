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
  source_column?: string;
  source_year: number | null;
  vintage_note: string;
  provenance_note?: string;
  confidence_interval_available: boolean;
  suppression_rule: string;
  missingness_note: string;
  n_zip: number;
  missing_count: number;
  value_min: number;
  value_max: number;
  native_rows?: number;
  mixed_rows?: number;
  aggregated_rows?: number;
  no_geometry_rows?: number;
}

export interface MetricCatalog {
  metrics: MetricMeta[];
  default_metric: string;
  generated_at: string;
  sources: { pmtiles: string; parquet: string; metadata?: string };
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

// geo_catalog compact tuple, field names are carried by payload.fields.
// V2 extends the original [city, state, region, lat, lon, pop] with county,
// provenance, and demographic context while preserving the first six slots.
export type GeoRecord = [
  string,
  string | null,
  string | null,
  number,
  number,
  number,
  (string | null)?,
  (string | null)?,
  string?,
  number?,
  number?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  (number | null)?,
  (boolean | null)?,
  (boolean | null)?,
];
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
  c: [string, string | null]; // [city, state]
  pop: number;
  comp: number | null; // composite burden percentile 0..100 (higher = more burden)
  a?: [number, number] | null; // [archetype cluster id, PC1 burden percentile] — see analytics/zip_axes.json
  q?: [string, number, number, boolean]; // [health_source, health_n_measures, health_n_backfilled, has_geometry]
  x?: [
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    number | null,
    boolean | null,
  ]; // [ADI, income, poverty, college, Black, Hispanic, 65+, urban]
  m: ([number, number] | null)[]; // per metric, in metric_catalog order: [value, national pct] | null
}
export interface ProfileShard {
  zips: Record<string, ProfileZip>;
}

// ---- analytics (stories) payloads, emitted by data-prep/analytics_v3.py ----
export interface CorrelationsPayload {
  n: number;
  method: string;
  ids: string[]; // hierarchically ordered
  labels: string[];
  topics: string[];
  matrix: (number | null)[][]; // Spearman rho, same ordering as ids
  context_keys: string[];
  context_labels: string[];
  context_higher: string[];
  context_matrix: (number | null)[][]; // [measure][context]
  top_pairs: { a: string; b: string; rho: number; a_label: string; b_label: string }[];
  generated_at: string;
}

export interface PcaPayload {
  n: number;
  method: string;
  ids: string[]; // catalog order
  labels: string[];
  topics: string[];
  explained: number[]; // variance ratio per component
  loadings: number[][]; // [pc 0..2][measure]
  pc_context: Record<string, number | null>[]; // Spearman of each PC score vs context vars
  context_labels: Record<string, string>;
  scatter: {
    zip: string[];
    state: (string | null)[];
    pc1: number[];
    pc2: number[];
    adi: (number | null)[];
    income: (number | null)[];
    dense: boolean[]; // population density >= 1000 / sq mi
    pop: number[];
  };
  generated_at: string;
}

export interface ArchetypeCluster {
  id: number;
  n: number; // complete-case (fit) count
  pop: number; // complete-case population
  n_assigned: number; // nearest-centroid assignment, >= 18 of 26 measures observed
  pop_assigned: number;
  share: number;
  label: string;
  blurb: string;
  dense_share: number;
  pc1_mean: number;
  z: Record<string, number>; // mean z-score per measure
  raw: Record<string, number>; // mean raw value per measure
  context: Record<string, number | null>;
  exemplars: { zip: string; place: string; state: string; pop: number }[];
}

export interface ArchetypesPayload {
  k: number;
  n: number; // complete-case (fit) count
  n_assigned: number; // total ZCTAs with an archetype assignment
  silhouette: number;
  method: string;
  ids: string[];
  labels: string[];
  topics: string[];
  context_labels: Record<string, string>;
  clusters: ArchetypeCluster[];
  generated_at: string;
}

export interface GradientsPayload {
  method: string;
  metrics: {
    id: string;
    short: string;
    topic: string;
    benchmark: number;
    d: number[]; // pop-weighted mean per ADI decile (1..10)
    gap: number; // d10 - d1
    rel: number | null; // d10 / d1
  }[];
  generated_at: string;
}

export interface WealthGapPayload {
  n: number;
  min_population: number;
  method: string;
  score: {
    definition: string;
    bottom_cutoff: number;
    top_cutoff: number;
    worse_count: number;
    reverse_count: number;
    largest_gap_metric: string;
    largest_gap_points: number;
    largest_gap_ratio: number;
  };
  inputs: {
    key: string;
    label: string;
    short: string;
    higher_means: string;
    unit: "dollars" | "percent" | "percentile";
    score_direction: 1 | -1;
  }[];
  correlation: {
    method: string;
    keys: string[];
    labels: string[];
    higher: string[];
    matrix: number[][];
    score: { key: string; rho: number; aligned_rho: number }[];
  };
  groups: {
    id: "bottom" | "national" | "top";
    label: string;
    n: number;
    population: number;
    score: number;
    score_pct: number;
    components: Record<string, { raw: number | null; score: number | null }>;
  }[];
  metrics: {
    id: string;
    label: string;
    short: string;
    topic: string;
    top: number | null;
    bottom: number | null;
    national: number | null;
    gap: number | null;
    ratio: number | null;
  }[];
  deciles: {
    decile: number;
    n: number;
    population: number;
    score_lo: number;
    score_hi: number;
    score: number;
    metrics: Record<string, number | null>;
  }[];
  generated_at: string;
}

export interface DotmapPayload {
  n: number;
  n_covered: number;
  lon: number[];
  lat: number[];
  pc1: number[]; // PC1 burden percentile 0..100; -1 = not in complete case
  cluster: number[]; // -1 = not in complete case
  pop: number[];
  generated_at: string;
}

// outcome-story payloads (analytics/mental_health.json, analytics/smoking.json)
export interface OutcomeMapData {
  lon: number[];
  lat: number[];
  v: number[];
  pop: number[];
  label: string;
  center: number; // diverging midpoint (national ratio / zero residual)
}

export interface MentalHealthPayload {
  n: number;
  method: string;
  national_ratio: number;
  corr: {
    dep_vs_dis: number;
    dep: Record<string, number | null>;
    dis: Record<string, number | null>;
    ratio: Record<string, number | null>;
  };
  fit: { slope: number; intercept: number };
  states: { state: string; dep: number; dis: number; ratio: number; n: number }[];
  scatter: {
    zip: string[];
    state: (string | null)[];
    x: number[]; // distress
    y: number[]; // diagnosed depression
    income: (number | null)[];
    pop: number[];
  };
  map: OutcomeMapData;
  generated_at: string;
}

export interface SmokingPayload {
  n: number;
  method: string;
  rho_adi: number;
  corr: Record<string, number | null>;
  curve: [number, number][]; // quadratic fit over ADI grid
  states: { state: string; resid: number; smoke: number; n: number }[];
  scatter: {
    zip: string[];
    state: (string | null)[];
    x: number[]; // ADI
    y: number[]; // smoking
    pop: number[];
  };
  map: OutcomeMapData;
  generated_at: string;
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
