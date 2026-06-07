"use client";
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Mode } from "./types";

// URL holds only what defines "what you're looking at" — linkable, back-button-able.
// Transient hover stays out of the URL.
export type View = "measure" | "snapshot";

export interface AppState {
  view: View; // "measure" = by-measure atlas, "snapshot" = by-place health snapshot
  metric: string;
  mode: Mode;
  region: string; // "us" | census region | state abbr
  selected?: string; // selected ZIP
}

export const DEFAULTS: AppState = {
  view: "measure",
  metric: "diabetes",
  mode: "gap",
  region: "us",
};

const MODES: Mode[] = ["rate", "gap", "percentile"];
const VIEWS: View[] = ["measure", "snapshot"];

export function decode(sp: URLSearchParams): AppState {
  const mode = sp.get("mode");
  const view = sp.get("view");
  return {
    view: VIEWS.includes(view as View) ? (view as View) : DEFAULTS.view,
    metric: sp.get("metric") || DEFAULTS.metric,
    mode: (MODES.includes(mode as Mode) ? (mode as Mode) : DEFAULTS.mode),
    region: sp.get("region") || DEFAULTS.region,
    selected: sp.get("selected") || undefined,
  };
}

export function encode(s: AppState): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === "" || (DEFAULTS as unknown as Record<string, unknown>)[k] === v) continue;
    p.set(k, String(v));
  }
  return p.toString();
}

export function useUrlState(): [AppState, (patch: Partial<AppState>) => void] {
  const router = useRouter();
  const sp = useSearchParams();
  const state = decode(new URLSearchParams(sp.toString()));
  const set = useCallback(
    (patch: Partial<AppState>) => {
      const next = { ...decode(new URLSearchParams(window.location.search)), ...patch };
      const qs = encode(next);
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router],
  );
  return [state, set];
}
