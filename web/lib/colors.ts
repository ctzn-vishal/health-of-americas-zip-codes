// Color-role ledger (single source for map + charts). Assign roles, not pretty colors.
//   neutral context · sequential ramp (burden) · diverging ramp (gap vs benchmark) ·
//   distinct selected/focus · explicit no-data.
// All ramps chosen for luminance progression (grayscale-legible) and CVD resilience
// (warm vs cool, never red/green as the sole contrast). Selection is encoded by
// weight + halo + label, never by color alone.
import * as d3 from "d3";
import type { Mode } from "./types";

// Sequential (rate mode): low burden -> high burden. ColorBrewer YlOrRd, luminance-ordered.
export const SEQUENTIAL = ["#ffffcc", "#fed976", "#fd8d3c", "#f03b20", "#bd0026"];
// Diverging (gap mode): better-than-US (cool) <-> at US avg (neutral) <-> worse (warm). RdBu.
export const DIVERGING = ["#2166ac", "#67a9cf", "#f7f7f7", "#ef8a62", "#b2182b"];

// Cool medium grey for no-data — chosen for >=3:1 luminance contrast against BOTH ramp
// centers (the diverging midpoint #f7f7f7 and the sequential low #ffffcc) AND the dark
// basemap, so "no estimate" reads as absent rather than "at the U.S. average" or "low burden".
export const NODATA = "#5d6675";
// Dark "observatory" theme: emphasis ink is light (pops on the dark basemap/panels), the
// selection halo is the panel/plot background (separates a light mark from its neighbours),
// and gridlines/benchmark/context recede without disappearing.
export const INK = "#eef2f8"; // focus/selected outline + selected chart marks + data lines
export const HALO = "#0c1420"; // halo behind selected marks (≈ panel/plot background)
export const BENCH = "#9aa6b8"; // benchmark reference line/marker (light slate)
export const CONTEXT_GREY = "#8893a6";
export const GRID = "#222d3d";

/** Symmetric half-range for gap mode, derived from the metric domain + benchmark. */
export function gapExtent(domain: [number, number, number], benchmark: number): number {
  return Math.max(Math.abs(domain[0] - benchmark), Math.abs(domain[2] - benchmark)) || 1;
}

/** Continuous color scale for a given mode (used by legend + charts). */
export function colorScale(
  mode: Mode,
  domain: [number, number, number],
  benchmark: number,
): (v: number) => string {
  if (mode === "gap") {
    const g = gapExtent(domain, benchmark);
    const s = d3
      .scaleLinear<string>()
      .domain([-g, -g / 2, 0, g / 2, g])
      .range(DIVERGING)
      .interpolate(d3.interpolateRgb)
      .clamp(true);
    return (v: number) => s(v - benchmark);
  }
  if (mode === "percentile") {
    const s = d3
      .scaleLinear<string>()
      .domain([0, 25, 50, 75, 100])
      .range(SEQUENTIAL)
      .interpolate(d3.interpolateRgb)
      .clamp(true);
    return (v: number) => s(v); // v is already a 0..100 percentile here
  }
  // rate
  const s = d3
    .scaleLinear<string>()
    .domain([domain[0], (domain[0] + domain[1]) / 2, domain[1], (domain[1] + domain[2]) / 2, domain[2]])
    .range(SEQUENTIAL)
    .interpolate(d3.interpolateRgb)
    .clamp(true);
  return (v: number) => s(v);
}

/**
 * MapLibre `fill-color` expression. The hook pushes two feature-state fields once per
 * metric: `val` (raw value) and `pct` (national percentile 0..100). Switching MODE only
 * swaps this expression (setPaintProperty) — no feature-state repaint, no source rebuild.
 *   rate       -> interpolate over [min..max] of ["feature-state","val"]
 *   gap        -> interpolate over [-g..g] of (val - benchmark), computed inline
 *   percentile -> interpolate over [0..100] of ["feature-state","pct"]
 * Missing feature-state -> explicit NODATA.
 */
export function maplibreColorExpr(
  mode: Mode,
  domain: [number, number, number],
  benchmark: number,
): any {
  let stopsDomain: number[];
  let colors: string[];
  let input: any;
  let nullField: string;
  if (mode === "gap") {
    const g = gapExtent(domain, benchmark);
    stopsDomain = [-g, -g / 2, 0, g / 2, g];
    colors = DIVERGING;
    input = ["-", ["feature-state", "val"], benchmark];
    nullField = "val";
  } else if (mode === "percentile") {
    stopsDomain = [0, 25, 50, 75, 100];
    colors = SEQUENTIAL;
    input = ["feature-state", "pct"];
    nullField = "pct";
  } else {
    stopsDomain = [
      domain[0],
      (domain[0] + domain[1]) / 2,
      domain[1],
      (domain[1] + domain[2]) / 2,
      domain[2],
    ];
    colors = SEQUENTIAL;
    input = ["feature-state", "val"];
    nullField = "val";
  }
  const interp: any[] = ["interpolate", ["linear"], input];
  for (let i = 0; i < stopsDomain.length; i++) interp.push(stopsDomain[i], colors[i]);
  return ["case", ["==", ["feature-state", nullField], null], NODATA, interp];
}

/** Legend tick stops for the current mode. Returns [{ value, color, label }]. */
export function legendStops(
  mode: Mode,
  domain: [number, number, number],
  benchmark: number,
  fmt: (n: number) => string,
): { t: number; color: string; label: string }[] {
  const cs = colorScale(mode, domain, benchmark);
  if (mode === "gap") {
    const g = gapExtent(domain, benchmark);
    const vals = [-g, -g / 2, 0, g / 2, g];
    return vals.map((d) => ({
      t: (d + g) / (2 * g),
      color: cs(benchmark + d),
      label: d === 0 ? "U.S. avg" : `${d > 0 ? "+" : ""}${fmt(d)}`,
    }));
  }
  if (mode === "percentile") {
    return [0, 25, 50, 75, 100].map((p) => ({ t: p / 100, color: cs(p), label: `${p}` }));
  }
  // Place stops at their TRUE normalized positions so the legend gradient is value-linear
  // and matches the map's linear interpolation (the benchmark is not the range midpoint).
  const vals = [domain[0], (domain[0] + domain[1]) / 2, domain[1], (domain[1] + domain[2]) / 2, domain[2]];
  const span = domain[2] - domain[0] || 1;
  return vals.map((d) => ({ t: (d - domain[0]) / span, color: cs(d), label: fmt(d) }));
}
