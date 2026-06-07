"use client";
import { useResize } from "@/components/charts/chartUtils";
import { valueFmt, ordinal, gapFmt } from "@/lib/format";
import { groupByDomain } from "@/lib/snapshot";
import type { MetricDistributions, MetricMeta, ProfileZip } from "@/lib/types";
import StripPlot from "./StripPlot";

const LABEL_W = 132;
const READ_W = 92;
const GAP = 12;

export default function HealthSnapshot({
  profile,
  metrics,
  dists,
  stateMeans,
  onPickMetric,
}: {
  profile: ProfileZip;
  metrics: MetricMeta[];
  dists: MetricDistributions;
  stateMeans: Record<string, number> | undefined;
  onPickMetric: (metricId: string) => void;
}) {
  const [ref, width] = useResize<HTMLDivElement>();
  // each group column subtracts its own padding; min width keeps strips legible
  const colW = width > 880 ? (width - 18) / 2 : width;
  const svgW = Math.max(60, colW - LABEL_W - READ_W - GAP * 2 - 34);
  const state = profile.c[1];
  const groups = groupByDomain(metrics);
  // profile.m is positional in catalog order; map metric_id -> [value, pct] | null
  const byId = new Map(metrics.map((mm, i) => [mm.metric_id, profile.m[i] ?? null]));

  return (
    <div className="snap-strips-block">
      <div className="snap-key" aria-hidden="true">
        <span className="k-item"><i className="k-zip" />This ZIP</span>
        <span className="k-item"><i className="k-us" />U.S. average</span>
        <span className="k-item"><i className="k-st" />{state} average</span>
        <span className="snap-key-note">lower / better&nbsp;←&nbsp;→&nbsp;higher / worse</span>
      </div>

      <div className="snap-strips" ref={ref}>
        {groups.map((g) => (
          <section className="snap-group" key={g.topic}>
            <h3 className="snap-group-title">{g.topic}</h3>
            {g.metrics.map((m) => {
              const rec = byId.get(m.metric_id) ?? null;
              const value = rec ? rec[0] : null;
              const pct = rec ? rec[1] : null;
              const fmt = valueFmt(m.format, m.unit);
              const dist = dists[m.metric_id];
              const stateMean = stateMeans?.[m.metric_id] ?? null;
              const pctClass = pct == null ? "" : pct <= 33 ? "pct-good" : pct >= 67 ? "pct-bad" : "pct-mid";
              const delta = value != null ? value - m.benchmark : null;
              return (
                <div className="strip-row" key={m.metric_id}>
                  <button
                    type="button"
                    className="strip-label"
                    onClick={() => onPickMetric(m.metric_id)}
                    title={`Map ${m.label} across the U.S.`}
                  >
                    <span className="strip-name">{m.short_label || m.label}</span>
                    {delta != null && (
                      <span className={`strip-delta ${delta <= 0 ? "pct-good" : "pct-bad"}`}>
                        {gapFmt(m.format)(delta)} vs US
                      </span>
                    )}
                  </button>
                  <div className="strip-svg">
                    {dist && (
                      <StripPlot
                        width={svgW}
                        meta={m}
                        dist={dist}
                        value={value}
                        stateMean={stateMean}
                        stateAbbr={state}
                      />
                    )}
                  </div>
                  <div className="strip-read">
                    <span className="strip-val">{value != null ? fmt(value) : "—"}</span>
                    <span className={`strip-pct ${pctClass}`}>
                      {pct != null ? `${ordinal(pct)} pct` : "no data"}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <p className="snap-foot muted">
        Each strip shows the national distribution of ZIP/ZCTA areas, with markers for this ZIP, the
        U.S. average, and the {state} average. Percentiles are national; every measure is framed so
        lower is better. Click a measure name to map it across the country.
      </p>
    </div>
  );
}
