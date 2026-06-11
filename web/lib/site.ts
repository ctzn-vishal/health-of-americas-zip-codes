// Shared site identity + navigation. Imported by metadata (server) and chrome (client).
// No "use client" and no browser APIs, so it is safe on both sides.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://health-of-americas-zip-codes.vercel.app";

export const SITE = {
  name: "Health of America's ZIP Codes",
  short: "ZIP Health Atlas",
  tagline:
    "A map-first atlas of ZIP/ZCTA health, social needs, demographics, and neighborhood deprivation.",
  description:
    "An interactive atlas of 26 burden-oriented health and social-need measures across 32,409 U.S. ZIP/ZCTA areas, with ACS demographics, ADI context, state comparisons, and modeled CDC PLACES-style estimates.",
} as const;

export const NAV: { href: string; label: string; cta?: boolean }[] = [
  { href: "/atlas", label: "Atlas" },
  { href: "/methods", label: "Methods" },
  { href: "/sources", label: "Sources" },
  { href: "/atlas", label: "Open the atlas", cta: true },
];
