"use client";
import type { PanelProps, ResidualPlace, ScatterPoint } from "@/lib/types";
import { BENCH, CONTEXT_GREY, GRID, HALO, INK } from "@/lib/colors";
import { valueFmt, fmtPct1, fmtInt } from "@/lib/format";
import {
  Axis,
  CHART_M,
  TableFallback,
  useReducedMotion,
  useResize,
  d3,
  useMemo,
  type Col,
} from "@/components/charts/chartUtils";

const HEIGHT = 340;

export default function ScatterLoess({
  charts,
  meta,
  selected,
  onSelect,
  onHover,
}: PanelProps) {
  const [ref, width] = useResize();
  const reduce = useReducedMotion();
  const fmt = valueFmt(meta.format, meta.unit);

  const scatter = charts.scatter;
  const points = scatter.points;
  const loess = scatter.loess;
  const worse = scatter.worse_than_expected;
  const better = scatter.better_than_expected;
  const benchmark = charts.benchmark;

  const geom = useMemo(() => {
    const innerW = Math.max(10, width - CHART_M.l - CHART_M.r);
    const innerH = HEIGHT - CHART_M.t - CHART_M.b;

    // x = ADI over data extent; y = metric value over data extent (include benchmark).
    const xExtent = (d3.extent(points, (p: ScatterPoint) => p.x) as [number, number]) ?? [0, 1];
    const yVals = points.map((p) => p.y).concat([benchmark]);
    const yExtent = (d3.extent(yVals) as [number, number]) ?? [0, 1];

    const x = d3.scaleLinear().domain(xExtent).nice().range([0, innerW]);
    const y = d3.scaleLinear().domain(yExtent).nice().range([innerH, 0]);

    // LOESS smooth path (precomputed grid) with curveBasis.
    const line = d3
      .line<[number, number]>()
      .x((d) => x(d[0]))
      .y((d) => y(d[1]))
      .curve(d3.curveBasis);
    const loessPath = loess.length ? line(loess) ?? "" : "";

    // Endpoint of the trend line, for a direct "trend" label.
    const loessEnd = loess.length ? loess[loess.length - 1] : null;

    const sel = selected ? points.find((p) => p.zip === selected) ?? null : null;

    return { innerW, innerH, x, y, loessPath, loessEnd, sel };
  }, [points, loess, benchmark, selected, width]);

  const { innerW, innerH, x, y, loessPath, loessEnd, sel } = geom;

  // Combined rows for the table fallback: worse (+resid) then better (−resid).
  const tableRows = useMemo(() => {
    const mk = (p: ResidualPlace, dir: string) => ({
      dir,
      zip: p.zip,
      place: `${p.city}, ${p.state}`,
      x: p.x,
      y: p.y,
      resid: p.resid,
    });
    return [
      ...worse.map((p) => mk(p, "Higher")),
      ...better.map((p) => mk(p, "Lower")),
    ];
  }, [worse, better]);

  const tableCols: Col[] = [
    { key: "dir", label: "Direction" },
    { key: "zip", label: "ZIP" },
    { key: "place", label: "Place" },
    { key: "x", label: "ADI (x)", numeric: true, fmt: (v) => fmtPct1(v) },
    { key: "y", label: "Value (y)", numeric: true, fmt: (v) => fmt(v) },
    {
      key: "resid",
      label: "Residual (resid)",
      numeric: true,
      fmt: (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtPct1(Math.abs(v))}`,
    },
  ];

  const yBench = y(benchmark);

  const takeaway = `Scatter of ${points.length.toLocaleString()} ZIPs by Area Deprivation Index versus ${meta.short_label}, with a smoothed trend line and the U.S. average of ${fmt(benchmark)}.`;

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`${takeaway} ZIPs that rank higher or lower than deprivation predicts are listed below the chart.`}
          style={{ fontVariantNumeric: "tabular-nums", display: "block" }}
        >
          <g transform={`translate(${CHART_M.l},${CHART_M.t})`}>
            {/* gridlines (decorative) */}
            <g aria-hidden="true">
              {y.ticks(5).map((t) => (
                <line
                  key={`gy-${t}`}
                  x1={0}
                  x2={innerW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={GRID}
                  shapeRendering="crispEdges"
                />
              ))}
              {x.ticks(6).map((t) => (
                <line
                  key={`gx-${t}`}
                  x1={x(t)}
                  x2={x(t)}
                  y1={0}
                  y2={innerH}
                  stroke={GRID}
                  shapeRendering="crispEdges"
                />
              ))}
            </g>

            {/* context points — many; treated as a decorative group, detail lives in chips + table */}
            <g aria-hidden="true">
              {points.map((p, i) => (
                <circle
                  key={`${p.zip}-${i}`}
                  cx={x(p.x)}
                  cy={y(p.y)}
                  r={2}
                  fill={CONTEXT_GREY}
                  opacity={0.35}
                />
              ))}
            </g>

            {/* LOESS trend line on top */}
            {loessPath && (
              <path
                d={loessPath}
                fill="none"
                stroke={INK}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                aria-hidden="true"
              />
            )}
            {loessEnd && (
              <text
                x={Math.min(innerW - 2, x(loessEnd[0]) + 4)}
                y={y(loessEnd[1]) - 6}
                textAnchor="end"
                fontSize={11}
                fontWeight={650}
                fill={INK}
                aria-hidden="true"
              >
                trend
              </text>
            )}

            {/* benchmark reference line */}
            <line
              x1={0}
              x2={innerW}
              y1={yBench}
              y2={yBench}
              stroke={BENCH}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              shapeRendering="crispEdges"
              aria-hidden="true"
            />
            <text
              x={innerW}
              y={yBench - 5}
              textAnchor="end"
              fontSize={11}
              fontWeight={650}
              fill={BENCH}
              aria-hidden="true"
            >
              {`U.S. avg ${fmt(benchmark)}`}
            </text>

            {/* selected ZIP: focal emphasis — INK fill, white halo, larger, direct label */}
            {sel && (
              <g>
                <circle
                  cx={x(sel.x)}
                  cy={y(sel.y)}
                  r={5}
                  fill={INK}
                  stroke={HALO}
                  strokeWidth={2}
                  className={reduce ? undefined : "chart-mark"}
                />
                <text
                  x={x(sel.x)}
                  y={y(sel.y) - 9}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={INK}
                  stroke={HALO}
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {`${sel.zip} · ${fmt(sel.y)}`}
                </text>
              </g>
            )}

            {/* axes */}
            <Axis orient="left" scale={y} tx={0} ty={0} ticks={5} tickFormat={(d) => fmt(d as number)} />
            <Axis
              orient="bottom"
              scale={x}
              tx={0}
              ty={innerH}
              ticks={6}
              tickFormat={(d) => fmtPct1(d as number)}
            />

            {/* axis titles */}
            <text
              x={innerW / 2}
              y={innerH + CHART_M.b - 1}
              textAnchor="middle"
              fontSize={11}
              fill="var(--ink-2)"
            >
              ADI national rank (higher = more deprived)
            </text>
            <text
              transform={`translate(${-CHART_M.l + 12},${innerH / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={11}
              fill="var(--ink-2)"
            >
              {meta.label}
            </text>
          </g>
        </svg>
      )}

      {/* residual lists — these carry the accessible detail */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "10px 14px",
          marginTop: 8,
        }}
      >
        <ResidualList
          title="Higher than ADI predicts"
          places={worse.slice(0, 5)}
          dir="higher"
          selected={selected}
          fmt={fmt}
          onSelect={onSelect}
          onHover={onHover}
        />
        <ResidualList
          title="Lower than ADI predicts"
          places={better.slice(0, 5)}
          dir="lower"
          selected={selected}
          fmt={fmt}
          onSelect={onSelect}
          onHover={onHover}
        />
      </div>

      {charts.correlations && charts.correlations.length > 0 && (
        <p className="muted" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
          <strong style={{ color: "var(--ink-2)" }}>Tracks with</strong> (Spearman ρ):{" "}
          {charts.correlations.slice(0, 3).map((c, i) => (
            <span key={c.context}>
              {i > 0 ? " · " : ""}
              {c.short}{" "}
              <span className="tabular">
                {c.rho == null ? "—" : `${c.rho > 0 ? "+" : c.rho < 0 ? "−" : ""}${Math.abs(c.rho).toFixed(2)}`}
              </span>
            </span>
          ))}
          {charts.correlations[0]?.n ? ` · n≈${fmtInt(charts.correlations[0].n)}` : ""}
        </p>
      )}

      <p className="muted" style={{ fontSize: 11.5, margin: "6px 0 0" }}>
        Ecological (ZIP-level) association — not causal.
      </p>

      <TableFallback
        caption={`ZIPs ranking higher or lower than their Area Deprivation Index predicts for ${meta.label}, with ADI, value, and residual.`}
        columns={tableCols}
        rows={tableRows}
        label="Show data table"
      />
    </div>
  );
}

function ResidualList({
  title,
  places,
  dir,
  selected,
  fmt,
  onSelect,
  onHover,
}: {
  title: string;
  places: ResidualPlace[];
  dir: "higher" | "lower";
  selected?: string;
  fmt: (v: number | null | undefined) => string;
  onSelect?: (zip: string | null) => void;
  onHover?: (zip: string | null) => void;
}) {
  const sign = dir === "higher" ? "+" : "−";
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 650,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--muted)",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {places.map((p) => {
          const isSel = selected === p.zip;
          return (
            <li key={p.zip}>
              <button
                type="button"
                tabIndex={0}
                onClick={() => onSelect?.(isSel ? null : p.zip)}
                onMouseEnter={() => onHover?.(p.zip)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(p.zip)}
                onBlur={() => onHover?.(null)}
                aria-pressed={isSel}
                style={{
                  display: "flex",
                  width: "100%",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "5px 9px",
                  borderRadius: 7,
                  border: `1px solid ${isSel ? INK : "var(--line-2)"}`,
                  background: isSel ? INK : "var(--paper-2)",
                  color: isSel ? "var(--paper)" : "var(--ink)",
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {`${p.city}, ${p.state}`}
                </span>
                <span
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 600,
                    color: isSel ? "var(--paper)" : "var(--muted)",
                    flexShrink: 0,
                  }}
                  title={`${fmt(p.y)} vs ADI prediction (${sign}${fmtPct1(Math.abs(p.resid))})`}
                >
                  {`${sign}${fmtPct1(Math.abs(p.resid))}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
