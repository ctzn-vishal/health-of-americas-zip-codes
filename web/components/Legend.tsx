"use client";
import { legendStops, NODATA } from "@/lib/colors";
import type { Mode } from "@/lib/types";

interface Props {
  mode: Mode;
  domain: [number, number, number];
  benchmark: number;
  fmt: (n: number) => string;
  title: string;
  lowerIsBetter: boolean;
}

const MODE_DESC: Record<Mode, string> = {
  rate: "Estimated prevalence",
  gap: "Difference from U.S. average",
  percentile: "National percentile (0–100)",
};

export default function Legend({ mode, domain, benchmark, fmt, title, lowerIsBetter }: Props) {
  const stops = legendStops(mode, domain, benchmark, fmt);
  const gradient = `linear-gradient(to right, ${stops.map((s) => `${s.color} ${Math.round(s.t * 100)}%`).join(", ")})`;
  // For the diverging gap ramp, name what each pole MEANS (not just signed numbers).
  // Warm/high end = worse when lower_is_better; cool/low end = better.
  const lowEnd = lowerIsBetter ? "Better than U.S." : "Worse than U.S.";
  const highEnd = lowerIsBetter ? "Worse than U.S." : "Better than U.S.";
  return (
    <div className="legend" role="group" aria-label={`Legend: ${title}, ${MODE_DESC[mode]}`}>
      <div className="legend-title">
        {title} · <span className="muted">{MODE_DESC[mode]}</span>
      </div>
      <div className="ramp" style={{ background: gradient }} aria-hidden />
      <div className="ticks">
        {stops.map((s, i) => (
          <span key={i} style={{ fontVariantNumeric: "tabular-nums" }}>{s.label}</span>
        ))}
      </div>
      {mode === "gap" && (
        <div className="legend-poles" aria-hidden>
          <span>← {lowEnd}</span>
          <span>{highEnd} →</span>
        </div>
      )}
      <div className="nodata-row">
        <span className="nodata-sw" style={{ background: NODATA }} aria-hidden />
        No estimate available
      </div>
    </div>
  );
}
