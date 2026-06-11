"use client";
import { useEffect, useMemo, useState } from "react";
import * as d3 from "d3";
import { loadMentalHealth, loadSmoking } from "@/lib/data";
import type { MentalHealthPayload, SmokingPayload } from "@/lib/types";
import { ScatterFit } from "./OutcomePanels";

/** Diagnosed depression vs mental distress, colored by income, with identity + fit lines. */
export function MentalHealthScatter() {
  const [p, setP] = useState<MentalHealthPayload | null>(null);
  useEffect(() => {
    loadMentalHealth().then(setP).catch(() => {});
  }, []);

  const colorOf = useMemo(() => {
    if (!p) return null;
    const incomes = p.scatter.income.filter((v): v is number => v != null).sort(d3.ascending);
    const s = d3
      .scaleLinear<string>()
      .domain([d3.quantile(incomes, 0.05) ?? 30000, d3.quantile(incomes, 0.5) ?? 70000, d3.quantile(incomes, 0.95) ?? 150000])
      .range(["#f4675d", "#b9a48a", "#6cb6ff"])
      .interpolate(d3.interpolateRgb)
      .clamp(true);
    return (i: number) => {
      const inc = p.scatter.income[i];
      return inc == null ? "#5d6675" : s(inc);
    };
  }, [p]);

  if (!p || !colorOf) return <div style={{ minHeight: 430, display: "grid", placeItems: "center" }} className="muted">Loading…</div>;

  const xs = d3.extent(p.scatter.x) as [number, number];
  const idMax = Math.min(xs[1], d3.max(p.scatter.y) ?? xs[1]);
  return (
    <ScatterFit
      x={p.scatter.x}
      y={p.scatter.y}
      zip={p.scatter.zip}
      state={p.scatter.state}
      pop={p.scatter.pop}
      color={colorOf}
      lines={[
        { pts: [[xs[0], xs[0]], [idMax, idMax]], label: "diagnoses = distress", dash: "5 4", color: "#8593a9" },
        { pts: [[xs[0], p.fit.intercept + p.fit.slope * xs[0]], [xs[1], p.fit.intercept + p.fit.slope * xs[1]]], label: "fit", color: "#e9eef6" },
      ]}
      xLabel="Frequent mental distress (%)"
      yLabel="Diagnosed depression (%)"
      colorLegend={
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
          <span>Lower income</span>
          <svg width={120} height={10} aria-hidden="true">
            <defs>
              <linearGradient id="mh-inc" x1="0" x2="1">
                <stop offset="0%" stopColor="#f4675d" />
                <stop offset="50%" stopColor="#b9a48a" />
                <stop offset="100%" stopColor="#6cb6ff" />
              </linearGradient>
            </defs>
            <rect width={120} height={10} rx={2} fill="url(#mh-inc)" stroke="rgba(255,255,255,0.14)" />
          </svg>
          <span>Higher income</span>
          <span style={{ marginLeft: "auto" }}>Hover for the ZIP</span>
        </div>
      }
    />
  );
}

/** Smoking vs ADI with the quadratic deprivation fit. */
export function SmokingScatter() {
  const [p, setP] = useState<SmokingPayload | null>(null);
  useEffect(() => {
    loadSmoking().then(setP).catch(() => {});
  }, []);
  if (!p) return <div style={{ minHeight: 430, display: "grid", placeItems: "center" }} className="muted">Loading…</div>;
  return (
    <ScatterFit
      x={p.scatter.x}
      y={p.scatter.y}
      zip={p.scatter.zip}
      state={p.scatter.state}
      pop={p.scatter.pop}
      lines={[{ pts: p.curve, label: "predicted from deprivation", color: "#e9eef6" }]}
      xLabel="Area Deprivation Index national rank"
      yLabel="Current smoking (%)"
    />
  );
}
