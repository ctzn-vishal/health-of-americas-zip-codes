"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { Axis, useResize } from "@/components/charts/chartUtils";
import { loadPca } from "@/lib/data";
import type { PcaPayload } from "@/lib/types";
import { TOPIC_COLORS } from "./storyShared";

/** Variance explained per component, with the cumulative line. */
export function PcaScree({ explained }: { explained: number[] }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const h = 210;
  const m = { t: 14, r: 46, b: 30, l: 44 };
  const comps = explained.slice(0, 8);
  const x = d3.scaleBand<number>().domain(d3.range(comps.length)).range([m.l, width - m.r]).padding(0.28);
  const y = d3.scaleLinear().domain([0, Math.ceil(comps[0] * 10) / 10]).range([h - m.b, m.t]);
  const yc = d3.scaleLinear().domain([0, 1]).range([h - m.b, m.t]);
  const cum = comps.reduce<number[]>((acc, v) => [...acc, (acc[acc.length - 1] ?? 0) + v], []);
  if (width === 0) return <div ref={ref} style={{ minHeight: h }} />;
  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label="Variance explained by each principal component">
        {comps.map((v, i) => (
          <g key={i}>
            <rect x={x(i)} y={y(v)} width={x.bandwidth()} height={y(0) - y(v)} fill="#6cb6ff" opacity={i === 0 ? 1 : 0.55} rx={2} />
            <text x={(x(i) ?? 0) + x.bandwidth() / 2} y={y(v) - 5} textAnchor="middle" fontSize={10.5} fill="var(--ink-2)">
              {(v * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <path
          d={d3.line<number>().x((_, i) => (x(i) ?? 0) + x.bandwidth() / 2).y((v) => yc(v))(cum) ?? undefined}
          fill="none"
          stroke="#ffd166"
          strokeWidth={1.6}
          strokeDasharray="4 3"
        />
        {cum.map((v, i) => (
          <circle key={i} cx={(x(i) ?? 0) + x.bandwidth() / 2} cy={yc(v)} r={2.6} fill="#ffd166" />
        ))}
        <text x={width - m.r + 6} y={yc(cum[cum.length - 1])} fontSize={10.5} fill="#ffd166" dominantBaseline="middle">
          {(cum[cum.length - 1] * 100).toFixed(0)}% cum.
        </text>
        <Axis orient="left" scale={y} tx={m.l} ty={0} ticks={4} tickFormat={(d) => `${(+d * 100).toFixed(0)}%`} />
        <Axis orient="bottom" scale={x as any} tx={0} ty={h - m.b} tickFormat={(d) => `PC${+d + 1}`} />
      </svg>
    </div>
  );
}

/** Diverging loading bars for PC1 + PC2, sorted by PC1. */
export function PcaLoadings({ ids, labels, topics, loadings }: { ids: string[]; labels: string[]; topics: string[]; loadings: number[][] }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const order = useMemo(
    () => d3.range(ids.length).sort((a, b) => loadings[0][b] - loadings[0][a]),
    [ids, loadings],
  );
  const rowH = 17;
  const labelW = 124;
  const m = { t: 26, b: 8 };
  const h = m.t + rowH * ids.length + m.b;
  const colW = (width - labelW) / 2 - 14;
  const ext = Math.max(
    0.05,
    d3.max([...loadings[0], ...loadings[1]].map(Math.abs)) ?? 0.4,
  );
  const sx = d3.scaleLinear().domain([-ext, ext]).range([0, colW]);
  if (width === 0) return <div ref={ref} style={{ minHeight: 460 }} />;
  return (
    <div ref={ref}>
      <svg width={width} height={h} role="img" aria-label="Measure loadings on the first two principal components">
        <text x={labelW + colW / 2} y={14} textAnchor="middle" fontSize={11.5} fontWeight={650} fill="var(--ink)">PC1 · overall burden</text>
        <text x={labelW + colW + 28 + colW / 2} y={14} textAnchor="middle" fontSize={11.5} fontWeight={650} fill="var(--ink)">PC2 · age &amp; place</text>
        {order.map((mi, r) => {
          const yy = m.t + r * rowH;
          return (
            <g key={ids[mi]}>
              <text x={labelW - 8} y={yy + rowH / 2 + 3.5} textAnchor="end" fontSize={10.5} fill={TOPIC_COLORS[topics[mi]] ?? "var(--ink-2)"}>
                {labels[mi]}
              </text>
              {[0, 1].map((pc) => {
                const x0 = labelW + pc * (colW + 28);
                const v = loadings[pc][mi];
                return (
                  <g key={pc}>
                    <line x1={x0 + sx(0)} y1={yy} x2={x0 + sx(0)} y2={yy + rowH - 3} stroke="var(--line-2)" />
                    <rect
                      x={x0 + Math.min(sx(0), sx(v))}
                      y={yy + 2.5}
                      width={Math.abs(sx(v) - sx(0))}
                      height={rowH - 8}
                      rx={2}
                      fill={v >= 0 ? "#ef8a62" : "#67a9cf"}
                    >
                      <title>{`${labels[mi]} · PC${pc + 1} loading ${v.toFixed(2)}`}</title>
                    </rect>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="muted" style={{ fontSize: 11.5, margin: "4px 0 0" }}>
        Warm bars load positive (more of the component), cool bars negative. PC1: everything rises together except
        binge drinking. PC2: chronic-disease measures (older places) vs. social-need measures (younger, denser places).
      </p>
    </div>
  );
}

/** Canvas biplot of PC1 x PC2, colored by median household income. */
export function PcaBiplot() {
  const [data, setData] = useState<PcaPayload | null>(null);
  const [ref, width] = useResize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; y: number; label: string; sub: string } | null>(null);
  useEffect(() => {
    loadPca().then(setData).catch(() => {});
  }, []);

  const h = 460;
  const m = { t: 18, r: 18, b: 40, l: 48 };

  const scales = useMemo(() => {
    if (!data || width === 0) return null;
    const s = data.scatter;
    const x = d3.scaleLinear().domain(d3.extent(s.pc1) as [number, number]).nice().range([m.l, width - m.r]);
    const y = d3.scaleLinear().domain(d3.extent(s.pc2) as [number, number]).nice().range([h - m.b, m.t]);
    const incomes = s.income.filter((v): v is number => v != null);
    const color = d3
      .scaleSequential((t: number) => d3.interpolateRgbBasis(["#f4675d", "#b9a48a", "#6cb6ff"])(t))
      .domain([d3.quantile(incomes.slice().sort(d3.ascending), 0.05) ?? 30000, d3.quantile(incomes.slice().sort(d3.ascending), 0.95) ?? 150000]);
    const quad = d3
      .quadtree<number>()
      .x((i) => x(s.pc1[i]))
      .y((i) => y(s.pc2[i]))
      .addAll(d3.range(s.zip.length));
    return { x, y, color, quad };
  }, [data, width]);

  useEffect(() => {
    if (!data || !scales || !canvasRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const cv = canvasRef.current;
    cv.width = width * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    const s = data.scatter;
    for (let i = 0; i < s.zip.length; i++) {
      const inc = s.income[i];
      ctx.globalAlpha = 0.66;
      ctx.fillStyle = inc == null ? "#5d6675" : (scales.color(inc) as string);
      ctx.beginPath();
      ctx.arc(scales.x(s.pc1[i]), scales.y(s.pc2[i]), 0.7 + Math.min(2.1, Math.sqrt(s.pop[i]) / 130), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [data, scales, width]);

  if (!data || width === 0 || !scales) {
    return <div ref={ref} style={{ minHeight: h, display: "grid", placeItems: "center" }} className="muted">Loading 23,818 ZIP codes…</div>;
  }

  const onMove = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const i = scales.quad.find(px, py, 9);
    if (i == null) return setHover(null);
    const s = data.scatter;
    setHover({
      x: px,
      y: py,
      label: `ZIP ${s.zip[i]}${s.state[i] ? ` · ${s.state[i]}` : ""}`,
      sub: `burden ${s.pc1[i] >= 0 ? "+" : ""}${s.pc1[i].toFixed(1)} · age axis ${s.pc2[i] >= 0 ? "+" : ""}${s.pc2[i].toFixed(1)}${s.income[i] != null ? ` · $${Math.round(s.income[i]! / 1000)}k income` : ""}`,
    });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <canvas ref={canvasRef} style={{ width, height: h, display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      <svg width={width} height={h} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
        <Axis orient="bottom" scale={scales.x} tx={0} ty={h - m.b} ticks={6} />
        <Axis orient="left" scale={scales.y} tx={m.l} ty={0} ticks={6} />
        <text x={width - m.r} y={h - 8} textAnchor="end" fontSize={11} fill="var(--ink-2)">PC1 → more overall burden</text>
        <text x={14} y={m.t} fontSize={11} fill="var(--ink-2)" transform={`rotate(-90 14 ${m.t})`} textAnchor="end">PC2 → older, chronic-disease pole</text>
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 220), top: hover.y + 10 }}>
          <div className="tt-name">{hover.label}</div>
          <div className="tt-val">{hover.sub}</div>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        <span>Lower income</span>
        <svg width={120} height={10} aria-hidden="true">
          <defs>
            <linearGradient id="inc-ramp" x1="0" x2="1">
              <stop offset="0%" stopColor="#f4675d" />
              <stop offset="50%" stopColor="#b9a48a" />
              <stop offset="100%" stopColor="#6cb6ff" />
            </linearGradient>
          </defs>
          <rect width={120} height={10} rx={2} fill="url(#inc-ramp)" stroke="rgba(255,255,255,0.14)" />
        </svg>
        <span>Higher income</span>
        <span style={{ marginLeft: "auto" }}>Dot size ∝ population · hover for the ZIP</span>
      </div>
    </div>
  );
}
