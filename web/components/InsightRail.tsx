"use client";
import type { Insight } from "@/lib/types";

interface Props {
  insights: Insight[];
  onSelect?: (zip: string | null) => void;
  metricLabel: string;
}

const TYPE_LABEL: Record<string, string> = {
  benchmark: "National average",
  adi_gradient: "Disparity",
  correlation: "Tracks with",
  extreme: "Highest burden",
  affected: "People affected",
};

export default function InsightRail({ insights, onSelect, metricLabel }: Props) {
  return (
    <section className="rail" aria-label={`Key findings for ${metricLabel}`}>
      <div className="rail-head">
        <h2>What the data says</h2>
      </div>
      {insights
        .slice()
        .sort((a, b) => a.rank - b.rank)
        .map((ins) => {
          const clickable = !!ins.supporting_geo_id;
          const Cmp: any = clickable ? "button" : "div";
          return (
            <Cmp
              key={ins.insight_id}
              className={`insight sev-${ins.severity}`}
              {...(clickable
                ? {
                    type: "button",
                    onClick: () => onSelect?.(ins.supporting_geo_id),
                    title: "Select this ZIP on the map",
                  }
                : {})}
            >
              <div className="chip">{TYPE_LABEL[ins.type] ?? ins.type}</div>
              <div className="claim">{ins.claim}</div>
              <div className="method">{ins.method_note}</div>
            </Cmp>
          );
        })}
    </section>
  );
}
