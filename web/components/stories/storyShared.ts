// Shared constants for the stories' D3 figures. Archetype colors are categorical,
// dark-bg luminous, and ordered to match the burden-ordered clusters in
// analytics/archetypes.json (0 = lowest overall burden).
export const ARCH_COLORS = ["#6cb6ff", "#c9a2ff", "#ffd166", "#f4675d"];

// Diverging correlation ramp (negative = cool, positive = warm) — matches the
// convention of the gap ramp in lib/colors.ts, reversed so +1 reads as "moves together".
export const CORR_RAMP = ["#2166ac", "#67a9cf", "#10141d", "#ef8a62", "#b2182b"];
export const CORR_DOMAIN = [-1, -0.5, 0, 0.5, 1];

export const TOPIC_COLORS: Record<string, string> = {
  "Health outcomes": "#6cb6ff",
  "Mental & functional health": "#c9a2ff",
  "Health behaviors": "#4fc99a",
  "Access & prevention": "#ffd166",
  "Health-related needs": "#f4675d",
};
