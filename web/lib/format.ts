import * as d3 from "d3";

/** Formatter for a metric value given its d3 format spec (e.g. ".1f"), with unit suffix. */
export function valueFmt(spec: string, unit = "percent") {
  const f = d3.format(spec || ".1f");
  const suffix = unit === "percent" ? "%" : "";
  return (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : `${f(v)}${suffix}`);
}

export function gapFmt(spec: string) {
  const f = d3.format(spec || ".1f");
  return (g: number | null | undefined) => {
    if (g == null || Number.isNaN(g)) return "—";
    const s = f(Math.abs(g));
    return g > 0 ? `+${s}` : g < 0 ? `−${s}` : `±0`;
  };
}

export const fmtPop = (n: number) => {
  if (n == null) return "—";
  if (n >= 1e6) return `${d3.format(".1f")(n / 1e6)}M`;
  if (n >= 1e3) return `${d3.format(".0f")(n / 1e3)}k`;
  return `${n}`;
};

export const fmtInt = d3.format(",");
export const fmtPct1 = d3.format(".1f");

export const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Percentile rank (0..100) of v within a sorted ascending array. */
export function percentileOf(sorted: number[], v: number): number {
  if (sorted.length === 0) return 0;
  const i = d3.bisectLeft(sorted, v);
  return (i / sorted.length) * 100;
}
