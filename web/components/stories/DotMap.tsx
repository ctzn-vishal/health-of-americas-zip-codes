"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { useResize } from "@/components/charts/chartUtils";
import { loadDotmap } from "@/lib/data";
import { SEQUENTIAL } from "@/lib/colors";
import type { DotmapPayload } from "@/lib/types";
import { ARCH_COLORS } from "./storyShared";

const pc1Color = d3
  .scaleLinear<string>()
  .domain([0, 25, 50, 75, 100])
  .range(SEQUENTIAL)
  .interpolate(d3.interpolateRgb)
  .clamp(true);

/**
 * Canvas dot map of ZCTA centroids (Albers USA), colored either by PC1 burden percentile
 * or by archetype cluster. ~23.8k dots — cheap enough to draw synchronously.
 */
export default function DotMap({ mode, archLabels }: { mode: "pc1" | "cluster"; archLabels?: string[] }) {
  const [data, setData] = useState<DotmapPayload | null>(null);
  const [ref, width] = useResize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    loadDotmap().then(setData).catch(() => {});
  }, []);

  const h = Math.max(300, Math.round(width * 0.56));
  const projection = useMemo(
    () => (width > 0 ? d3.geoAlbersUsa().scale(width * 1.18).translate([width / 2, h / 2]) : null),
    [width, h],
  );

  useEffect(() => {
    if (!data || !projection || !canvasRef.current) return;
    const dpr = window.devicePixelRatio || 1;
    const cv = canvasRef.current;
    cv.width = width * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, h);
    // base pass: every ZCTA, dim — keeps the national outline whole where the
    // 26-measure complete case has no coverage (mostly small rural areas)
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#2c3545";
    for (let i = 0; i < data.n; i++) {
      if (data.cluster[i] >= 0) continue;
      const p = projection([data.lon[i], data.lat[i]]);
      if (!p) continue;
      const r = 0.5 + Math.min(1.4, Math.sqrt(data.pop[i]) / 220);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
    // colored pass: covered ZCTAs on top
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < data.n; i++) {
      if (data.cluster[i] < 0) continue;
      const p = projection([data.lon[i], data.lat[i]]);
      if (!p) continue;
      ctx.fillStyle = mode === "pc1" ? pc1Color(data.pc1[i]) : ARCH_COLORS[data.cluster[i]] ?? "#5d6675";
      const r = 0.55 + Math.min(2.1, Math.sqrt(data.pop[i]) / 160);
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [data, projection, width, h, mode]);

  if (width === 0) return <div ref={ref} style={{ minHeight: 360 }} />;

  return (
    <div ref={ref}>
      {data ? (
        <canvas ref={canvasRef} style={{ width, height: h, display: "block" }} role="img"
          aria-label={mode === "pc1" ? "Map of ZIP centroids colored by overall burden percentile" : "Map of ZIP centroids colored by community archetype"} />
      ) : (
        <div style={{ height: h, display: "grid", placeItems: "center" }} className="muted">Loading 23,818 ZIP centroids…</div>
      )}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 8, fontSize: 11.5, color: "var(--ink-2)" }}>
        {mode === "pc1" ? (
          <>
            <span style={{ color: "var(--muted)" }}>Lower burden</span>
            <svg width={130} height={10} aria-hidden="true">
              <defs>
                <linearGradient id="pc1-ramp" x1="0" x2="1">
                  {SEQUENTIAL.map((c, i) => (
                    <stop key={i} offset={`${(i / (SEQUENTIAL.length - 1)) * 100}%`} stopColor={c} />
                  ))}
                </linearGradient>
              </defs>
              <rect width={130} height={10} rx={2} fill="url(#pc1-ramp)" stroke="rgba(255,255,255,0.14)" />
            </svg>
            <span style={{ color: "var(--muted)" }}>Higher burden</span>
          </>
        ) : (
          (archLabels ?? []).map((lab, i) => (
            <span key={lab} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i style={{ width: 9, height: 9, borderRadius: "50%", background: ARCH_COLORS[i], display: "inline-block" }} />
              {lab}
            </span>
          ))
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
          <i style={{ width: 9, height: 9, borderRadius: "50%", background: "#2c3545", display: "inline-block" }} />
          no full-measure coverage
        </span>
        <span style={{ marginLeft: "auto", color: "var(--muted)" }}>Dot size ∝ population</span>
      </div>
    </div>
  );
}
