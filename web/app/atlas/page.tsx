import type { Metadata } from "next";
import { Suspense } from "react";
import AppClient from "@/components/AppClient";

export const metadata: Metadata = {
  title: "Interactive atlas — map every U.S. health measure by ZIP/ZCTA",
  description:
    "Explore a national choropleth of U.S. health outcomes by ZIP/ZCTA. Switch measures and view modes (rate, gap vs U.S., percentile), pin any ZIP, and read its profile, distribution, ranks, and deprivation gradient.",
  alternates: { canonical: "/atlas" },
};

// Server shell. The interactive map/charts mount on the client; useSearchParams (URL state)
// requires a Suspense boundary in the static export.
export default function AtlasPage() {
  return (
    <Suspense
      fallback={
        <main id="main" className="app">
          <p className="muted" style={{ padding: 40 }}>
            Loading the atlas…
          </p>
        </main>
      }
    >
      <AppClient />
    </Suspense>
  );
}
