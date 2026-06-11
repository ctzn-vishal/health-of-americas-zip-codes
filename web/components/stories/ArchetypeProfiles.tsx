"use client";
import { useState } from "react";
import Link from "next/link";
import * as d3 from "d3";
import { useResize } from "@/components/charts/chartUtils";
import { fmtPop } from "@/lib/format";
import type { ArchetypeCluster, ArchetypesPayload } from "@/lib/types";
import { ARCH_COLORS, TOPIC_COLORS } from "./storyShared";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A cluster's "fingerprint": one diverging column per measure (z-score vs the U.S. norm). */
function Fingerprint({ cluster, ids, labels, topics }: { cluster: ArchetypeCluster; ids: string[]; labels: string[]; topics: string[] }) {
  const [ref, width] = useResize<HTMLDivElement>();
  const [hover, setHover] = useState<{ x: number; text: string; sub: string } | null>(null);
  const h = 92;
  const mid = h / 2;
  const sy = d3.scaleLinear().domain([-2, 2]).range([h - 6, 6]).clamp(true);
  const bw = width / ids.length;
  if (width === 0) return <div ref={ref} style={{ minHeight: h }} />;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <svg width={width} height={h} role="img" aria-label={`${cluster.label}: deviation from the U.S. norm on each measure`}>
        <line x1={0} x2={width} y1={sy(0)} y2={sy(0)} stroke="var(--line-2)" />
        {ids.map((id, i) => {
          const z = cluster.z[id] ?? 0;
          const y0 = sy(Math.max(0, z));
          const hh = Math.abs(sy(z) - sy(0));
          return (
            <rect
              key={id}
              x={i * bw + 1}
              y={z >= 0 ? y0 : sy(0)}
              width={Math.max(1, bw - 2)}
              height={Math.max(1, hh)}
              rx={1}
              fill={z >= 0 ? "#ef8a62" : "#67a9cf"}
              onMouseEnter={() =>
                setHover({
                  x: i * bw,
                  text: labels[i],
                  sub: `${z >= 0 ? "+" : ""}${z.toFixed(1)} SD vs U.S. · avg ${cluster.raw[id]?.toFixed(1)}% · ${topics[i]}`,
                })
              }
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
        <text x={2} y={12} fontSize={9.5} fill="var(--muted)">worse ↑</text>
        <text x={2} y={h - 4} fontSize={9.5} fill="var(--muted)">better ↓</text>
        <line x1={0} x2={width} y1={mid} y2={mid} stroke="transparent" />
      </svg>
      {hover && (
        <div className="tooltip" style={{ left: Math.min(hover.x, width - 230), top: -52 }}>
          <div className="tt-name">{hover.text}</div>
          <div className="tt-val">{hover.sub}</div>
        </div>
      )}
    </div>
  );
}

export default function ArchetypeProfiles({ data }: { data: ArchetypesPayload }) {
  return (
    <div className="arch-grid">
      {data.clusters.map((c) => (
        <div className="arch-card" key={c.id}>
          <h3>
            <span className="arch-dot" style={{ background: ARCH_COLORS[c.id] }} aria-hidden="true" />
            {c.label}
          </h3>
          <p className="arch-pop">
            {fmtPop(c.pop_assigned)} people · {c.n_assigned.toLocaleString()} ZIP areas assigned
          </p>
          <p className="arch-blurb">{c.blurb}</p>
          <div className="arch-stats">
            <span>{money.format(c.context.income ?? 0)} income</span>
            <span>ADI {c.context.adi}</span>
            <span>{c.context.age65}% are 65+</span>
            <span>{c.context.poverty}% poverty</span>
            <span>{Math.round((c.dense_share ?? 0) * 100)}% dense urban</span>
          </div>
          <Fingerprint cluster={c} ids={data.ids} labels={data.labels} topics={data.topics} />
          <p className="arch-ex">
            E.g.{" "}
            {c.exemplars.map((e, i) => (
              <span key={e.zip}>
                {i > 0 && " · "}
                <Link href={`/atlas/?view=snapshot&selected=${e.zip}`}>
                  {e.zip} ({e.place}, {e.state})
                </Link>
              </span>
            ))}
          </p>
        </div>
      ))}
      <p className="muted" style={{ gridColumn: "1 / -1", fontSize: 11.5, margin: 0, display: "flex", gap: 14, flexWrap: "wrap" }}>
        Fingerprint bars are standard deviations from the U.S. ZIP-level norm, in catalog order:
        {Object.entries(TOPIC_COLORS).map(([t]) => t).join(" → ")}. Hover any bar for the measure.
      </p>
    </div>
  );
}
