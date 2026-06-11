import Link from "next/link";
import { fmtPop, ordinal, valueFmt } from "@/lib/format";
import { ARCHETYPES, readScore, standouts } from "@/lib/snapshot";
import { ARCH_COLORS } from "@/components/stories/storyShared";
import type { MetricMeta, ProfileZip } from "@/lib/types";
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
  metrics,
  nMeasured,
  onClear,
  onPickMetric,
}: {
  zip: string;
  profile: ProfileZip;
  metrics: MetricMeta[];
  nMeasured: number;
  onClear: () => void;
  onPickMetric: (metricId: string) => void;
}) {
  const [city, state] = profile.c;
  const score = readScore(profile.comp);
  const quality = profile.q;
  const source = quality?.[0];
  const sourceMeasures = quality?.[1] ?? nMeasured;
  const backfilled = quality?.[2] ?? 0;
  const hasGeometry = quality?.[3] ?? true;
  const place = [city, state].filter(Boolean).join(", ");
  const arch = profile.a ? ARCHETYPES[profile.a[0]] : null;
  const { strengths, concerns } = standouts(metrics, profile.m);

  // One plain-English sentence synthesizing score + archetype + standouts.
  let verdict: React.ReactNode = null;
  if (score) {
    const burdenPhrase =
      score.score >= 67
        ? `carries less combined health burden than ${score.healthierThan}% of U.S. ZIP areas`
        : score.score <= 33
          ? `carries more combined health burden than ${100 - score.healthierThan}% of U.S. ZIP areas`
          : "sits near the middle of U.S. ZIP areas for combined health burden";
    verdict = (
      <p className="snap-verdict">
        <strong>{city || `ZIP ${zip}`}</strong> {burdenPhrase}
        {arch ? <>, and profiles as a {arch.short.toLowerCase()} community</> : null}.
        {concerns[0] ? (
          <>
            {" "}
            {concerns[0].metric.short_label}
            {concerns[1] ? ` and ${concerns[1].metric.short_label.toLowerCase()}` : ""} stand out most
            {strengths[0] ? (
              <>; {strengths[0].metric.short_label.toLowerCase()} is a relative bright spot.</>
            ) : (
              "."
            )}
          </>
        ) : null}
      </p>
    );
  }

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
        </>
      ) : (
        <p className="muted">No composite score available for this ZIP.</p>
      )}

      {verdict}

      {arch && profile.a && (
        <p className="arch-chip-row">
          <Link
            className="arch-chip"
            href="/stories/four-americas/"
            title="One of four community archetypes from clustering all 26 measures — read the story"
          >
            <span className="arch-dot" style={{ background: ARCH_COLORS[profile.a[0]] }} aria-hidden="true" />
            {arch.label}
            <span className="arch-q">— community type ›</span>
          </Link>
        </p>
      )}

      {(strengths.length > 0 || concerns.length > 0) && (
        <div className="standouts" aria-label="What stands out for this ZIP">
          {concerns.length > 0 && (
            <div className="standout-group bad">
              <h4>Watch — highest national percentiles</h4>
              <div className="standout-list">
                {concerns.map((s) => (
                  <button
                    key={s.metric.metric_id}
                    type="button"
                    className="standout-item"
                    onClick={() => onPickMetric(s.metric.metric_id)}
                    title={`Map ${s.metric.label} nationally`}
                  >
                    <span className="so-name">{s.metric.short_label}</span>
                    <span className="so-read">
                      <strong>{valueFmt(s.metric.format, s.metric.unit)(s.value)}</strong> · {ordinal(s.pct)} pct
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {strengths.length > 0 && (
            <div className="standout-group good">
              <h4>Going well — lowest national percentiles</h4>
              <div className="standout-list">
                {strengths.map((s) => (
                  <button
                    key={s.metric.metric_id}
                    type="button"
                    className="standout-item"
                    onClick={() => onPickMetric(s.metric.metric_id)}
                    title={`Map ${s.metric.label} nationally`}
                  >
                    <span className="so-name">{s.metric.short_label}</span>
                    <span className="so-read">
                      <strong>{valueFmt(s.metric.format, s.metric.unit)(s.value)}</strong> · {ordinal(s.pct)} pct
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {score && (
        <p className="snap-caveat">
          Experimental composite — the mean of this ZIP&apos;s national percentiles across available
          measures, re-ranked. Not an official index; see the per-measure detail below. Click a
          standout to map it nationally.
        </p>
      )}
    </div>
  );
}
