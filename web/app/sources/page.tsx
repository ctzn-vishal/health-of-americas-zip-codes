import type { Metadata } from "next";
import Link from "next/link";
import { getMetricCatalog } from "@/lib/serverData";

export const metadata: Metadata = {
  title: "Sources & provenance",
  description:
    "The exact files and per-measure provenance behind the atlas: CDC PLACES-style health outcomes from a public PMTiles archive, socioeconomic context from a Tigris-hosted Parquet file, joined on a 5-character ZIP key.",
  alternates: { canonical: "/sources" },
};

const nf = new Intl.NumberFormat("en-US");
const PARQUET_PUBLIC =
  "https://ontopic-public-data.t3.tigrisfiles.io/sample-data/health_zip.parquet";

export default async function SourcesPage() {
  const catalog = await getMetricCatalog();
  const pmtiles = catalog.sources?.pmtiles ?? "";

  return (
    <main id="main">
      <div className="prose-wrap">
        <header className="page-head">
          <span className="eyebrow">Sources</span>
          <h1>Sources &amp; provenance</h1>
          <p className="page-lede">
            Every number traces to a public file. Health outcomes come from a CDC PLACES-style PMTiles
            archive; socioeconomic context (including the Area Deprivation Index) comes from a
            Tigris-hosted Parquet file. The two are joined on a zero-padded 5-character ZIP key.
          </p>
        </header>

        <div className="prose-wrap" style={{ padding: 0 }}>
          <table className="data-table">
            <caption>Underlying files — read directly by the browser over HTTPS; never re-hosted.</caption>
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Role</th>
                <th scope="col">Location</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>PMTiles</td>
                <td>ZCTA geometry + baked health outcomes</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{pmtiles}</code>
                </td>
              </tr>
              <tr>
                <td>Parquet</td>
                <td>Socioeconomic context + 2 behavioral outcomes + centroids</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{PARQUET_PUBLIC}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <article className="prose">
          <h2>Origin</h2>
          <p>
            Health prevalence estimates follow the methodology of the CDC&apos;s{" "}
            <a href="https://www.cdc.gov/places/" target="_blank" rel="noopener noreferrer">
              PLACES
            </a>{" "}
            project (model-based small-area estimates at the ZCTA level). The geographic base is the
            Census{" "}
            <a
              href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              TIGER/Line
            </a>{" "}
            /{" "}
            <a
              href="https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              ZCTA
            </a>{" "}
            geography. The Area Deprivation Index and other context variables are carried in the
            Parquet file.
          </p>

          <div className="callout">
            <strong>Vintage.</strong> The source year is not stated in the files, so values are
            treated as a recent single cross-section. Do not read them as a specific calendar year or
            compare them as a time series.
          </div>
        </article>

        <div className="prose-wrap" style={{ padding: 0 }}>
          <table className="data-table">
            <caption>Per-measure provenance, generated from the live data manifest.</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Domain</th>
                <th scope="col">Source file</th>
                <th scope="col">Denominator</th>
                <th scope="col" className="num">U.S. avg</th>
                <th scope="col" className="num">Covered</th>
                <th scope="col">Year</th>
              </tr>
            </thead>
            <tbody>
              {catalog.metrics.map((m) => (
                <tr key={m.metric_id}>
                  <td>
                    {m.label} <span className="muted">· {m.topic}</span>
                  </td>
                  <td>{m.topic}</td>
                  <td>{m.source_from === "tiles" ? "PMTiles" : "Parquet"}</td>
                  <td>{m.denominator}</td>
                  <td className="num">
                    {m.benchmark}
                    {m.unit === "percent" ? "%" : ""}
                  </td>
                  <td className="num">{nf.format(m.n_zip)}</td>
                  <td>{m.source_year ?? "Not stated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <article className="prose">
          <h2>Join &amp; coverage</h2>
          <p>
            The two sources are joined on ZIP: a zero-padded 5-character string on both sides. The
            PMTiles layer uses the ZIP as its feature id, so the map can recolor by pushing values to
            geometry without rebuilding the source. Coverage is near-complete; areas present in only
            one source are shown as no-data where relevant.
          </p>
          <p>
            See <Link href="/methods">Methods &amp; limitations</Link> for how these numbers should and
            should not be read, or open the <Link href="/atlas">interactive atlas</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
