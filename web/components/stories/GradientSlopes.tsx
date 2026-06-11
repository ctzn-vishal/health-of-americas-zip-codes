"use client";
import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Axis, TableFallback, useResize } from "@/components/charts/chartUtils";
import type { GradientsPayload } from "@/lib/types";
import { TOPIC_COLORS } from "./storyShared";

/**
 * Every measure's ADI-decile gradient on one chart, normalized so the least-deprived
 * decile = 1.0. The slope IS the inequality: a line ending at 2.5 means the most-deprived
 * tenth of neighborhoods carries 2.5x the burden of the least-deprived tenth.
 */
export default function GradientSlopes({ data }: { data: GradientsPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  const h = 480;
  const m = { t: 16, r: 168, b: 36, l: 52 };

  const series = useMemo(
    () =>
      data.metrics
        .filter((mm) => mm.d[0] != null && mm.d[0] !== 0)
        .map((mm) => ({ ...mm, rels: mm.d.map((v) => v / mm.d[0]) })),
    [data],
  );
  const yExt = d3.extent(series.flatMap((s) => s.rels)) as [number, number];
  const x = d3.scaleLinear().domain([1, 10]).range([m.l, width - m.r]);
  const y = d3.scaleLog().domain([Math.min(0.8, yExt[0]), yExt[1]]).range([h - m.b, m.t]).nice();
  const line = d3.line<number>().x((_, i) => x(i + 1)).y((v) => y(v));

  // Right-edge labels with simple collision relaxation
  const labels = useMemo(() => {
    const ls = series
      .map((s) => ({ id: s.id, short: s.short, topic: s.topic, rel: s.rels[9], y: y(s.rels[9]) }))
      .sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 24; pass++) {
      for (let i = 1; i < ls.length; i++) {
        if (ls[i].y - ls[i - 1].y < 12.5) ls[i].y = ls[i - 1].y + 12.5;
      }
    }
    return ls;
  }, [series, y]);

  if (width === 0) return <div ref={ref} style={{ minHeight: h }} />;

  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label="Relative burden by deprivation decile for all measures">
        <line x1={m.l} x2={width - m.r} y1={y(1)} y2={y(1)} stroke="var(--line-2)" strokeDasharray="4 3" />
        <text x={m.l + 4} y={y(1) - 5} fontSize={10.5} fill="var(--muted)">least-deprived decile = 1.0×</text>
        {series.map((s) => {
          const dim = focus != null && focus !== s.id;
          return (
            <path
              key={s.id}
              d={line(s.rels) ?? undefined}
              fill="none"
              stroke={TOPIC_COLORS[s.topic] ?? "var(--ink-2)"}
              strokeWidth={focus === s.id ? 2.6 : 1.4}
              opacity={dim ? 0.14 : 0.85}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setFocus(s.id)}
              onMouseLeave={() => setFocus(null)}
            >
              <title>{`${s.short}: ${s.rels[9].toFixed(2)}x in the most-deprived decile (${s.d[0]}% → ${s.d[9]}%)`}</title>
            </path>
          );
        })}
        {labels.map((l) => {
          const dim = focus != null && focus !== l.id;
          return (
            <text
              key={l.id}
              x={width - m.r + 8}
              y={l.y + 3.5}
              fontSize={10.5}
              fill={TOPIC_COLORS[l.topic] ?? "var(--ink-2)"}
              opacity={dim ? 0.25 : 1}
              fontWeight={focus === l.id ? 700 : 400}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setFocus(l.id)}
              onMouseLeave={() => setFocus(null)}
            >
              {l.short} {l.rel.toFixed(1)}×
            </text>
          );
        })}
        <Axis orient="bottom" scale={x} tx={0} ty={h - m.b} ticks={10} tickFormat={(d) => `${d}`} />
        <Axis orient="left" scale={y as any} tx={m.l} ty={0} ticks={6} tickFormat={(d) => `${(+d).toFixed(1)}×`} />
        <text x={(m.l + width - m.r) / 2} y={h - 4} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
          Area Deprivation Index decile (1 = least deprived → 10 = most deprived)
        </text>
      </svg>
      <TableFallback
        caption="Relative burden in the most-deprived vs least-deprived ADI decile"
        columns={[
          { key: "short", label: "Measure" },
          { key: "d1", label: "Decile 1", numeric: true },
          { key: "d10", label: "Decile 10", numeric: true },
          { key: "rel", label: "Ratio", numeric: true },
        ]}
        rows={series.map((s) => ({ short: s.short, d1: `${s.d[0]}%`, d10: `${s.d[9]}%`, rel: `${s.rels[9].toFixed(2)}×` }))}
      />
    </div>
  );
}
