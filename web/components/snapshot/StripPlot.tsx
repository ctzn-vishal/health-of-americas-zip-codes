import * as d3 from "d3";
import { useId } from "react";
import { colorScale, SEQUENTIAL, BENCH, HALO } from "@/lib/colors";
import type { MetricDistribution, MetricMeta } from "@/lib/types";

const H = 56;
const PAD = 6;
const TOP = 11;
const BASE = H - 19;

export default function StripPlot({
  width,
  meta,
  dist,
  value,
  stateMean,
  stateAbbr,
}: {
  width: number;
  meta: MetricMeta;
  dist: MetricDistribution;
  value: number | null;
  stateMean: number | null;
  stateAbbr: string;
}) {
  const gid = useId().replace(/:/g, "");
  const innerW = Math.max(10, width - PAD * 2);

  // truncate extreme tails so outlier ZIPs don't squash the distribution:
  // keep the central ~95% of mass, but always include the US/state/ZIP markers
  const total = d3.sum(dist.bins, (b) => b[2]) || 1;
  let lo = dist.min;
  let hi = dist.max;
  let acc = 0;
  for (const b of dist.bins) {
    acc += b[2];
    if (acc / total >= 0.025) { lo = b[0]; break; }
  }
  acc = 0;
  for (let i = dist.bins.length - 1; i >= 0; i--) {
    acc += dist.bins[i][2];
    if (acc / total >= 0.025) { hi = dist.bins[i][1]; break; }
  }
  const marks = [dist.benchmark, stateMean, value].filter((v): v is number => v != null);
  lo = Math.min(lo, ...marks);
  hi = Math.max(hi, ...marks);
  if (hi <= lo) { lo = dist.min; hi = dist.max; }

  const x = d3.scaleLinear().domain([lo, hi]).range([PAD, PAD + innerW]).clamp(true);
  const color = colorScale("rate", meta.domain, meta.benchmark);

  // distribution ridgeline from the histogram bins, smoothed
  const visBins = dist.bins.filter((b) => (b[0] + b[1]) / 2 >= lo && (b[0] + b[1]) / 2 <= hi);
  const maxCount = d3.max(visBins, (b) => b[2]) || 1;
  const y = d3.scaleLinear().domain([0, maxCount]).range([BASE, TOP]);
  const pts: [number, number][] = visBins.map((b) => [(b[0] + b[1]) / 2, b[2]]);
  const area = d3
    .area<[number, number]>()
    .x((d) => x(d[0]))
    .y0(BASE)
    .y1((d) => y(d[1]))
    .curve(d3.curveBasis);
  const ridge = pts.length ? area(pts) ?? "" : "";

  const usX = x(dist.benchmark);
  const stX = stateMean != null ? x(stateMean) : null;
  const zX = value != null ? x(value) : null;

  return (
    <svg width={width} height={H} role="img" aria-label={ariaLabel(meta, value, stateAbbr, stateMean, dist.benchmark)} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`ramp-${gid}`} x1="0" x2="1" y1="0" y2="0">
          {SEQUENTIAL.map((c, i) => (
            <stop key={i} offset={`${(i / (SEQUENTIAL.length - 1)) * 100}%`} stopColor={c} />
          ))}
        </linearGradient>
      </defs>

      {/* baseline */}
      <line x1={PAD} x2={PAD + innerW} y1={BASE} y2={BASE} stroke="var(--line)" shapeRendering="crispEdges" />
      {/* distribution ridgeline, filled with the burden ramp */}
      {ridge && <path d={ridge} fill={`url(#ramp-${gid})`} fillOpacity={0.32} stroke={`url(#ramp-${gid})`} strokeOpacity={0.5} strokeWidth={1} />}

      {/* US average reference */}
      <line x1={usX} x2={usX} y1={TOP - 3} y2={BASE} stroke={BENCH} strokeWidth={1.5} strokeDasharray="3 3" />
      <text x={usX} y={TOP - 5} textAnchor="middle" fontSize={9} fontWeight={600} fill={BENCH}>US</text>

      {/* state average reference */}
      {stX != null && (
        <>
          <line x1={stX} x2={stX} y1={TOP - 3} y2={BASE} stroke="var(--accent-cool)" strokeWidth={1.5} strokeOpacity={0.8} />
          <text x={stX} y={BASE + 11} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--accent-cool)">{stateAbbr}</text>
        </>
      )}

      {/* the ZIP itself */}
      {zX != null ? (
        <>
          <line x1={zX} x2={zX} y1={TOP - 2} y2={BASE} stroke={HALO} strokeWidth={2.5} />
          <circle cx={zX} cy={BASE} r={4.5} fill={color(value as number)} stroke="var(--ink)" strokeWidth={1.5} />
        </>
      ) : (
        <text x={PAD + innerW / 2} y={BASE - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">no estimate</text>
      )}
    </svg>
  );
}

function ariaLabel(meta: MetricMeta, value: number | null, st: string, stMean: number | null, bench: number) {
  if (value == null) return `${meta.label}: no estimate for this ZIP.`;
  const unit = meta.unit === "percent" ? "%" : "";
  const vs = value < bench ? "below" : value > bench ? "above" : "at";
  return `${meta.label}: ${value}${unit} for this ZIP, ${vs} the U.S. average of ${bench}${unit}${stMean != null ? ` and the ${st} average of ${stMean}${unit}` : ""}.`;
}
