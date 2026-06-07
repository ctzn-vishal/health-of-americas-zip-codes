import { fmtPop } from "@/lib/format";
import { readScore } from "@/lib/snapshot";
import type { ProfileZip } from "@/lib/types";
import ScoreGauge from "./ScoreGauge";

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
  return (
    <div className="snap-card">
      <div className="snap-head">
        <div>
          <h2 className="snap-place">{city}, {state}</h2>
          <p className="snap-sub">ZIP {zip} · {fmtPop(profile.pop)} people</p>
        </div>
        <button type="button" className="snap-close" onClick={onClear} aria-label="Clear selection">×</button>
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
            Experimental composite — the mean of this ZIP&apos;s national percentiles, re-ranked. Not
            an official index; see the per-measure detail.
          </p>
        </>
      ) : (
        <p className="muted">No composite score available for this ZIP.</p>
      )}
    </div>
  );
}
