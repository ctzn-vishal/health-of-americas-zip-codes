// Signature graphics for story cards — small, deterministic, server-rendered SVG motifs
// that echo each story's central figure. No client JS; safe in static HTML.
import { ARCH_COLORS, CORR_RAMP } from "./storyShared";

// Tiny seeded PRNG so dot positions are identical on every render/build (no hydration drift).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 150;
const H = 72;

function OneAxisSig() {
  const rnd = mulberry32(7);
  const pts = Array.from({ length: 42 }, () => {
    const t = rnd();
    return {
      x: 14 + t * (W - 30) + (rnd() - 0.5) * 16,
      y: H - 12 - t * (H - 24) + (rnd() - 0.5) * 16,
      c: t,
    };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-sig" aria-hidden="true">
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.1} fill={p.c > 0.5 ? "#f4675d" : "#6cb6ff"} opacity={0.4 + p.c * 0.4} />
      ))}
      <line x1={12} y1={H - 10} x2={W - 10} y2={10} stroke="#e9eef6" strokeWidth={1.4} strokeDasharray="5 3" opacity={0.7} />
    </svg>
  );
}

function ConnectedSig() {
  const rnd = mulberry32(11);
  const n = 7;
  const cell = 9;
  const x0 = (W - n * cell) / 2;
  const y0 = (H - n * cell) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-sig" aria-hidden="true">
      {Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
          // block structure: strong inside blocks (0-2, 3-6), weak across
          const same = (i < 3 && j < 3) || (i >= 3 && j >= 3);
          const v = i === j ? 0.95 : same ? 0.55 + rnd() * 0.4 : rnd() * 0.5 - 0.25;
          const idx = Math.round(((v + 1) / 2) * (CORR_RAMP.length - 1));
          return (
            <rect key={`${i}-${j}`} x={x0 + j * cell} y={y0 + i * cell} width={cell - 1.2} height={cell - 1.2} rx={1.2}
              fill={CORR_RAMP[Math.max(0, Math.min(CORR_RAMP.length - 1, idx))]} />
          );
        }),
      )}
    </svg>
  );
}

function FourAmericasSig() {
  const rnd = mulberry32(23);
  const centers = [
    [32, 24],
    [62, 48],
    [96, 22],
    [122, 46],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-sig" aria-hidden="true">
      {centers.map(([cx, cy], c) =>
        Array.from({ length: 16 }, (_, i) => {
          const a = rnd() * Math.PI * 2;
          const d = rnd() * 14;
          return <circle key={`${c}-${i}`} cx={cx + Math.cos(a) * d * 1.4} cy={cy + Math.sin(a) * d * 0.8} r={2} fill={ARCH_COLORS[c]} opacity={0.75} />;
        }),
      )}
    </svg>
  );
}

function GradientSig() {
  const slopes = [0.18, 0.32, 0.52, 0.78, 1.0];
  const colors = ["#6cb6ff", "#4fc99a", "#ffd166", "#ef8a62", "#f4675d"];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-sig" aria-hidden="true">
      <line x1={12} y1={H - 12} x2={W - 12} y2={H - 12} stroke="#2a3849" />
      {slopes.map((s, i) => (
        <path key={i} d={`M 12 ${H - 14} Q ${W * 0.55} ${H - 14 - s * 18} ${W - 14} ${H - 14 - s * (H - 26)}`}
          fill="none" stroke={colors[i]} strokeWidth={1.7} opacity={0.85} />
      ))}
    </svg>
  );
}

function DiagnosisGapSig() {
  const rnd = mulberry32(41);
  const pts = Array.from({ length: 40 }, () => {
    const t = rnd();
    const rich = rnd() > 0.5;
    return {
      x: 14 + t * (W - 30),
      y: H - 12 - t * 26 - (rich ? 14 + rnd() * 12 : rnd() * 8),
      rich,
    };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-sig" aria-hidden="true">
      <line x1={12} y1={H - 10} x2={W - 12} y2={H - 38} stroke="#8593a9" strokeWidth={1.2} strokeDasharray="4 3" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={p.rich ? "#6cb6ff" : "#f4675d"} opacity={0.75} />
      ))}
    </svg>
  );
}

function TobaccoBeltSig() {
  const rnd = mulberry32(57);
  const curve = (x: number) => H - 14 - 0.4 * x + 0.0008 * x * x;
  const pts = Array.from({ length: 36 }, () => {
    const x = 14 + rnd() * (W - 30);
    const above = rnd() > 0.62;
    return { x, y: curve(x - 14) + (above ? -(4 + rnd() * 12) : 2 + rnd() * 7), above };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-sig" aria-hidden="true">
      <path d={`M 14 ${curve(0)} Q ${W / 2} ${curve((W - 28) / 2) - 8} ${W - 14} ${curve(W - 28)}`} fill="none" stroke="#e9eef6" strokeWidth={1.4} opacity={0.75} />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={p.above ? "#f4675d" : "#67a9cf"} opacity={0.75} />
      ))}
    </svg>
  );
}

const SIGS: Record<string, () => React.ReactElement> = {
  "one-axis": OneAxisSig,
  connected: ConnectedSig,
  "four-americas": FourAmericasSig,
  gradient: GradientSig,
  "diagnosis-gap": DiagnosisGapSig,
  "tobacco-belt": TobaccoBeltSig,
};

export default function StorySig({ slug }: { slug: string }) {
  const Sig = SIGS[slug];
  return Sig ? <Sig /> : null;
}
