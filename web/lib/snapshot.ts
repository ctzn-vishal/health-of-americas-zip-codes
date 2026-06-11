import type { MetricMeta } from "./types";

// Synthetic meta so the metro map / legend can render the precomputed composite layer
// (map_values/composite.json) through the same machinery as a real metric.
export const COMPOSITE_META: MetricMeta = {
  metric_id: "composite",
  label: "Overall health burden",
  short_label: "Overall burden",
  topic: "Composite",
  unit: "percentile",
  format: ".0f",
  lower_is_better: true,
  domain: [0, 50, 100],
  scale_kind: "sequential",
  benchmark_kind: "percentile",
  benchmark: 50,
  p90: 90,
  denominator: "available burden-oriented measures",
  description:
    "Composite burden percentile — the average of each ZIP's national percentiles across available burden-oriented measures, re-ranked nationally",
  source: "Derived from the 26 featured measures (experimental)",
  source_url: "",
  source_from: "parquet",
  source_year: null,
  vintage_note: "CDC PLACES 2025, ACS context, ADI 2023 v4.0.1",
  confidence_interval_available: false,
  suppression_rule: "none",
  missingness_note: "",
  n_zip: 32409,
  missing_count: 0,
  value_min: 0,
  value_max: 100,
};

// Community archetypes from the k-means pass (data-prep/analytics_v3.py, burden-ordered).
// Labels must match ARCHETYPE_LABELS there and analytics/archetypes.json.
export const ARCHETYPES: { label: string; short: string }[] = [
  { label: "Comfortable suburbs", short: "Comfortable suburb" },
  { label: "Young metro strivers", short: "Young metro" },
  { label: "Aging small towns", short: "Aging small town" },
  { label: "Left-behind communities", short: "Left-behind" },
];

export interface StandoutMeasure {
  metric: MetricMeta;
  value: number;
  pct: number; // national percentile, higher = more burden
}

/**
 * The most intuitive single-glance summary of a profile: the measures where this ZIP
 * stands furthest from the middle of the national distribution, split into what is
 * going well (lowest percentiles) and what stands out as a concern (highest).
 */
export function standouts(
  metrics: MetricMeta[],
  m: ([number, number] | null)[],
  count = 3,
): { strengths: StandoutMeasure[]; concerns: StandoutMeasure[] } {
  const rows: StandoutMeasure[] = [];
  metrics.forEach((meta, i) => {
    const rec = m[i];
    if (!rec) return;
    rows.push({ metric: meta, value: rec[0], pct: rec[1] });
  });
  const byPct = [...rows].sort((a, b) => a.pct - b.pct);
  const strengths = byPct.filter((r) => r.pct <= 40).slice(0, count);
  const concerns = byPct
    .filter((r) => r.pct >= 60)
    .slice(-count)
    .reverse();
  return { strengths, concerns };
}

export interface DomainGroup {
  topic: string;
  metrics: MetricMeta[];
}

/** Group metrics by their topic, preserving catalog order. */
export function groupByDomain(metrics: MetricMeta[]): DomainGroup[] {
  const groups: DomainGroup[] = [];
  const index = new Map<string, DomainGroup>();
  for (const m of metrics) {
    let g = index.get(m.topic);
    if (!g) {
      g = { topic: m.topic, metrics: [] };
      index.set(m.topic, g);
      groups.push(g);
    }
    g.metrics.push(m);
  }
  return groups;
}

export interface ScoreReading {
  score: number; // 0..100, higher = healthier
  band: string; // qualitative label
  healthierThan: number; // % of U.S. ZIP areas this place is healthier than
}

/**
 * Turn a composite burden percentile (0..100, higher = more burden) into a health score
 * (0..100, higher = healthier) and a plain-language band.
 */
export function readScore(compositeBurdenPct: number | null): ScoreReading | null {
  if (compositeBurdenPct == null || Number.isNaN(compositeBurdenPct)) return null;
  const score = Math.round(100 - compositeBurdenPct);
  const healthierThan = score;
  let band = "Average overall burden";
  if (score >= 80) band = "Much lower overall burden";
  else if (score >= 60) band = "Lower overall burden";
  else if (score >= 40) band = "Near the national middle";
  else if (score >= 20) band = "Higher overall burden";
  else band = "Much higher overall burden";
  return { score, band, healthierThan };
}
