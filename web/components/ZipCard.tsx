"use client";
import type { MetricMeta } from "@/lib/types";
import { valueFmt, gapFmt, fmtPop, ordinal } from "@/lib/format";

interface Props {
  zip: string;
  place: string; // "City, ST"
  region?: string;
  population?: number;
  county?: string | null;
  adi?: number | null;
  income?: number | null;
  source?: string;
  backfilled?: number;
  meta: MetricMeta;
  value?: number; // current metric value for this ZIP
  percentile?: number; // national percentile 0..100
  onClear: () => void;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function sourceText(source: string | undefined, backfilled: number | undefined) {
  if (backfilled && backfilled > 0) return `${backfilled} backfilled CDC estimates`;
  if (source === "native") return "Direct CDC ZCTA estimates";
  if (source === "aggregated") return "Tract-aggregate CDC estimates";
  return null;
}

export default function ZipCard({
  zip,
  place,
  region,
  population,
  county,
  adi,
  income,
  source,
  backfilled,
  meta,
  value,
  percentile,
  onClear,
}: Props) {
  const fmt = valueFmt(meta.format, meta.unit);
  const gfmt = gapFmt(meta.format);
  const gap = value != null ? value - meta.benchmark : undefined;
  const worse = gap != null && (meta.lower_is_better ? gap > 0 : gap < 0);
  const provenance = sourceText(source, backfilled);

  return (
    <div className="zipcard" aria-live="polite">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div className="zip-name">{place || `ZIP ${zip}`}</div>
          <div className="zip-sub">
            ZIP {zip}{region ? ` · ${region}` : ""}{population != null ? ` · ${fmtPop(population)} people` : ""}
          </div>
        </div>
        <button className="btn" type="button" onClick={onClear} aria-label="Clear selection">✕</button>
      </div>
      <div className="zip-meta-strip" aria-label="ZIP context">
        {county && <span>{county}</span>}
        {adi != null && <span>ADI {one.format(adi)}</span>}
        {income != null && <span>{money.format(income)} median income</span>}
        {provenance && <span>{provenance}</span>}
      </div>
      {value == null ? (
        <div className="muted" style={{ fontSize: 13 }}>No estimate available for {meta.label} in this ZIP.</div>
      ) : (
        <div className="zip-grid">
          <span className="lbl">{meta.label}</span>
          <span className="val">{fmt(value)}</span>
          <span className="lbl">vs U.S. average ({fmt(meta.benchmark)})</span>
          <span className="val" style={{ color: worse ? "var(--accent)" : "var(--good)" }}>
            {gfmt(gap)}
          </span>
          {percentile != null && (
            <>
              <span className="lbl">National percentile</span>
              <span className="val">{ordinal(Math.round(percentile))}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
