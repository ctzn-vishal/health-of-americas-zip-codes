import type { Metadata } from "next";
import Link from "next/link";
import { getCoverageReport, getMetricCatalog } from "@/lib/serverData";

export const metadata: Metadata = {
  title: "Sources & provenance",
  description:
    "The exact files and per-measure provenance behind the atlas: CDC PLACES 2025 ZCTA estimates, ACS demographics, ADI context, tract-to-ZCTA backfill, and public PMTiles geometry.",
  alternates: { canonical: "/sources" },
};

const nf = new Intl.NumberFormat("en-US");

export default async function SourcesPage() {
  const [catalog, coverage] = await Promise.all([getMetricCatalog(), getCoverageReport()]);
  const pmtiles = catalog.sources?.pmtiles ?? "";
  const parquet = catalog.sources?.parquet ?? "raw_data/zcta_atlas.parquet";
  const metadata = catalog.sources?.metadata ?? "raw_data/zcta_atlas.parquet.meta.json";
  const rows = coverage.rows;

  return (
    <main id="main">
      <div className="prose-wrap">
        <header className="page-head">
          <span className="eyebrow">Sources</span>
          <h1>Sources &amp; provenance</h1>
          <p className="page-lede">
            Every number traces to an audited source file. Health outcomes come from CDC PLACES 2025
            ZCTA estimates, ACS demographics, and ADI 2023 context in the complete parquet; the public
            PMTiles archive supplies the runtime ZCTA geometry used by the map.
          </p>
        </header>

        <div className="prose-wrap" style={{ padding: 0 }}>
          <table className="data-table">
            <caption>Underlying files and their role in the app.</caption>
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
                <td>Runtime ZCTA geometry streamed by MapLibre</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{pmtiles}</code>
                </td>
              </tr>
              <tr>
                <td>Parquet</td>
                <td>Build-time analytical source: health, ACS demographics, ADI, centroids, provenance</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{parquet}</code>
                </td>
              </tr>
              <tr>
                <td>Metadata</td>
                <td>Clean source metadata and limitations used by the prep pipeline</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{metadata}</code>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <article className="prose">
          <h2>Origin</h2>
          <p>
            Health prevalence estimates come from the CDC&apos;s{" "}
            <a href="https://www.cdc.gov/places/" target="_blank" rel="noopener noreferrer">
              PLACES
            </a>{" "}
            project (model-based small-area estimates at the ZCTA level). ACS demographic variables
            are carried from the upstream ZIP atlas file, and ADI is from Neighborhood Atlas v4.0.1
            area-aggregated to ZCTA. The geographic base is the Census{" "}
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
            geography, served through the existing PMTiles archive.
          </p>

          <div className="callout">
            <strong>Vintage.</strong> Health measures use CDC PLACES 2025. ADI uses Neighborhood Atlas
            2023 v4.0.1. The app is a single cross-section; do not read it as a time series.
          </div>
          {rows && (
            <p>
              Coverage summary: {nf.format(rows.n_rows ?? 0)} ZIP/ZCTA rows,{" "}
              {nf.format(rows.n_with_geometry ?? 0)} with current PMTiles geometry,{" "}
              {nf.format(rows.n_without_geometry ?? 0)} without geometry, and{" "}
              {nf.format(rows.n_no_health ?? 0)} without usable health measures after cleanup.
            </p>
          )}
        </article>

        <div className="prose-wrap" style={{ padding: 0 }}>
          <table className="data-table">
            <caption>Per-measure provenance, generated from the live data manifest.</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Domain</th>
                <th scope="col">Denominator</th>
                <th scope="col" className="num">U.S. avg</th>
                <th scope="col" className="num">Covered</th>
                <th scope="col" className="num">Native</th>
                <th scope="col" className="num">Mixed/aggregate</th>
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
                  <td>{m.denominator}</td>
                  <td className="num">
                    {m.benchmark}
                    {m.unit === "percent" ? "%" : ""}
                  </td>
                  <td className="num">{nf.format(m.n_zip)}</td>
                  <td className="num">{m.native_rows != null ? nf.format(m.native_rows) : "—"}</td>
                  <td className="num">
                    {m.mixed_rows != null || m.aggregated_rows != null
                      ? nf.format((m.mixed_rows ?? 0) + (m.aggregated_rows ?? 0))
                      : "—"}
                  </td>
                  <td>{m.source_year ?? "Not stated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <article className="prose">
          <h2>Join &amp; coverage</h2>
          <p>
            The analytical source and the PMTiles geometry are matched on a zero-padded 5-character
            ZIP/ZCTA key. The PMTiles layer uses that key as its feature id, so the map can recolor by
            pushing static JSON values to geometry without rebuilding the source. Because all
            geometry-bearing rows in the updated parquet already exist in the PMTiles, this release
            does not require a new PMTiles file.
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
