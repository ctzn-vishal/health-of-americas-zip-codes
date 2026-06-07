import * as d3 from "d3";

// Health score (0..100, higher = healthier) as a semicircular gauge.
const scoreColor = d3
  .scaleLinear<string>()
  .domain([0, 30, 50, 70, 100])
  .range(["#f4675d", "#f0a73a", "#e9c46a", "#7fd1a8", "#4fc99a"])
  .interpolate(d3.interpolateRgb)
  .clamp(true);

const W = 220;
const CX = 110;
const CY = 116;
const R = 92;

function polar(deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}
// arc over the top semicircle: 180° (left) → 360° (right)
function arc(a0: number, a1: number): string {
  const [x0, y0] = polar(a0);
  const [x1, y1] = polar(a1);
  const large = a1 - a0 <= 180 ? 0 : 1;
  return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
}

export default function ScoreGauge({ score }: { score: number }) {
  const angle = 180 + (Math.max(0, Math.min(100, score)) / 100) * 180;
  const color = scoreColor(score);
  return (
    <svg
      width={W}
      height={132}
      viewBox={`0 0 ${W} 132`}
      role="img"
      aria-label={`Health score ${score} out of 100`}
      style={{ display: "block", overflow: "visible" }}
    >
      <path d={arc(180, 360)} fill="none" stroke="var(--line-2)" strokeWidth={12} strokeLinecap="round" />
      <path
        d={arc(180, angle)}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${color}55)` }}
      />
      {/* end knob */}
      <circle cx={polar(angle)[0]} cy={polar(angle)[1]} r={6.5} fill={color} stroke="#0b1020" strokeWidth={2} />
      <text x={CX} y={CY - 18} textAnchor="middle" fontSize={46} fontWeight={700} fill="var(--ink)" style={{ fontVariantNumeric: "tabular-nums" }}>
        {score}
      </text>
      <text x={CX} y={CY + 2} textAnchor="middle" fontSize={12} fill="var(--muted)" letterSpacing="0.04em">
        / 100 HEALTH SCORE
      </text>
      <text x={polar(180)[0]} y={CY + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">0</text>
      <text x={polar(360)[0]} y={CY + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">100</text>
    </svg>
  );
}
