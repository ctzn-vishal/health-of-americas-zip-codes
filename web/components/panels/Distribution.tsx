"use client";
import type { PanelProps } from "@/lib/types";
import { colorScale, INK, BENCH, GRID, HALO } from "@/lib/colors";
import { valueFmt, fmtInt } from "@/lib/format";
import {
  useResize,
  useReducedMotion,
  Axis,
  TableFallback,
  CHART_M,
  d3,
  useMemo,
  type Col,
} from "@/components/charts/chartUtils";

const HEIGHT = 300;
const ACCENT = "#f4675d"; // high-burden marker tone (luminous on the dark base)

export default function Distribution({ charts, meta, selectedValue }: PanelProps) {
  const [ref, width] = useResize();
  const reduce = useReducedMotion();
  const fmt = valueFmt(meta.format, meta.unit);

  const bins = charts.distribution.bins;
  const benchmark = charts.distribution.benchmark;
  const p90 = charts.distribution.p90;

  const xLabel = `${meta.label} (${meta.unit === "percent" ? "%" : ""} of ${meta.denominator})`;

  const model = useMemo(() => {
    const iw = Math.max(0, width - CHART_M.l - CHART_M.r);
    const ih = Math.max(0, HEIGHT - CHART_M.t - CHART_M.b);
    if (!bins.length || iw <= 0) {
      return { iw, ih, x: null as any, y: null as any, bars: [], color: null as any };
    }
    const x0 = bins[0].x0;
    const x1 = bins[bins.length - 1].x1;
    const maxCount = d3.max(bins, (b) => b.count) ?? 1;

    const x = d3.scaleLinear().domain([x0, x1]).range([0, iw]);
    const y = d3.scaleLinear().domain([0, maxCount]).range([ih, 0]).nice();
    const color = colorScale("rate", meta.domain, meta.benchmark);

    // index of the bin that contains the selected value (for cross-highlight)
    const selIdx =
      selectedValue == null
        ? -1
        : bins.findIndex(
            (b, i) =>
              selectedValue >= b.x0 &&
              (selectedValue < b.x1 || (i === bins.length - 1 && selectedValue <= b.x1)),
          );

    const bars = bins.map((b, i) => {
      const bx = x(b.x0);
      const bw = Math.max(0.5, x(b.x1) - x(b.x0) - 0.75);
      const by = y(b.count);
      const mid = (b.x0 + b.x1) / 2;
      return {
        i,
        b,
        x: bx,
        y: by,
        w: bw,
        h: ih - by,
        fill: color(mid),
        selected: i === selIdx,
        mid,
      };
    });
    return { iw, ih, x, y, bars, color };
  }, [bins, width, meta.domain, meta.benchmark, selectedValue]);

  const tableRows = bins.map((b) => ({
    range: `${fmtInt(b.x0)}–${fmtInt(b.x1)}`,
    count: b.count,
  }));
  const cols: Col[] = [
    { key: "range", label: "Range" },
    { key: "count", label: "ZIPs", numeric: true, fmt: (v) => fmtInt(v) },
  ];

  // Modal bin range (where the mass concentrates) for the takeaway sentence.
  const modal = bins.length ? bins.reduce((a, b) => (b.count > a.count ? b : a), bins[0]) : null;
  const aria =
    modal != null
      ? `Distribution of ${meta.label} across ${fmtInt(
          d3.sum(bins, (b) => b.count),
        )} ZIP codes; most cluster near ${fmt((modal.x0 + modal.x1) / 2)}, with the U.S. average at ${fmt(
          benchmark,
        )} and high-burden ZIPs at or above ${fmt(p90)}.`
      : `Distribution of ${meta.label} across ZIP codes.`;

  const bx = model.x ? CHART_M.l + model.x(benchmark) : 0;
  const px = model.x ? CHART_M.l + model.x(p90) : 0;
  const baselineY = CHART_M.t + model.ih;
  const showSel =
    selectedValue != null &&
    model.x != null &&
    selectedValue >= bins[0]?.x0 &&
    selectedValue <= bins[bins.length - 1]?.x1;
  const sx = showSel && model.x ? CHART_M.l + model.x(selectedValue!) : 0;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={aria}
          style={{ fontVariantNumeric: "tabular-nums", display: "block" }}
        >
          {/* horizontal gridlines (decorative) */}
          <g aria-hidden="true">
            {model.y &&
              (model.y.ticks(5) as number[]).map((t) => (
                <line
                  key={t}
                  x1={CHART_M.l}
                  x2={CHART_M.l + model.iw}
                  y1={CHART_M.t + model.y(t)}
                  y2={CHART_M.t + model.y(t)}
                  stroke={GRID}
                  shapeRendering="crispEdges"
                />
              ))}
          </g>

          {/* bars */}
          <g>
            {model.bars.map((d) => (
              <rect
                key={d.i}
                x={CHART_M.l + d.x}
                y={CHART_M.t + d.y}
                width={d.w}
                height={d.h}
                fill={d.selected ? INK : d.fill}
                fillOpacity={d.selected ? 1 : 0.85}
                stroke={d.selected ? HALO : "none"}
                strokeWidth={d.selected ? 2 : 0}
                style={reduce ? undefined : { transition: "fill-opacity 120ms ease" }}
              >
                <title>
                  {`${fmt(d.b.x0)}–${fmt(d.b.x1)}: ${fmtInt(d.b.count)} ZIPs${
                    d.selected ? " (contains selected)" : ""
                  }`}
                </title>
              </rect>
            ))}
          </g>

          {/* benchmark reference line + label */}
          {model.x && (
            <g aria-hidden="true">
              <line
                x1={bx}
                x2={bx}
                y1={CHART_M.t}
                y2={baselineY}
                stroke={BENCH}
                strokeWidth={2}
                shapeRendering="crispEdges"
              />
              <text
                x={Math.min(bx + 5, width - CHART_M.r)}
                y={CHART_M.t + 9}
                fontSize={11}
                fontWeight={600}
                fill={BENCH}
                textAnchor={bx > width - 90 ? "end" : "start"}
                dx={bx > width - 90 ? -5 : 0}
              >
                {`U.S. avg ${fmt(benchmark)}`}
              </text>
            </g>
          )}

          {/* p90 high-burden reference line + label */}
          {model.x && (
            <g aria-hidden="true">
              <line
                x1={px}
                x2={px}
                y1={CHART_M.t}
                y2={baselineY}
                stroke={ACCENT}
                strokeWidth={1.25}
                strokeDasharray="2 3"
                strokeOpacity={0.85}
                shapeRendering="crispEdges"
              />
              <text
                x={px - 5}
                y={CHART_M.t + 9}
                fontSize={11}
                fontWeight={600}
                fill={ACCENT}
                textAnchor="end"
              >
                {`High-burden ≥${fmt(p90)}`}
              </text>
            </g>
          )}

          {/* selected-value triangle marker on the baseline */}
          {showSel && (
            <g aria-hidden="true">
              <path
                d={`M${sx} ${baselineY - 1} l-6 -9 l12 0 Z`}
                fill={INK}
                stroke={HALO}
                strokeWidth={1}
              />
              <text
                x={sx}
                y={baselineY - 13}
                fontSize={11}
                fontWeight={700}
                fill={INK}
                textAnchor={sx > width - 70 ? "end" : sx < 70 ? "start" : "middle"}
              >
                {`Selected ${fmt(selectedValue!)}`}
              </text>
            </g>
          )}

          {/* axes */}
          {model.x && model.y && (
            <>
              <Axis
                orient="left"
                scale={model.y}
                tx={CHART_M.l}
                ty={CHART_M.t}
                ticks={5}
                tickFormat={(d) => fmtInt(d as number)}
              />
              <Axis
                orient="bottom"
                scale={model.x}
                tx={CHART_M.l}
                ty={baselineY}
                ticks={6}
                tickFormat={(d) => fmt(d as number)}
              />
            </>
          )}

          {/* x-axis title */}
          <text
            x={CHART_M.l + model.iw / 2}
            y={HEIGHT - 2}
            textAnchor="middle"
            fontSize={11}
            fill={BENCH}
          >
            {xLabel}
          </text>
        </svg>
      )}

      <TableFallback
        caption={`${meta.label}: number of ZIP codes in each value range. ${aria}`}
        columns={cols}
        rows={tableRows}
        label="Show distribution data"
      />
    </div>
  );
}
