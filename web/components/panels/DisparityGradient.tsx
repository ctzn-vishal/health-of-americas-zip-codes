"use client";
import type { PanelProps, GradientDecile } from "@/lib/types";
import { colorScale, INK, BENCH, GRID, HALO } from "@/lib/colors";
import { valueFmt, fmtInt } from "@/lib/format";
import {
  useResize,
  Axis,
  TableFallback,
  CHART_M,
  d3,
  useMemo,
  type Col,
} from "@/components/charts/chartUtils";

const HEIGHT = 310;

/**
 * Disparity gradient by Area Deprivation Index decile — the headline explanatory panel.
 * Shows how the metric rises (or falls) across ADI deciles, with a 95% CI ribbon,
 * a connecting line, colored decile dots, the U.S. benchmark, and an annotated gap.
 */
export default function DisparityGradient({ charts, meta }: PanelProps) {
  const [ref, width] = useResize();

  const grad = charts.disparity_gradient;
  const deciles: GradientDecile[] = grad?.deciles ?? [];
  const benchmark = charts.benchmark;
  const topMinusBottom = grad?.top_minus_bottom ?? null;

  const fmt = valueFmt(meta.format, meta.unit);
  const color = colorScale("rate", meta.domain, meta.benchmark);

  // Extra room vs. the shared margins for axis titles + inline decile labels.
  const M = { t: CHART_M.t + 8, r: CHART_M.r + 8, b: CHART_M.b + 18, l: CHART_M.l + 8 };

  const model = useMemo(() => {
    if (!deciles.length || width <= 0) return null;
    const innerW = Math.max(0, width - M.l - M.r);
    const innerH = Math.max(0, HEIGHT - M.t - M.b);

    const x = d3
      .scalePoint<number>()
      .domain(deciles.map((d) => d.decile))
      .range([0, innerW])
      .padding(0.5);

    const lo = d3.min(deciles, (d) => d.lci) ?? 0;
    const hi = d3.max(deciles, (d) => d.uci) ?? 1;
    const span = hi - lo || 1;
    const y = d3
      .scaleLinear()
      .domain([Math.min(lo, benchmark) - span * 0.08, Math.max(hi, benchmark) + span * 0.12])
      .range([innerH, 0])
      .nice();

    const px = (d: GradientDecile) => x(d.decile) ?? 0;

    const ribbon =
      d3
        .area<GradientDecile>()
        .x(px)
        .y0((d) => y(d.lci))
        .y1((d) => y(d.uci))
        .curve(d3.curveMonotoneX)(deciles) ?? "";

    const line =
      d3
        .line<GradientDecile>()
        .x(px)
        .y((d) => y(d.value))
        .curve(d3.curveMonotoneX)(deciles) ?? "";

    return { innerW, innerH, x, y, px, ribbon, line };
  }, [deciles, width, benchmark, M.l, M.r, M.t, M.b]);

  const d1 = deciles[0];
  const d10 = deciles[deciles.length - 1];
  const unitSuffix = meta.unit === "percent" ? "%" : "";
  const ariaLabel =
    d1 && d10
      ? `${meta.label} ${d10.value >= d1.value ? "rises" : "falls"} from ${fmt(
          d1.value,
        )} in the least-deprived tenth to ${fmt(d10.value)} in the most-deprived tenth.`
      : `${meta.label} by Area Deprivation Index decile.`;

  // signed value with a typographic minus (U+2212), matching gapFmt elsewhere
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
  const gapLabel =
    topMinusBottom == null ? null : `Most − least deprived: ${signed(topMinusBottom)} pts`;

  const cols: Col[] = [
    { key: "decile", label: "Decile" },
    { key: "adi", label: "ADI range" },
    { key: "value", label: meta.short_label || "Value", numeric: true, fmt: (v) => fmt(v) },
    { key: "ci", label: "95% CI" },
    { key: "n", label: "ZIPs", numeric: true, fmt: (v) => fmtInt(v) },
  ];
  const tableRows = deciles.map((d) => ({
    decile: d.decile,
    adi: `${d.adi_lo}–${d.adi_hi}`,
    value: d.value,
    ci: `${fmt(d.lci)}–${fmt(d.uci)}`,
    n: d.n,
  }));

  const tableCaption = `${meta.label} by Area Deprivation Index decile, with 95% confidence intervals and ZIP counts.`;

  return (
    <>
      <p className="panel-claim" style={{ fontVariantNumeric: "tabular-nums" }}>
        {gapLabel ? (
          <>
            {meta.short_label || meta.label} is{" "}
            <strong style={{ color: INK }}>{signed(topMinusBottom!)} pts</strong>{" "}
            {topMinusBottom! >= 0 ? "higher" : "lower"} in the most-deprived tenth than the least.
          </>
        ) : (
          <>{meta.label} across Area Deprivation Index deciles.</>
        )}
      </p>

      <div ref={ref}>
        {width > 0 && model && d1 && d10 ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={ariaLabel}
            style={{ display: "block", fontVariantNumeric: "tabular-nums" }}
          >
            <g transform={`translate(${M.l},${M.t})`}>
              {/* horizontal gridlines (decorative) */}
              <g aria-hidden="true">
                {model.y.ticks(5).map((t) => (
                  <line
                    key={t}
                    x1={0}
                    x2={model.innerW}
                    y1={model.y(t)}
                    y2={model.y(t)}
                    stroke={GRID}
                    shapeRendering="crispEdges"
                  />
                ))}
              </g>

              {/* 95% CI ribbon + inline label so the band is self-describing */}
              <path d={model.ribbon} fill="#8aa0bd" fillOpacity={0.18} aria-hidden="true" />
              <text
                x={model.px(d1)}
                y={model.y(deciles[0].lci) + 12}
                fontSize={9.5}
                fill="var(--muted)"
                aria-hidden="true"
              >
                95% CI
              </text>

              {/* benchmark reference line */}
              <g aria-hidden="true">
                <line
                  x1={0}
                  x2={model.innerW}
                  y1={model.y(benchmark)}
                  y2={model.y(benchmark)}
                  stroke={BENCH}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  shapeRendering="crispEdges"
                />
                <text
                  x={model.innerW}
                  y={model.y(benchmark) - 5}
                  textAnchor="end"
                  fontSize={11}
                  fontWeight={600}
                  fill={BENCH}
                >
                  U.S. avg {fmt(benchmark)}
                </text>
              </g>

              {/* connecting line through decile values */}
              <path
                d={model.line}
                fill="none"
                stroke={INK}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                aria-hidden="true"
              />

              {/* gap annotation: bracket between decile 1 and decile 10 values */}
              {gapLabel && (
                <GapBracket
                  x={model.px(d10)}
                  y1={model.y(d1.value)}
                  y10={model.y(d10.value)}
                  label={gapLabel}
                />
              )}

              {/* decile dots — colored by value (aggregate; the table fallback is the a11y data path) */}
              {deciles.map((d) => {
                const cx = model.px(d);
                const cy = model.y(d.value);
                const isEnd = d.decile === d1.decile || d.decile === d10.decile;
                const title = `Decile ${d.decile}: ${fmt(d.value)} (95% CI ${fmt(d.lci)}–${fmt(
                  d.uci,
                )}, n=${fmtInt(d.n)} ZIPs)`;
                return (
                  <g key={d.decile}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isEnd ? 5.5 : 4.5}
                      fill={color(d.value)}
                      stroke={HALO}
                      strokeWidth={1.5}
                    >
                      <title>{title}</title>
                    </circle>
                    {/* inline labels for the first & last deciles */}
                    {isEnd && (
                      <text
                        x={cx}
                        y={d.decile === d1.decile ? cy + 18 : cy - 12}
                        textAnchor={d.decile === d1.decile ? "start" : "end"}
                        fontSize={12}
                        fontWeight={700}
                        fill={INK}
                      >
                        {fmt(d.value)}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* y-axis */}
              <Axis orient="left" scale={model.y} tx={0} ty={0} ticks={5} tickFormat={(v) => fmt(+v)} />
              {/* x-axis (decile ticks) */}
              <Axis
                orient="bottom"
                scale={model.x}
                tx={0}
                ty={model.innerH}
                tickFormat={(v) => `${v}`}
              />

              {/* x-axis title */}
              <text
                x={model.innerW / 2}
                y={model.innerH + 36}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--ink-2)"
              >
                Area Deprivation decile (1 = least deprived → 10 = most deprived)
              </text>
            </g>

            {/* y-axis unit (the panel header already names the metric — avoid redundant ink) */}
            <text
              transform={`translate(13,${M.t + model.innerH / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="var(--ink-2)"
            >
              {meta.unit === "percent" ? "% of adults" : meta.short_label}
            </text>
          </svg>
        ) : (
          <div style={{ height: HEIGHT }} aria-hidden="true" />
        )}
      </div>

      <TableFallback caption={tableCaption} columns={cols} rows={tableRows} />
    </>
  );
}

/** Square-bracket gap annotation spanning decile-1 → decile-10 values, drawn to the right. */
function GapBracket({
  x,
  y1,
  y10,
  label,
}: {
  x: number;
  y1: number;
  y10: number;
  label: string;
}) {
  const bx = x + 14; // bracket sits just right of the decile-10 dot
  const tick = 5;
  const mid = (y1 + y10) / 2;
  return (
    <g aria-hidden="true">
      <path
        d={`M ${bx - tick} ${y1} L ${bx} ${y1} L ${bx} ${y10} L ${bx - tick} ${y10}`}
        fill="none"
        stroke={INK}
        strokeWidth={1.25}
      />
      <text
        x={bx + 6}
        y={mid}
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={700}
        fill={INK}
      >
        <tspan>{label.split(":")[0]}:</tspan>
        <tspan x={bx + 6} dy={13} fontWeight={700}>
          {label.split(":")[1]?.trim()}
        </tspan>
      </text>
    </g>
  );
}
