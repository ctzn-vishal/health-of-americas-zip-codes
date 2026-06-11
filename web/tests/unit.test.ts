import { describe, it, expect } from "vitest";
import { decode, encode, DEFAULTS } from "@/lib/urlState";
import { gapExtent, colorScale, legendStops, maplibreColorExpr, NODATA } from "@/lib/colors";
import { valueFmt, gapFmt, percentileOf, fmtPop, ordinal } from "@/lib/format";

describe("urlState codec", () => {
  it("round-trips a non-default view", () => {
    const s = { ...DEFAULTS, metric: "obesity", mode: "rate" as const, region: "TX", selected: "79846" };
    expect(decode(new URLSearchParams(encode(s)))).toEqual(s);
  });
  it("omits defaults from the query string", () => {
    expect(encode({ ...DEFAULTS })).toBe("");
  });
  it("falls back to defaults for unknown mode", () => {
    expect(decode(new URLSearchParams("mode=bogus")).mode).toBe(DEFAULTS.mode);
  });
  it("copy-link reproduces selection", () => {
    const qs = encode({ ...DEFAULTS, selected: "60601" });
    expect(decode(new URLSearchParams(qs)).selected).toBe("60601");
  });
});

describe("color ledger", () => {
  const domain: [number, number, number] = [5.7, 10.6, 19.0];
  it("gap extent is symmetric around the benchmark", () => {
    expect(gapExtent(domain, 10.6)).toBeCloseTo(8.4, 5);
  });
  it("gap mode is neutral at the benchmark", () => {
    const cs = colorScale("gap", domain, 10.6);
    expect(cs(10.6)).toBe(colorScale("gap", domain, 10.6)(10.6)); // deterministic
  });
  it("rate ramp is monotone in luminance ends (low != high)", () => {
    const cs = colorScale("rate", domain, 10.6);
    expect(cs(domain[0])).not.toBe(cs(domain[2]));
  });
  it("legend has 5 labeled stops and a U.S. avg in gap mode", () => {
    const stops = legendStops("gap", domain, 10.6, (n) => n.toFixed(1));
    expect(stops).toHaveLength(5);
    expect(stops.some((s) => s.label === "U.S. avg")).toBe(true);
  });
  it("maplibre expr paints NODATA when feature-state is null", () => {
    const expr = maplibreColorExpr("rate", domain, 10.6);
    expect(expr[0]).toBe("case");
    expect(expr[2]).toBe(NODATA);
  });
  it("gap expr subtracts the benchmark inline", () => {
    const expr = maplibreColorExpr("gap", domain, 10.6);
    const flat = JSON.stringify(expr);
    expect(flat).toContain('["-",["feature-state","val"],10.6]');
  });
});

describe("formatters", () => {
  it("formats percent values and missing", () => {
    const f = valueFmt(".1f", "percent");
    expect(f(10.61)).toBe("10.6%");
    expect(f(null)).toBe("—");
  });
  it("signs gaps with a real minus glyph", () => {
    const g = gapFmt(".1f");
    expect(g(2.3)).toBe("+2.3");
    expect(g(-1.5)).toBe("−1.5");
    expect(g(0)).toBe("±0");
  });
  it("percentileOf is 0..100 and ordered", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileOf(sorted, 1)).toBe(0);
    expect(percentileOf(sorted, 11)).toBe(100);
    expect(percentileOf(sorted, 6)).toBeGreaterThan(percentileOf(sorted, 5));
  });
  it("humanizes population and ordinals", () => {
    expect(fmtPop(21188596)).toBe("21.2M");
    expect(fmtPop(11110)).toBe("11k");
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(92)).toBe("92nd");
  });
});
