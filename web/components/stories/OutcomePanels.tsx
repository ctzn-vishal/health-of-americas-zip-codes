"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Axis, useResize } from "@/components/charts/chartUtils";
import { DIVERGING } from "@/lib/colors";
import { loadMentalHealth, loadSmoking } from "@/lib/data";
import type { OutcomeMapData } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Canvas scatter with overlay fit/reference lines, optional color-by */
/* ------------------------------------------------------------------ */
export interface FitLine {
  pts: [number, number][];
  label: string;
  dash?: string;
  color?: string;
}

export function ScatterFit({
  x,
  y,
  zip,
  state,
  pop,
  color,
  colorLegend,
  lines,
  xLabel,
  yLabel,
  height = 430,
}: {
  x: number[];
  y: number[];
  zip: string[];
  state: (string | null)[];
  pop: number[];
  color?: (i: number) => string;
  colorLegend?: React.ReactNode;
  lines: FitLine[];
  xLabel: string;
  yLabel: string;
  height?: number;
}) {
  const [ref, width] = useResize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; label: string; sub: string } | null>(null);
  const m = { t: 16, r: 18, b: 44, l: 50 };
  const h = height;

  const scales = useMemo(() => {
    if (width === 0 || x.length === 0) return null;
    const sx = d3.scaleLinear().domain(d3.extent(x) as [number, number]).nice().range([m.l, width - m.r]);
    const sy = d3.scaleLinear().domain(d3.extent(y) as [number, number]).nice().range([h - m.b, m.t]);
    const quad = d3
      .quadtree<number>()
      .x((i) => sx(x[i]))
      .y((i) => sy(y[i]))
      .addAll(d3.range(x.length));
    return { sx, sy, quad };
  }, [x, y, width, h]);

  useEffect(() => {
    if (!scales || !canvasRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const cv = canvasRef.current;
    cv.width = width * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    ctx.globalAlpha = 0.62;
    for (let i = 0; i < x.length; i++) {
      ctx.fillStyle = color ? color(i) : "#6cb6ff";
      ctx.beginPath();
      ctx.arc(scales.sx(x[i]), scales.sy(y[i]), 0.7 + Math.min(2, Math.sqrt(pop[i] || 0) / 140), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [scales, x, y, pop, color, width, h]);

  if (width === 0 || !scales) return <div ref={ref} style={{ minHeight: h }} />;

  const onMove = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const i = scales.quad.find(px, py, 9);
    if (i == null) return setHover(null);
    setHover({
      x: px,
      y: py,
      label: `ZIP ${zip[i]}${state[i] ? ` · ${state[i]}` : ""}`,
      sub: `${xLabel}: ${x[i]} · ${yLabel}: ${y[i]}`,
    });
  };

  const line = d3.line<[number, number]>().x((d) => scales.sx(d[0])).y((d) => scales.sy(d[1]));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <canvas ref={canvasRef} style={{ width, height: h, display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      <svg width={width} height={h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
        {lines.map((l) => (
          <g key={l.label}>
            <path d={line(l.pts) ?? undefined} fill="none" stroke={l.color ?? "#e9eef6"} strokeWidth={1.7} strokeDasharray={l.dash} opacity={0.9} />
            <text
              x={scales.sx(l.pts[l.pts.length - 1][0]) - 4}
              y={scales.sy(l.pts[l.pts.length - 1][1]) - 6}
              textAnchor="end"
              fontSize={10.5}
              fill={l.color ?? "var(--ink-2)"}
            >
              {l.label}
            </text>
          </g>
        ))}
        <Axis orient="bottom" scale={scales.sx} tx={0} ty={h - m.b} ticks={6} />
        <Axis orient="left" scale={scales.sy} tx={m.l} ty={0} ticks={6} />
        <text x={(m.l + width - m.r) / 2} y={h - 8} textAnchor="middle" fontSize={11} fill="var(--ink-2)">{xLabel}</text>
        <text x={14} y={m.t + 4} fontSize={11} fill="var(--ink-2)" transform={`rotate(-90 14 ${m.t + 4})`} textAnchor="end">{yLabel}</text>
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 230), top: hover.y + 10 }}>
          <div className="tt-name">{hover.label}</div>
          <div className="tt-val">{hover.sub}</div>
        </div>
      )}
      {colorLegend}
    </div>
  );
}

/* ------------------------------------------------------------ */
/* Diverging centroid map for an outcome ratio / residual field */
/* ------------------------------------------------------------ */
export function OutcomeMap({ src }: { src: "mental_health" | "smoking" }) {
  const [map, setMap] = useState<OutcomeMapData | null>(null);
  const [ref, width] = useResize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    (src === "mental_health" ? loadMentalHealth() : loadSmoking()).then((p) => setMap(p.map)).catch(() => {});
  }, [src]);

  const h = Math.max(300, Math.round(width * 0.56));
  const projection = useMemo(
    () => (width > 0 ? d3.geoAlbersUsa().scale(width * 1.18).translate([width / 2, h / 2]) : null),
    [width, h],
  );

  const colorOf = useMemo(() => {
    if (!map) return null;
    const dev = map.v.map((v) => Math.abs(v - map.center)).sort(d3.ascending);
    const g = d3.quantile(dev, 0.95) ?? 1;
    return d3
      .scaleLinear<string>()
      .domain([map.center - g, map.center - g / 2, map.center, map.center + g / 2, map.center + g])
      .range(DIVERGING)
      .interpolate(d3.interpolateRgb)
      .clamp(true);
  }, [map]);

  useEffect(() => {
    if (!map || !projection || !colorOf || !canvasRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const cv = canvasRef.current;
    cv.width = width * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    ctx.globalAlpha = 0.82;
    for (let i = 0; i < map.lon.length; i++) {
      const p = projection([map.lon[i], map.lat[i]]);
      if (!p) continue;
      ctx.fillStyle = colorOf(map.v[i]);
      const r = 0.55 + Math.min(2.1, Math.sqrt(map.pop[i]) / 160);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [map, projection, colorOf, width, h]);

  if (width === 0) return <div ref={ref} style={{ minHeight: 360 }} />;

  return (
    <div ref={ref}>
      {map ? (
        <canvas ref={canvasRef} style={{ width, height: h, display: "block" }} role="img" aria-label={`Map of ${map.label}`} />
      ) : (
        <div style={{ height: h, display: "grid", placeItems: "center" }} className="muted">Loading map…</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, fontSize: 11.5, color: "var(--muted)", flexWrap: "wrap" }}>
        <span>below</span>
        <svg width={130} height={10} aria-hidden="true">
          <defs>
            <linearGradient id={`div-${src}`} x1="0" x2="1">
              {DIVERGING.map((c, i) => (
                <stop key={i} offset={`${(i / (DIVERGING.length - 1)) * 100}%`} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <rect width={130} height={10} rx={2} fill={`url(#div-${src})`} stroke="rgba(255,255,255,0.14)" />
        </svg>
        <span>above {map ? `(${map.label})` : ""}</span>
        <span style={{ marginLeft: "auto" }}>Dot size ∝ population</span>
      </div>
    </div>
  );
}

/* --------------------------------------------- */
/* Horizontal state strip — value per state, ranked */
/* --------------------------------------------- */
export function StateStrip({
  rows,
  center,
  fmtKind,
  label,
}: {
  rows: { state: string; v: number }[];
  center: number;
  fmtKind: "ratio" | "signed"; // serializable across the RSC boundary
  label: string;
}) {
  const fmt = (v: number) => (fmtKind === "signed" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}` : v.toFixed(2));
  const [ref, width] = useResize<HTMLDivElement>();
  const rowH = 13.5;
  const m = { t: 8, b: 26, l: 36, r: 56 };
  const h = m.t + rows.length * rowH + m.b;
  const ext = d3.extent(rows.map((r) => r.v)) as [number, number];
  const sx = d3.scaleLinear().domain(ext).nice().range([m.l, (width || 600) - m.r]);
  if (width === 0) return <div ref={ref} style={{ minHeight: 400 }} />;
  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label={`${label} by state`}>
        <line x1={sx(center)} x2={sx(center)} y1={m.t} y2={h - m.b} stroke="var(--line-2)" strokeDasharray="4 3" />
        <text x={sx(center)} y={h - 10} textAnchor="middle" fontSize={10} fill="var(--muted)">U.S. {fmt(center)}</text>
        {rows.map((r, i) => {
          const yy = m.t + i * rowH + rowH / 2;
          const warm = r.v > center;
          return (
            <g key={r.state}>
              <text x={m.l - 6} y={yy + 3.5} textAnchor="end" fontSize={9.5} fill="var(--muted)">{r.state}</text>
              <line x1={sx(center)} x2={sx(r.v)} y1={yy} y2={yy} stroke={warm ? "#ef8a62" : "#67a9cf"} strokeWidth={2} opacity={0.55} />
              <circle cx={sx(r.v)} cy={yy} r={3} fill={warm ? "#ef8a62" : "#67a9cf"}>
                <title>{`${r.state}: ${fmt(r.v)}`}</title>
              </circle>
              {(i < 3 || i >= rows.length - 3) && (
                <text x={sx(r.v) + (warm ? 7 : -7)} y={yy + 3.5} textAnchor={warm ? "start" : "end"} fontSize={9.5} fill="var(--ink-2)">
                  {fmt(r.v)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
