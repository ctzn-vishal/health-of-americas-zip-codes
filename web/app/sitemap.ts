import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { STORIES } from "@/lib/stories";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/atlas", "/stories", ...STORIES.map((s) => `/stories/${s.slug}`), "/methods", "/sources"];
  return routes.map((route) => ({
    url: `${SITE_URL}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
