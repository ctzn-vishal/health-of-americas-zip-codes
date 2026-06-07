import type { Metadata } from "next";
import Link from "next/link";
import { getMetricCatalog } from "@/lib/serverData";

export const metadata: Metadata = {
  title: "Methods & limitations",
  description:
    "How the ZIP-code health atlas is built: model-based CDC PLACES-style estimates, the ZIP-vs-ZCTA distinction, the national benchmark and view modes, the deprivation gradient, missingness, color and accessibility choices, and what the data is not.",
  alternates: { canonical: "/methods" },
};

const nf = new Intl.NumberFormat("en-US");

export default async function MethodsPage() {
  const catalog = await getMetricCatalog();
  const totalJoined = Math.max(...catalog.metrics.map((m) => m.n_zip + m.missing_count));

  return (
    <main id="main">
      <div className="prose-wrap">
        <header className="page-head">
          <span className="eyebrow">Methods</span>
          <h1>How this atlas is built</h1>
          <p className="page-lede">
            What the numbers are, where they come from, and how to read them honestly. Everything
            here is derived from a single cross-section of {nf.format(totalJoined)} joined ZIP/ZCTA
            areas — no time dimension, no imputation beyond what the source model already applies.
          </p>
        </header>

        <article className="prose">
          <h2>What the numbers are</h2>
          <p>
            Health outcomes are <strong>model-based small-area estimates</strong> in the style of the
            CDC&apos;s <a href="https://www.cdc.gov/places/" target="_blank" rel="noopener noreferrer">PLACES</a>{" "}
            project: estimated prevalence for an area, not a direct count of diagnosed people. Treat
            each value as <strong>estimated crude prevalence</strong> for the adult denominator shown
            (most are adults 18+; &ldquo;all teeth lost&rdquo; is adults 65+). Age-adjustment cannot be
            confirmed from the source tiles, so values are labeled as estimated prevalence rather than
            age-adjusted rates.
          </p>

          <div className="callout">
            <strong>This is area-level data, not individual medical guidance.</strong> A ZIP&apos;s
            estimate describes a place, not any person who lives there. Nothing here is a diagnosis,
            a risk score, or health advice.
          </div>

          <h2>ZIP codes vs. ZCTAs</h2>
          <p>
            The map&apos;s geography is the U.S. Census{" "}
            <a
              href="https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              ZIP Code Tabulation Area (ZCTA)
            </a>
            . ZCTAs are <strong>generalized areal representations</strong> of USPS ZIP Code service
            areas — they are <strong>not</strong> official USPS delivery boundaries, and a mailing ZIP
            does not always have a one-to-one ZCTA. The interface says &ldquo;ZIP/ZCTA&rdquo; for
            readability; if you need official mailing geography, use USPS sources instead.
          </p>

          <h2>The benchmark and the three view modes</h2>
          <p>
            Every measure is compared against a single national benchmark: the{" "}
            <strong>population-weighted national mean</strong>. The map offers three ways to read a
            value:
          </p>
          <ul>
            <li>
              <strong>Rate</strong> — the estimated prevalence itself, on a luminance-ordered
              sequential ramp.
            </li>
            <li>
              <strong>Gap vs. U.S.</strong> — the difference from the national mean, on a diverging
              ramp whose neutral midpoint <em>is</em> the benchmark (cooler = better than average,
              warmer = worse).
            </li>
            <li>
              <strong>Percentile</strong> — the national percentile rank among ZIP/ZCTA areas with an
              estimate. Percentile rank is within available data only.
            </li>
          </ul>
          <p>
            Switching mode swaps only the map&apos;s color expression; switching measure re-pushes
            values to the existing geometry. The same color scale drives the map, the legend, and the
            charts, so a color means the same thing everywhere.
          </p>

          <h2>The deprivation gradient</h2>
          <p>
            The headline analytical panel groups ZIP/ZCTA areas into deciles of the{" "}
            <strong>Area Deprivation Index (ADI)</strong> and plots the population-weighted average of
            the selected measure per decile, with a 95% confidence band. The &ldquo;most − least
            deprived&rdquo; figure is the gap between the top and bottom deciles. Companion panels show
            the distribution, the highest/lowest-burden ZIPs, and a scatter against ADI with a LOESS
            trend and Spearman correlations.
          </p>
          <div className="callout">
            <strong>Ecological, not causal.</strong> These are relationships between{" "}
            <em>places</em>, computed across areas. They do not describe individuals (the ecological
            fallacy) and a correlation — Spearman ρ here — is not evidence of cause.
          </div>

          <h2>Missing data</h2>
          <p>
            ZIP/ZCTA areas without an estimate for the selected measure are drawn in a neutral grey
            and excluded from percentile and ranking computations. Coverage is near-complete: of{" "}
            {nf.format(totalJoined)} joined areas, only &ldquo;all teeth lost (65+)&rdquo; carries a
            suppression sentinel (values below zero treated as missing). The table below is generated
            from the live data manifest.
          </p>
        </article>

        <div className="prose-wrap" style={{ padding: 0 }}>
          <table className="data-table">
            <caption>Per-measure coverage across {nf.format(totalJoined)} joined ZIP/ZCTA areas.</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">Domain</th>
                <th scope="col">Denominator</th>
                <th scope="col" className="num">Covered</th>
                <th scope="col" className="num">Missing</th>
                <th scope="col">Direction</th>
              </tr>
            </thead>
            <tbody>
              {catalog.metrics.map((m) => (
                <tr key={m.metric_id}>
                  <td>
                    {m.label} <span className="muted">· {m.topic}</span>
                  </td>
                  <td>{m.source_from === "tiles" ? "PMTiles" : "Parquet"}</td>
                  <td>{m.denominator}</td>
                  <td className="num">{nf.format(m.n_zip)}</td>
                  <td className="num">{m.missing_count > 0 ? nf.format(m.missing_count) : "—"}</td>
                  <td>{m.lower_is_better ? "Lower is better" : "Higher is better"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <article className="prose">
          <h2>Color &amp; accessibility</h2>
          <p>
            Ramps are chosen for a clear luminance progression (so they remain legible in grayscale)
            and for color-vision-deficiency resilience (warm vs. cool, never red/green alone).
            Selection is encoded by weight, halo, and a direct label — never by color alone. The map
            is not the only path to the data: every chart ships an accessible table fallback, values
            are visible without hover, controls are keyboard-operable with visible focus, and{" "}
            <code>prefers-reduced-motion</code> is honored.
          </p>

          <h2>What this is not</h2>
          <ul>
            <li>Not a direct count or a registry — estimates are modeled.</li>
            <li>Not individual-level — it describes areas, not people.</li>
            <li>Not causal — associations are ecological.</li>
            <li>Not official mailing geography — ZCTAs approximate ZIP service areas.</li>
          </ul>

          <p>
            For the underlying files and per-measure provenance, see{" "}
            <Link href="/sources">Sources &amp; provenance</Link>. To explore the data, open the{" "}
            <Link href="/atlas">interactive atlas</Link>.
          </p>
        </article>
      </div>
    </main>
  );
}
