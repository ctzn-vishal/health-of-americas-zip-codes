// Build compact, snapshot-ready artifacts from the already-generated public/data payloads.
// No Python / Tigris needed — this is a pure post-process over committed JSON.
//
// Emits:
//   public/data/metric_distributions.json   {metric: {bins:[[x0,x1,count]], benchmark, p90, min, max, lower_is_better}}
//   public/data/state_summary.json          {state: {metric: popWeightedMean}}
//   public/data/profiles/{zip2}.json        {zips: {zip: {c:[place,state], pop, comp, q, x, m:{metric:[value,natPct]}}}}
//   public/data/map_values/composite.json   MapValues-shaped layer of the composite burden percentile
//
// Run from web/:  node scripts/build-profiles.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const read = (rel) => JSON.parse(readFileSync(path.join(DATA, rel), "utf8"));
const write = (rel, obj) => writeFileSync(path.join(DATA, rel), JSON.stringify(obj));
const round = (v, d = 1) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

const catalog = read("metric_catalog.json");
const geo = read("geo_catalog.json"); // compact tuple; see geo_catalog.fields
const metrics = catalog.metrics.map((m) => m.metric_id);

// per-ZIP [archetype cluster, PC1 burden percentile] from analytics_v3.py (optional —
// shards still build when the analytics pass hasn't been run yet)
let zipAxes = {};
try {
  zipAxes = read("analytics/zip_axes.json").zips ?? {};
} catch {
  console.warn("analytics/zip_axes.json not found — profiles will omit archetype tags");
}

// ---- load all map_values + national sorted arrays for exact percentiles ----
const values = {}; // metric -> {zip: value}
const sorted = {}; // metric -> ascending values[]
for (const m of metrics) {
  values[m] = read(`map_values/${m}.json`).values;
  sorted[m] = Object.values(values[m])
    .filter((v) => v != null && !Number.isNaN(v))
    .sort((a, b) => a - b);
}

// percentile rank (0..100): share of values strictly below v
function pctRank(arr, v) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  return arr.length ? (lo / arr.length) * 100 : 0;
}

// ---- per-zip values + national percentiles + composite-raw (mean of percentiles) ----
const zips = Object.keys(geo.zips);
const perZip = {}; // zip -> {metric: [value, natPct]}
const compRaw = {}; // zip -> mean national percentile across available metrics (higher = more burden)
for (const z of zips) {
  // positional array in catalog order (null where a measure is missing) — far more
  // compact than repeating metric-name keys for every one of 31k ZIPs.
  const m = [];
  let sum = 0,
    n = 0;
  for (const met of metrics) {
    const v = values[met][z];
    if (v == null || Number.isNaN(v)) {
      m.push(null);
      continue;
    }
    const p = pctRank(sorted[met], v);
    m.push([round(v, 1), Math.round(p)]);
    sum += p;
    n += 1;
  }
  perZip[z] = m;
  compRaw[z] = n ? sum / n : null;
}

// composite percentile: re-rank the composite-raw across all zips (uniform 0..100, higher = more burden)
const compSorted = Object.values(compRaw)
  .filter((v) => v != null)
  .sort((a, b) => a - b);
const compPct = {};
for (const z of zips) compPct[z] = compRaw[z] == null ? null : Math.round(pctRank(compSorted, compRaw[z]));

// ---- composite map layer (MapValues-shaped, drives the metro choropleth) ----
const compositeValues = {};
for (const z of zips) if (compPct[z] != null) compositeValues[z] = compPct[z];
write("map_values/composite.json", {
  metric_id: "composite",
  join_key: "zip",
  unit: "percentile",
  domain: [0, 50, 100],
  benchmark: 50,
  values: compositeValues,
  source: "derived: mean national percentile across measures, re-ranked",
  source_year: null,
  generated_at: catalog.generated_at,
});

// ---- state population-weighted means per metric ----
const agg = {}; // state -> metric -> {sw, w}
for (const z of zips) {
  const g = geo.zips[z];
  const st = g[1];
  if (!st) continue;
  const pop = g[5] || 0;
  (agg[st] ||= {});
  for (const met of metrics) {
    const v = values[met][z];
    if (v == null || Number.isNaN(v)) continue;
    const a = (agg[st][met] ||= { sw: 0, w: 0 });
    a.sw += v * pop;
    a.w += pop;
  }
}
const stateSummary = {};
for (const st of Object.keys(agg)) {
  stateSummary[st] = {};
  for (const met of Object.keys(agg[st])) {
    const a = agg[st][met];
    stateSummary[st][met] = a.w ? round(a.sw / a.w, 1) : null;
  }
}
write("state_summary.json", stateSummary);

// ---- metric distributions (bins/benchmark/p90/min/max) ----
const dists = {};
for (const met of metrics) {
  const ch = read(`charts/${met}.json`);
  const meta = catalog.metrics.find((x) => x.metric_id === met);
  dists[met] = {
    bins: ch.distribution.bins.map((b) => [b.x0, b.x1, b.count]),
    benchmark: ch.distribution.benchmark,
    p90: ch.distribution.p90,
    min: meta.value_min,
    max: meta.value_max,
    lower_is_better: meta.lower_is_better,
  };
}
write("metric_distributions.json", dists);

// ---- per-zip profile shards by 2-digit prefix ----
mkdirSync(path.join(DATA, "profiles"), { recursive: true });
const shards = {};
for (const z of zips) {
  const g = geo.zips[z];
  const key = z.slice(0, 2);
  (shards[key] ||= { zips: {} });
  shards[key].zips[z] = {
    c: [g[0], g[1]],
    pop: g[5],
    comp: compPct[z],
    a: zipAxes[z] ?? null,
    // q = health/provenance quality tuple: [source, n_measures, n_backfilled, has_geometry]
    q: [g[8] ?? "none", g[9] ?? 0, g[10] ?? 0, g[19] ?? true],
    // x = compact context tuple: [ADI, income, poverty, college, Black, Hispanic, 65+, urban]
    x: [g[11] ?? null, g[12] ?? null, g[13] ?? null, g[14] ?? null, g[15] ?? null, g[16] ?? null, g[17] ?? null, g[18] ?? null],
    m: perZip[z],
  };
}
for (const k of Object.keys(shards)) write(`profiles/${k}.json`, shards[k]);

console.log(
  `done: ${zips.length} zips · ${Object.keys(shards).length} profile shards · ${Object.keys(stateSummary).length} states`,
);
