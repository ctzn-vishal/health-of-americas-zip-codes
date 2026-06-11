"use client";
import { useMemo, useState } from "react";
import * as d3 from "d3";
import { Axis, TableFallback, useResize } from "@/components/charts/chartUtils";
import type { WealthGapPayload } from "@/lib/types";
import { CORR_DOMAIN, CORR_RAMP, TOPIC_COLORS } from "./storyShared";

const TOP = "#6cb6ff";
const BOTTOM = "#f4675d";
const NATIONAL = "#aeb9c9";
const SCORE = "#ffd166";

const corrColor = d3
  .scaleLinear<string>()
  .domain(CORR_DOMAIN)
  .range(CORR_RAMP)
  .interpolate(d3.interpolateRgb)
  .clamp(true);

const moneyFmt = d3.format("$,.0f");
const pctFmt = d3.format(".1f");
const gapFmt = d3.format("+.1f");

function fmtComponent(unit: string, value: number | null | undefined) {
  if (value == null) return "-";
  if (unit === "dollars") return moneyFmt(value);
  if (unit === "percent") return `${pctFmt(value)}%`;
  return pctFmt(value);
}

function fmtMetric(value: number | null | undefined) {
  return value == null ? "-" : `${pctFmt(value)}%`;
}

function groupById(data: WealthGapPayload) {
  return Object.fromEntries(data.groups.map((g) => [g.id, g])) as Record<
    "bottom" | "national" | "top",
    WealthGapPayload["groups"][number]
  >;
}

export function WealthCorrelationGrid({ data }: { data: WealthGapPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; y: number; title: string; sub: string } | null>(null);
  const n = data.inputs.length;
  const labelW = 104;
  const labelH = 90;
  const cell = Math.max(34, Math.min(62, (width - labelW - 8) / n));
  const w = labelW + cell * n + 8;
  const h = labelH + cell * n + 54;
  const rows = data.inputs.flatMap((a, i) =>
    data.inputs.map((b, j) => ({
      pair: `${a.short} x ${b.short}`,
      rho: data.correlation.matrix[i][j],
    })),
  );

  if (width === 0) return <div ref={ref} style={{ minHeight: 420 }} />;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg width={w} height={h} role="img" aria-label="Correlation matrix of wealth indicators">
        {data.inputs.map((input, j) => (
          <text
            key={`c-${input.key}`}
            x={labelW + j * cell + cell / 2}
            y={labelH - 8}
            transform={`rotate(-44 ${labelW + j * cell + cell / 2} ${labelH - 8})`}
            textAnchor="start"
            fontSize={11}
            fill="var(--ink-2)"
          >
            {input.short}
          </text>
        ))}
        {data.inputs.map((input, i) => (
          <text
            key={`r-${input.key}`}
            x={labelW - 8}
            y={labelH + i * cell + cell / 2 + 4}
            textAnchor="end"
            fontSize={11}
            fill="var(--ink-2)"
          >
            {input.short}
          </text>
        ))}
        {data.correlation.matrix.map((row, i) =>
          row.map((v, j) => (
            <rect
              key={`${i}-${j}`}
              x={labelW + j * cell}
              y={labelH + i * cell}
              width={cell - 2}
              height={cell - 2}
              rx={4}
              fill={i === j ? "#2a3849" : corrColor(v)}
              opacity={i === j ? 0.65 : 1}
              onMouseEnter={() =>
                setHover({
                  x: labelW + j * cell,
                  y: labelH + i * cell,
                  title: `${data.inputs[i].short} x ${data.inputs[j].short}`,
                  sub: `Spearman rho = ${v.toFixed(2)}`,
                })
              }
              onMouseLeave={() => setHover(null)}
            />
          )),
        )}
        {data.correlation.matrix.map((row, i) =>
          row.map((v, j) => (
            <text
              key={`t-${i}-${j}`}
              x={labelW + j * cell + cell / 2 - 1}
              y={labelH + i * cell + cell / 2 + 4}
              textAnchor="middle"
              fontSize={10.5}
              fill={Math.abs(v) > 0.58 ? "#fff" : "var(--ink-2)"}
              pointerEvents="none"
            >
              {v.toFixed(2)}
            </text>
          )),
        )}
        <text x={labelW} y={h - 30} fontSize={11} fill="var(--muted)">
          Correlation with composite wealth score after aligning direction:
        </text>
        {data.inputs.map((input, i) => {
          const score = data.correlation.score.find((s) => s.key === input.key)?.aligned_rho ?? 0;
          const x0 = labelW + i * cell + 5;
          const barH = 8;
          return (
            <g key={`score-${input.key}`}>
              <rect x={x0} y={h - 18} width={cell - 12} height={barH} rx={3} fill="#222c3c" />
              <rect x={x0} y={h - 18} width={(cell - 12) * score} height={barH} rx={3} fill={SCORE} />
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 220), top: hover.y - 42 }}>
          <div className="tt-name">{hover.title}</div>
          <div className="tt-val">{hover.sub}</div>
        </div>
      )}
      <TableFallback
        caption="Spearman correlation among wealth indicators"
        columns={[
          { key: "pair", label: "Pair" },
          { key: "rho", label: "rho", numeric: true, fmt: (v) => Number(v).toFixed(2) },
        ]}
        rows={rows}
      />
    </div>
  );
}

export function WealthScoreProfile({ data }: { data: WealthGapPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const groups = groupById(data);
  const rowH = 58;
  const h = data.inputs.length * rowH + 42;
  const m = { t: 10, r: width < 620 ? 22 : 116, b: 30, l: width < 520 ? 86 : 128 };
  const x = d3.scaleLinear().domain([0, 100]).range([m.l, Math.max(m.l + 80, width - m.r)]);

  if (width === 0) return <div ref={ref} style={{ minHeight: h }} />;

  const tableRows = data.inputs.map((input) => ({
    measure: input.short,
    bottom: fmtComponent(input.unit, groups.bottom.components[input.key]?.raw),
    top: fmtComponent(input.unit, groups.top.components[input.key]?.raw),
    bottomScore: groups.bottom.components[input.key]?.score,
    topScore: groups.top.components[input.key]?.score,
  }));

  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label="Component profile for top and bottom wealth deciles">
        <line x1={x(0)} x2={x(100)} y1={h - m.b} y2={h - m.b} stroke="var(--line-2)" />
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={m.t} y2={h - m.b} stroke="var(--line)" strokeDasharray="2 5" />
            <text x={x(tick)} y={h - 10} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
              {tick}
            </text>
          </g>
        ))}
        {data.inputs.map((input, i) => {
          const y = m.t + i * rowH + 23;
          const b = groups.bottom.components[input.key];
          const t = groups.top.components[input.key];
          const n = groups.national.components[input.key];
          return (
            <g key={input.key}>
              <text x={m.l - 10} y={y + 4} textAnchor="end" fontSize={11.5} fill="var(--ink-2)" fontWeight={650}>
                {input.short}
              </text>
              <line x1={x(b.score ?? 0)} x2={x(t.score ?? 0)} y1={y} y2={y} stroke="var(--line-2)" strokeWidth={5} strokeLinecap="round" />
              <line x1={x(n.score ?? 50)} x2={x(n.score ?? 50)} y1={y - 14} y2={y + 14} stroke={NATIONAL} strokeDasharray="3 3" />
              <circle cx={x(b.score ?? 0)} cy={y} r={6.5} fill={BOTTOM} stroke="#fff" strokeOpacity={0.45} />
              <circle cx={x(t.score ?? 0)} cy={y} r={6.5} fill={TOP} stroke="#fff" strokeOpacity={0.45} />
              {width >= 620 && (
                <text x={width - m.r + 10} y={y - 5} fontSize={10.5} fill="var(--muted)">
                  {fmtComponent(input.unit, b.raw)} {"->"} {fmtComponent(input.unit, t.raw)}
                </text>
              )}
              <title>
                {`${input.label}: bottom ${fmtComponent(input.unit, b.raw)}, top ${fmtComponent(input.unit, t.raw)}`}
              </title>
            </g>
          );
        })}
        <text x={x(50)} y={h - 1} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
          Component rank percentile after aligning all measures so right means more advantage
        </text>
      </svg>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: BOTTOM, marginRight: 6 }} />Bottom decile</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: TOP, marginRight: 6 }} />Top decile</span>
        <span><i style={{ display: "inline-block", height: 12, borderLeft: `2px dashed ${NATIONAL}`, marginRight: 6, verticalAlign: -2 }} />Eligible average</span>
      </div>
      <TableFallback
        caption="Top and bottom wealth component profile"
        columns={[
          { key: "measure", label: "Measure" },
          { key: "bottom", label: "Bottom decile" },
          { key: "top", label: "Top decile" },
          { key: "bottomScore", label: "Bottom score", numeric: true, fmt: (v) => pctFmt(v) },
          { key: "topScore", label: "Top score", numeric: true, fmt: (v) => pctFmt(v) },
        ]}
        rows={tableRows}
      />
    </div>
  );
}

export function WealthDecileLines({ data }: { data: WealthGapPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  const chosen = ["food_insecurity", "teethlost", "smoking", "diabetes", "obesity", "binge"];
  const metricsById = new Map(data.metrics.map((m) => [m.id, m]));
  const series = chosen
    .map((id) => {
      const meta = metricsById.get(id);
      return meta
        ? {
            ...meta,
            values: data.deciles.map((d) => ({ decile: d.decile, value: d.metrics[id] })),
          }
        : null;
    })
    .filter(Boolean) as {
    id: string;
    short: string;
    topic: string;
    values: { decile: number; value: number | null }[];
  }[];
  const h = 360;
  const m = { t: 18, r: width < 620 ? 18 : 132, b: 42, l: 46 };
  const max = d3.max(series.flatMap((s) => s.values.map((v) => v.value ?? 0))) ?? 1;
  const x = d3.scaleLinear().domain([1, 10]).range([m.l, Math.max(m.l + 80, width - m.r)]);
  const y = d3.scaleLinear().domain([0, Math.ceil(max / 5) * 5]).range([h - m.b, m.t]).nice();
  const line = d3
    .line<{ decile: number; value: number | null }>()
    .defined((d) => d.value != null)
    .x((d) => x(d.decile))
    .y((d) => y(d.value ?? 0));

  if (width === 0) return <div ref={ref} style={{ minHeight: h }} />;

  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label="Selected health measures across wealth deciles">
        <line x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        {[1, 10].map((d) => (
          <text key={d} x={x(d)} y={m.t - 3} textAnchor={d === 1 ? "start" : "end"} fontSize={10.5} fill="var(--muted)">
            {d === 1 ? "poorest decile" : "wealthiest decile"}
          </text>
        ))}
        {series.map((s) => {
          const dim = focus != null && focus !== s.id;
          const last = s.values[s.values.length - 1];
          return (
            <g key={s.id} opacity={dim ? 0.18 : 1} onMouseEnter={() => setFocus(s.id)} onMouseLeave={() => setFocus(null)}>
              <path
                d={line(s.values) ?? undefined}
                fill="none"
                stroke={TOPIC_COLORS[s.topic] ?? "var(--ink-2)"}
                strokeWidth={focus === s.id ? 3 : 2}
                strokeLinecap="round"
              />
              {s.values.map((v) => (
                <circle key={v.decile} cx={x(v.decile)} cy={y(v.value ?? 0)} r={focus === s.id ? 4 : 2.8} fill={TOPIC_COLORS[s.topic] ?? "var(--ink-2)"} />
              ))}
              {width >= 620 && last.value != null && (
                <text x={width - m.r + 9} y={y(last.value) + 4} fontSize={11} fill={TOPIC_COLORS[s.topic] ?? "var(--ink-2)"}>
                  {s.short}
                </text>
              )}
              <title>{s.short}</title>
            </g>
          );
        })}
        <Axis orient="bottom" scale={x} tx={0} ty={h - m.b} ticks={10} tickFormat={(d) => `${d}`} />
        <Axis orient="left" scale={y} tx={m.l} ty={0} ticks={6} tickFormat={(d) => `${d}%`} />
        <text x={(m.l + width - m.r) / 2} y={h - 4} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
          Composite wealth decile, from bottom to top
        </text>
      </svg>
      <TableFallback
        caption="Selected health measures by wealth decile"
        columns={[
          { key: "decile", label: "Decile", numeric: true },
          ...series.map((s) => ({ key: s.id, label: s.short, numeric: true, fmt: fmtMetric })),
        ]}
        rows={data.deciles.map((d) => ({
          decile: d.decile,
          ...Object.fromEntries(series.map((s) => [s.id, d.metrics[s.id]])),
        }))}
      />
    </div>
  );
}

export default function WealthHealthGaps({ data }: { data: WealthGapPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  const metrics = useMemo(() => data.metrics, [data]);
  const h = metrics.length * 24 + 58;
  const m = { t: 14, r: width < 680 ? 24 : 128, b: 34, l: width < 520 ? 112 : 148 };
  const max = d3.max(metrics.flatMap((mm) => [mm.top ?? 0, mm.bottom ?? 0, mm.national ?? 0])) ?? 1;
  const x = d3.scaleLinear().domain([0, Math.ceil(max / 5) * 5]).range([m.l, Math.max(m.l + 90, width - m.r)]);

  if (width === 0) return <div ref={ref} style={{ minHeight: h }} />;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg width={width} height={h} role="img" aria-label="Top and bottom wealth decile health comparison">
        {[0, 15, 30, 45, 60].filter((v) => v <= x.domain()[1]).map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={m.t} y2={h - m.b} stroke="var(--line)" strokeDasharray="2 5" />
            <text x={x(tick)} y={h - 9} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
              {tick}%
            </text>
          </g>
        ))}
        {metrics.map((mm, i) => {
          const y = m.t + i * 24 + 12;
          const dim = focus != null && focus !== mm.id;
          const gap = mm.gap ?? 0;
          return (
            <g
              key={mm.id}
              opacity={dim ? 0.18 : 1}
              onMouseEnter={() => setFocus(mm.id)}
              onMouseLeave={() => setFocus(null)}
            >
              <text x={m.l - 10} y={y + 4} textAnchor="end" fontSize={10.7} fill={TOPIC_COLORS[mm.topic] ?? "var(--ink-2)"} fontWeight={focus === mm.id ? 700 : 500}>
                {mm.short}
              </text>
              {mm.national != null && (
                <line x1={x(mm.national)} x2={x(mm.national)} y1={y - 8} y2={y + 8} stroke={NATIONAL} strokeDasharray="2 3" />
              )}
              {mm.top != null && mm.bottom != null && (
                <line
                  x1={x(mm.top)}
                  x2={x(mm.bottom)}
                  y1={y}
                  y2={y}
                  stroke={gap >= 0 ? "rgba(244,103,93,0.48)" : "rgba(108,182,255,0.48)"}
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              )}
              {mm.top != null && <circle cx={x(mm.top)} cy={y} r={4.4} fill={TOP} />}
              {mm.bottom != null && <circle cx={x(mm.bottom)} cy={y} r={4.4} fill={BOTTOM} />}
              {width >= 680 && (
                <text x={width - m.r + 10} y={y + 4} fontSize={10.5} fill={gap >= 0 ? BOTTOM : TOP} fontVariant="tabular-nums">
                  {gapFmt(gap)} pts {mm.ratio != null ? `(${mm.ratio.toFixed(2)}x)` : ""}
                </text>
              )}
              <title>
                {`${mm.short}: top ${fmtMetric(mm.top)}, bottom ${fmtMetric(mm.bottom)}, gap ${gapFmt(gap)} points`}
              </title>
            </g>
          );
        })}
        <Axis orient="bottom" scale={x} tx={0} ty={h - m.b} ticks={6} tickFormat={(d) => `${d}%`} />
      </svg>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: TOP, marginRight: 6 }} />Top wealth decile</span>
        <span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 9, background: BOTTOM, marginRight: 6 }} />Bottom wealth decile</span>
        <span><i style={{ display: "inline-block", height: 12, borderLeft: `2px dashed ${NATIONAL}`, marginRight: 6, verticalAlign: -2 }} />Eligible average</span>
      </div>
      <TableFallback
        caption="Health measure means by top and bottom wealth decile"
        columns={[
          { key: "short", label: "Measure" },
          { key: "top", label: "Top decile", numeric: true, fmt: fmtMetric },
          { key: "bottom", label: "Bottom decile", numeric: true, fmt: fmtMetric },
          { key: "gap", label: "Gap", numeric: true, fmt: (v) => `${gapFmt(v)} pts` },
          { key: "ratio", label: "Ratio", numeric: true, fmt: (v) => (v == null ? "-" : `${Number(v).toFixed(2)}x`) },
        ]}
        rows={metrics}
      />
    </div>
  );
}
