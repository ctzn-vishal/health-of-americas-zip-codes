"use client";
import { useState } from "react";
import type { MetricMeta, Mode, Region } from "@/lib/types";
import type { AppState } from "@/lib/urlState";
import { DEFAULTS } from "@/lib/urlState";

interface Props {
  metrics: MetricMeta[];
  regions: Region[];
  state: AppState;
  onChange: (patch: Partial<AppState>) => void;
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "rate", label: "Rate", hint: "Estimated prevalence" },
  { id: "gap", label: "Gap vs U.S.", hint: "Difference from the national average" },
  { id: "percentile", label: "Percentile", hint: "National percentile rank" },
];

export default function Controls({ metrics, regions, state, onChange }: Props) {
  const [copied, setCopied] = useState(false);

  const topics = Array.from(new Set(metrics.map((m) => m.topic)));
  const national = regions.filter((r) => r.kind === "national");
  const census = regions.filter((r) => r.kind === "census_region");
  const states = regions.filter((r) => r.kind === "state");

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="controls" role="group" aria-label="Map controls">
      <div className="field">
        <label htmlFor="metric-select">Health measure</label>
        <select
          id="metric-select"
          value={state.metric}
          onChange={(e) => onChange({ metric: e.target.value })}
        >
          {topics.map((t) => (
            <optgroup key={t} label={t}>
              {metrics.filter((m) => m.topic === t).map((m) => (
                <option key={m.metric_id} value={m.metric_id}>{m.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="field">
        <label id="mode-label">View</label>
        <div className="segmented" role="group" aria-labelledby="mode-label">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={state.mode === m.id}
              title={m.hint}
              onClick={() => onChange({ mode: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="region-select">Zoom to</label>
        <select
          id="region-select"
          value={state.region}
          onChange={(e) => onChange({ region: e.target.value, selected: undefined })}
        >
          {national.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          {census.length > 0 && (
            <optgroup label="Census region">
              {census.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </optgroup>
          )}
          {states.length > 0 && (
            <optgroup label="State">
              {states.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      <button className="btn" type="button" onClick={copyLink} aria-live="polite">
        {copied ? "Link copied ✓" : "Copy link"}
      </button>
      <button
        className="btn"
        type="button"
        onClick={() => onChange({ ...DEFAULTS, selected: undefined })}
        title="Reset to the default view"
      >
        Reset
      </button>
    </div>
  );
}
