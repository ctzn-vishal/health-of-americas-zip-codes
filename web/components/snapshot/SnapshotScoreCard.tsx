import { fmtPop } from "@/lib/format";
import { readScore } from "@/lib/snapshot";
import type { ProfileZip } from "@/lib/types";
import ScoreGauge from "./ScoreGauge";

function sourceLabel(source: string | undefined) {
  if (source === "native") return "Direct ZCTA estimates";
  if (source === "mixed") return "Direct + tract-aggregate estimates";
  if (source === "aggregated") return "Tract-aggregate estimates";
  return "Limited source coverage";
}

export default function SnapshotScoreCard({
  zip,
  profile,
  nMeasured,
  onClear,
}: {
  zip: string;
  profile: ProfileZip;
  nMeasured: number;
  onClear: () => void;
}) {
  const [city, state] = profile.c;
  const score = readScore(profile.comp);
  const quality = profile.q;
  const source = quality?.[0];
  const sourceMeasures = quality?.[1] ?? nMeasured;
  const backfilled = quality?.[2] ?? 0;
  const hasGeometry = quality?.[3] ?? true;
  const place = [city, state].filter(Boolean).join(", ");
  return (
    <div className="snap-card">
      <div className="snap-head">
        <div>
          <h2 className="snap-place">{place || `ZIP ${zip}`}</h2>
          <p className="snap-sub">ZIP {zip} · {fmtPop(profile.pop)} people</p>
        </div>
        <button type="button" className="snap-close" onClick={onClear} aria-label="Clear selection">×</button>
      </div>
      <div className="quality-strip" aria-label="Data coverage">
        <span>{sourceLabel(source)}</span>
        <span>{sourceMeasures} CDC measures available</span>
        {backfilled > 0 && <span>{backfilled} backfilled</span>}
        {!hasGeometry && <span>Not in map tiles</span>}
      </div>
      {score ? (
        <>
          <ScoreGauge score={score.score} />
          <div className="snap-band">{score.band}</div>
          <p className="snap-score-text">
            Healthier than <strong>{score.healthierThan}%</strong> of U.S. ZIP areas, averaged across{" "}
            {nMeasured} measures.
          </p>
          <p className="snap-caveat">
            Experimental composite — the mean of this ZIP&apos;s national percentiles across available
            measures, re-ranked. Not an official index; see the per-measure detail.
          </p>
        </>
      ) : (
        <p className="muted">No composite score available for this ZIP.</p>
      )}
    </div>
  );
}
