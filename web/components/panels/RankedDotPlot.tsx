"use client";
import { useState } from "react";
import type { PanelProps, RankedPlace } from "@/lib/types";
import { colorScale, INK, BENCH, GRID, HALO } from "@/lib/colors";
import { valueFmt, gapFmt, fmtPop } from "@/lib/format";
import {
  useResize,
  useReducedMotion,
  TableFallback,
  CHART_M,
  d3,
  useMemo,
  type Col,
} from "@/components/charts/chartUtils";

const ROW_H = 22;
const MAX_ROWS = 15;
const LABEL_W = 188; // left label column (px)
const VALUE_W = 116; // right value + gap column (px)
const DOT_R = 5;
const DOT_R_SEL = 7.5;

type Side = "top" | "bottom";

export default function RankedDotPlot({
  charts,
  meta,
  selected,
  onSelect,
  onHover,
}: PanelProps) {
  const [ref, width] = useResize<HTMLDivElement>();
  const reduce = useReducedMotion();
  const [side, setSide] = useState<Side>("top");

  const fmt = valueFmt(meta.format, meta.unit);
  const gfmt = gapFmt(meta.format);
  const unit = meta.unit === "percent" ? "%" : "";

  const full: RankedPlace[] = side === "top" ? charts.ranked_top : charts.ranked_bottom;
  const rows = full.slice(0, MAX_ROWS);

  const benchmark = charts.benchmark;
  const color = colorScale("rate", meta.domain, meta.benchmark);

  const height = rows.length * ROW_H + CHART_M.t + CHART_M.b + 18;
  const plotTop = CHART_M.t + 18; // 18px band reserved for the benchmark label

  // Track spans from the left-label column to the value column.
  const trackX0 = LABEL_W;
  const trackX1 = Math.max(trackX0 + 40, width - CHART_M.r - VALUE_W);

  // x linear scale over [min(domain[0], minVal), max(domain[2], maxVal)] + reference ticks.
  const { x, ticks } = useMemo(() => {
    const vals = rows.map((r) => r.value);
    const lo = Math.min(meta.domain[0], vals.length ? Math.min(...vals) : meta.domain[0]);
    const hi = Math.max(meta.domain[2], vals.length ? Math.max(...vals) : meta.domain[2]);
    const xs = d3.scaleLinear().domain([lo, hi]).range([trackX0, trackX1]);
    // light reference ticks, skipping any that would collide with the benchmark label
    const tk = xs.ticks(4).filter((t) => Math.abs(t - benchmark) > (hi - lo) * 0.05);
    return { x: xs, ticks: tk };
  }, [rows, meta.domain, benchmark, trackX0, trackX1]);

  const benchX = x(benchmark);

  // Accessibility takeaway sentence (uses the all-time highest, regardless of toggle).
  const topPlace = charts.ranked_top[0];
  const aria =
    topPlace != null
      ? `Ranked ZIP codes by ${meta.label}; highest is ${fmt(topPlace.value)} in ${topPlace.city}, ${topPlace.state}.`
      : `Ranked ZIP codes by ${meta.label}.`;

  const tableCols: Col[] = [
    { key: "rank", label: "Rank", numeric: true },
    { key: "zip", label: "ZIP" },
    { key: "place", label: "Place" },
    { key: "value", label: `Value (${unit || meta.unit})`, numeric: true, fmt: (v) => fmt(v) },
    { key: "gap", label: "Gap vs US", numeric: true, fmt: (v) => gfmt(v) },
    { key: "population", label: "Population", numeric: true, fmt: (v) => fmtPop(v) },
  ];
  const tableRows = rows.map((r, i) => ({
    rank: i + 1,
    zip: r.zip,
    place: `${r.city}, ${r.state}`,
    value: r.value,
    gap: r.gap,
    population: r.population,
  }));

  return (
    <div ref={ref}>
      <div className="segmented" role="group" aria-label="Choose ranking direction">
        <button type="button" aria-pressed={side === "top"} onClick={() => setSide("top")}>
          Highest
        </button>
        <button type="button" aria-pressed={side === "bottom"} onClick={() => setSide("bottom")}>
          Lowest
        </button>
      </div>

      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="group"
          aria-label={aria}
          style={{ display: "block", marginTop: 8, fontVariantNumeric: "tabular-nums" }}
        >
          {/* benchmark reference line (decorative; value is also stated in the label) */}
          <line
            aria-hidden="true"
            x1={benchX}
            x2={benchX}
            y1={plotTop - 6}
            y2={plotTop + rows.length * ROW_H}
            stroke={BENCH}
            strokeWidth={1}
            strokeDasharray="3 3"
            shapeRendering="crispEdges"
          />
          <text
            x={benchX}
            y={CHART_M.t + 4}
            textAnchor="middle"
            fontSize={11}
            fontWeight={600}
            fill={BENCH}
          >
            U.S. avg {fmt(benchmark)}
          </text>

          {/* light value-axis reference ticks */}
          <g aria-hidden="true">
            {ticks.map((t) => (
              <text
                key={`tick-${t}`}
                x={x(t)}
                y={height - CHART_M.b + 14}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted)"
              >
                {fmt(t)}
              </text>
            ))}
          </g>

          {rows.map((r, i) => {
            const isSel = selected != null && selected === r.zip;
            const cy = plotTop + i * ROW_H + ROW_H / 2;
            const dotX = x(r.value);
            const dotColor = isSel ? INK : color(r.value);
            const rr = isSel ? DOT_R_SEL : DOT_R;
            const label = `${r.zip} · ${r.city}, ${r.state}`;
            const valText = fmt(r.value);
            const gapText = gfmt(r.gap);

            return (
              <g
                key={r.zip}
                tabIndex={0}
                role="button"
                aria-pressed={isSel}
                aria-label={`${i + 1}. ${r.zip}, ${r.city}, ${r.state}: ${valText}, ${gapText} vs U.S. average`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => onHover?.(r.zip)}
                onFocus={() => onHover?.(r.zip)}
                onMouseLeave={() => onHover?.(null)}
                onBlur={() => onHover?.(null)}
                onClick={() => onSelect?.(selected === r.zip ? null : r.zip)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(selected === r.zip ? null : r.zip);
                  }
                }}
              >
                <title>
                  {label}: {valText} ({gapText} vs U.S.)
                </title>

                {/* full-row transparent hit target (large tap area for mobile / a11y) */}
                <rect
                  x={0}
                  y={cy - ROW_H / 2}
                  width={Math.max(0, width)}
                  height={ROW_H}
                  fill="transparent"
                  style={{ pointerEvents: "all" }}
                />

                {/* selected-row background */}
                {isSel && (
                  <rect
                    x={0}
                    y={cy - ROW_H / 2}
                    width={Math.max(0, width)}
                    height={ROW_H}
                    fill={INK}
                    fillOpacity={0.06}
                    rx={3}
                  />
                )}

                {/* left label (SVG has no native ellipsis, so we truncate manually) */}
                <text
                  x={0}
                  y={cy}
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={isSel ? 700 : 400}
                  fill={isSel ? INK : "var(--ink-2)"}
                >
                  {truncate(label, LABEL_W - 8, isSel)}
                </text>

                {/* faint baseline track */}
                <line
                  x1={trackX0}
                  x2={trackX1}
                  y1={cy}
                  y2={cy}
                  stroke={GRID}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />

                {/* value dot — selection adds INK fill, larger radius, white halo */}
                <circle
                  className={reduce ? undefined : "chart-mark"}
                  cx={dotX}
                  cy={cy}
                  r={rr}
                  fill={dotColor}
                  stroke={isSel ? HALO : "rgba(255,255,255,0.3)"}
                  strokeWidth={isSel ? 2 : 1}
                />

                {/* value label to the right of the track */}
                <text
                  x={trackX1 + 8}
                  y={cy}
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={isSel ? 700 : 600}
                  fill={isSel ? INK : "var(--ink)"}
                >
                  {valText}
                </text>

                {/* gap vs U.S. in muted text */}
                <text
                  x={trackX1 + 8 + 52}
                  y={cy}
                  dominantBaseline="central"
                  fontSize={11}
                  fill="var(--muted)"
                >
                  {gapText}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      <TableFallback
        caption={`Ranked ZIP codes (${side === "top" ? "highest" : "lowest"}) by ${meta.label}.`}
        columns={tableCols}
        rows={tableRows}
        label="Show data table"
      />
    </div>
  );
}

/**
 * Truncate a label to fit `maxPx` using an approximate per-character width.
 * SVG <text> has no native ellipsis, so we estimate at the ~12px sans size.
 */
function truncate(s: string, maxPx: number, bold: boolean): string {
  const charPx = bold ? 7.0 : 6.4;
  const maxChars = Math.max(4, Math.floor(maxPx / charPx));
  if (s.length <= maxChars) return s;
  return s.slice(0, Math.max(1, maxChars - 1)) + "…";
}
