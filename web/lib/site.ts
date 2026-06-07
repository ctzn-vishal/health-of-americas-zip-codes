// Shared site identity + navigation. Imported by metadata (server) and chrome (client).
// No "use client" and no browser APIs, so it is safe on both sides.

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://health-of-americas-zip-codes.vercel.app";

export const SITE = {
  name: "Health of America's ZIP Codes",
  short: "ZIP Health Atlas",
  tagline:
    "A map-first atlas of U.S. health outcomes for every ZIP/ZCTA — mapped against the national benchmark and neighborhood deprivation.",
  description:
    "An interactive, server-rendered atlas of chronic, behavioral, mental, and general-health measures across 31,491 U.S. ZIP/ZCTA areas. Search any ZIP, explore the map, and compare against the national average. Estimates are CDC PLACES-style and modeled; associations are ecological, not causal.",
} as const;

export const NAV: { href: string; label: string; cta?: boolean }[] = [
  { href: "/atlas", label: "Atlas" },
  { href: "/methods", label: "Methods" },
  { href: "/sources", label: "Sources" },
  { href: "/atlas", label: "Open the atlas", cta: true },
];
