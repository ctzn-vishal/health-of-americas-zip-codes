"use client";
import { useMemo, useState } from "react";
import * as d3 from "d3";
import { useResize } from "@/components/charts/chartUtils";
import type { CorrelationsPayload } from "@/lib/types";
import { CORR_DOMAIN, CORR_RAMP, TOPIC_COLORS } from "./storyShared";

const corrColor = d3
  .scaleLinear<string>()
  .domain(CORR_DOMAIN)
  .range(CORR_RAMP)
  .interpolate(d3.interpolateRgb)
  .clamp(true);

interface Hover {
  x: number;
  y: number;
  text: string;
  sub: string;
}

/** 26x26 Spearman matrix, hierarchically ordered so correlated blocks sit together. */
export default function CorrelationMatrix({ data }: { data: CorrelationsPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const n = data.ids.length;
  const labelW = 128;
  const labelH = 118;
  const cell = Math.max(8, Math.min(22, (width - labelW - 8) / n));
  const w = labelW + cell * n + 8;
  const h = labelH + cell * n + 8;

  const cells = useMemo(() => {
    const out: { i: number; j: number; v: number | null }[] = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push({ i, j, v: data.matrix[i][j] });
    return out;
  }, [data, n]);

  if (width === 0) return <div ref={ref} style={{ minHeight: 420 }} />;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg width={w} height={h} role="img" aria-label="Correlation matrix of all 26 measures">
        {/* column labels (rotated) */}
        {data.labels.map((lab, j) => (
          <text
            key={`c${j}`}
            x={labelW + j * cell + cell / 2}
            y={labelH - 6}
            transform={`rotate(-52 ${labelW + j * cell + cell / 2} ${labelH - 6})`}
            textAnchor="start"
            fontSize={10.5}
            fill={TOPIC_COLORS[data.topics[j]] ?? "var(--ink-2)"}
          >
            {lab}
          </text>
        ))}
        {/* row labels */}
        {data.labels.map((lab, i) => (
          <text
            key={`r${i}`}
            x={labelW - 8}
            y={labelH + i * cell + cell / 2 + 3.5}
            textAnchor="end"
            fontSize={10.5}
            fill={TOPIC_COLORS[data.topics[i]] ?? "var(--ink-2)"}
          >
            {lab}
          </text>
        ))}
        {cells.map(({ i, j, v }) => (
          <rect
            key={`${i}-${j}`}
            x={labelW + j * cell}
            y={labelH + i * cell}
            width={cell - 1}
            height={cell - 1}
            rx={1.5}
            fill={i === j ? "#2a3849" : v == null ? "#181f2c" : corrColor(v)}
            opacity={i === j ? 0.6 : 1}
            onMouseEnter={() =>
              i !== j &&
              setHover({
                x: labelW + j * cell + cell / 2,
                y: labelH + i * cell,
                text: `${data.labels[i]} × ${data.labels[j]}`,
                sub: v == null ? "n/a" : `Spearman ρ = ${v.toFixed(2)}`,
              })
            }
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 200), top: hover.y - 44 }}>
          <div className="tt-name">{hover.text}</div>
          <div className="tt-val">{hover.sub}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <svg width={170} height={26} aria-hidden="true">
          <defs>
            <linearGradient id="corr-ramp" x1="0" x2="1">
              {CORR_DOMAIN.map((v, i) => (
                <stop key={i} offset={`${(i / (CORR_DOMAIN.length - 1)) * 100}%`} stopColor={CORR_RAMP[i]} />
              ))}
            </linearGradient>
          </defs>
          <rect x={0} y={4} width={170} height={10} rx={2} fill="url(#corr-ramp)" stroke="rgba(255,255,255,0.14)" />
          <text x={0} y={25} fontSize={10} fill="var(--muted)">−1</text>
          <text x={85} y={25} fontSize={10} fill="var(--muted)" textAnchor="middle">0</text>
          <text x={170} y={25} fontSize={10} fill="var(--muted)" textAnchor="end">+1</text>
        </svg>
        {Object.entries(TOPIC_COLORS).map(([t, c]) => (
          <span key={t} style={{ fontSize: 11, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5 }}>
            <i style={{ width: 8, height: 8, borderRadius: "50%", background: c, display: "inline-block" }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Measures x demographics heat strip — what tracks each measure across places. */
export function ContextHeatmap({ data }: { data: CorrelationsPayload }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const nR = data.ids.length;
  const nC = data.context_keys.length;
  const labelW = 128;
  const labelH = 104;
  const cell = Math.max(14, Math.min(34, (width - labelW - 8) / nC));
  const rowH = Math.max(11, Math.min(16, cell * 0.62));
  const w = labelW + cell * nC + 8;
  const h = labelH + rowH * nR + 8;

  if (width === 0) return <div ref={ref} style={{ minHeight: 420 }} />;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg width={w} height={h} role="img" aria-label="Correlation of each measure with demographic context">
        {data.context_labels.map((lab, j) => (
          <text
            key={`c${j}`}
            x={labelW + j * cell + cell / 2}
            y={labelH - 6}
            transform={`rotate(-44 ${labelW + j * cell + cell / 2} ${labelH - 6})`}
            textAnchor="start"
            fontSize={10.5}
            fill="var(--ink-2)"
          >
            {lab}
          </text>
        ))}
        {data.labels.map((lab, i) => (
          <text
            key={`r${i}`}
            x={labelW - 8}
            y={labelH + i * rowH + rowH / 2 + 3.5}
            textAnchor="end"
            fontSize={10.5}
            fill={TOPIC_COLORS[data.topics[i]] ?? "var(--ink-2)"}
          >
            {lab}
          </text>
        ))}
        {data.context_matrix.map((row, i) =>
          row.map((v, j) => (
            <rect
              key={`${i}-${j}`}
              x={labelW + j * cell}
              y={labelH + i * rowH}
              width={cell - 1.5}
              height={rowH - 1.5}
              rx={1.5}
              fill={v == null ? "#181f2c" : corrColor(v)}
              onMouseEnter={() =>
                setHover({
                  x: labelW + j * cell,
                  y: labelH + i * rowH,
                  text: `${data.labels[i]} × ${data.context_labels[j]}`,
                  sub: v == null ? "n/a" : `Spearman ρ = ${v.toFixed(2)} (higher = ${data.context_higher[j]})`,
                })
              }
              onMouseLeave={() => setHover(null)}
            />
          )),
        )}
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 240), top: hover.y - 44 }}>
          <div className="tt-name">{hover.text}</div>
          <div className="tt-val">{hover.sub}</div>
        </div>
      )}
    </div>
  );
}
