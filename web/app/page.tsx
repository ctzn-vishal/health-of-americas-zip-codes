import type { Metadata } from "next";
import Link from "next/link";
import ZipSearch from "@/components/search/ZipSearch";
import { getLandingStats, getMetricCatalog } from "@/lib/serverData";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Health of America's ZIP Codes — a map-first atlas of U.S. health outcomes",
  description: SITE.description,
  alternates: { canonical: "/" },
};

const nf = new Intl.NumberFormat("en-US");
const millions = (n: number) => `${(n / 1e6).toFixed(1)}M`;

export default async function LandingPage() {
  const [stats, catalog] = await Promise.all([getLandingStats(), getMetricCatalog()]);

  return (
    <main id="main" className="landing">
      {/* ---------------- hero ---------------- */}
      <section className="hero" aria-labelledby="hero-title">
        <span className="hero-eyebrow">U.S. public-health observatory</span>
        <h1 id="hero-title">
          The health of America&apos;s <span className="accent">ZIP codes</span>
        </h1>
        <p className="lede">
          A map-first atlas of {stats.nMetrics} health and social-need measures across{" "}
          <strong style={{ color: "var(--ink)" }}>{nf.format(stats.nZip)}</strong> ZIP/ZCTA areas —
          chronic disease, behavioral risk, mental health, access, and health-related social needs,
          each set against the national average, ACS context, and the neighborhood deprivation gradient.
        </p>

        <div className="hero-actions">
          <Link href="/atlas" className="btn-lg btn-primary">
            Explore the map →
          </Link>
          <Link href="/methods" className="btn-ghost">
            How it&apos;s built
          </Link>
        </div>

        <ZipSearch autoFocus />

        <p className="hero-note">
          Estimates are CDC PLACES-style and model-based; associations are ecological, not causal.
        </p>

        {/* headline stats from the real manifest */}
        <div className="stat-strip" role="list" aria-label="Dataset at a glance">
          <div className="stat" role="listitem">
            <div className="num">{nf.format(stats.nZip)}</div>
            <div className="lbl">{nf.format(stats.nMappableZip)} mappable areas in the current PMTiles</div>
          </div>
          <div className="stat" role="listitem">
            <div className="num">{stats.nMetrics}</div>
            <div className="lbl">health and social-need measures</div>
          </div>
          <div className="stat" role="listitem">
            <div className="num">{stats.nStates}</div>
            <div className="lbl">states plus DC covered</div>
          </div>
          <div className="stat" role="listitem">
            <div className="num">
              {millions(stats.totalPopulation)}
            </div>
            <div className="lbl">people in mapped areas</div>
          </div>
        </div>
      </section>

      {/* ---------------- a concrete finding ---------------- */}
      <section className="section" aria-labelledby="finding-title">
        <div className="section-head">
          <span className="section-eyebrow">Why it matters</span>
          <h2 id="finding-title">Place shapes health — and the gaps are large.</h2>
          <p className="section-lede">
            About{" "}
            <strong style={{ color: "var(--ink)" }}>
              {millions(stats.highBurdenPopulation)}
            </strong>{" "}
            people live in ZIP codes where {stats.defaultMetricLabel.toLowerCase()} exceeds the
            high-burden threshold of {stats.highBurdenThreshold}%.{" "}
            {stats.adiGapPts != null && (
              <>
                The most-deprived tenth of neighborhoods averages{" "}
                <strong style={{ color: "var(--ink)" }}>{stats.adiGapPts} points</strong> higher
                than the least-deprived tenth.
              </>
            )}{" "}
            The atlas lets you see that gradient for every measure, and find where it is widest.
          </p>
        </div>
      </section>

      {/* ---------------- what you can do ---------------- */}
      <section className="section" aria-labelledby="explore-title">
        <div className="section-head">
          <span className="section-eyebrow">Three ways in</span>
          <h2 id="explore-title">Search, map, and compare.</h2>
        </div>
        <div className="feature-grid">
          <Link href="/atlas?view=snapshot" className="feature">
            <span className="f-icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <h3>Find your ZIP</h3>
            <p>
              Type any 5-digit ZIP for its health snapshot — a composite score plus every measure
              placed against local demographics, your state, and the nation.
            </p>
            <span className="f-go">Open a snapshot →</span>
          </Link>
          <Link href="/atlas" className="feature">
            <span className="f-icon" aria-hidden="true">
              <MapIcon />
            </span>
            <h3>Explore the map</h3>
            <p>
              A national choropleth recolors instantly as you switch measures and view modes — rate,
              gap-vs-U.S., or percentile — with a live legend and distribution.
            </p>
            <span className="f-go">Open the atlas →</span>
          </Link>
          <Link href="/methods" className="feature">
            <span className="f-icon" aria-hidden="true">
              <BookIcon />
            </span>
            <h3>Read the method</h3>
            <p>
              Transparent about modeled estimates, tract-to-ZCTA backfill, the ZIP-vs-ZCTA distinction,
              missingness, and the limits of ecological data.
            </p>
            <span className="f-go">Methods &amp; limits →</span>
          </Link>
        </div>
      </section>

      {/* ---------------- measures ---------------- */}
      <section className="section" aria-labelledby="measures-title">
        <div className="section-head">
          <span className="section-eyebrow">The measures</span>
          <h2 id="measures-title">{stats.nMetrics} measures, from cardiometabolic risk to social needs.</h2>
          <p className="section-lede">
            Every measure carries its label, unit, source, national benchmark, missingness, and
            direction. Jump straight to any of them on the map.
          </p>
        </div>
        <div className="measure-chips">
          {catalog.metrics.map((m) => (
            <Link key={m.metric_id} href={`/atlas?metric=${m.metric_id}`} className="chip-link">
              {m.label} <span className="topic">· {m.topic}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ---------------- the careful-reading caveat ---------------- */}
      <section className="section" aria-labelledby="read-title">
        <div className="section-head">
          <span className="section-eyebrow">Read responsibly</span>
          <h2 id="read-title">Area-level data, read with care.</h2>
        </div>
        <div className="callout">
          <p style={{ margin: "0 0 8px" }}>
            <strong>ZIP vs. ZCTA.</strong> Census ZCTAs are generalized areal representations of USPS
            ZIP Code service areas — not official delivery boundaries. The app says &ldquo;ZIP/ZCTA&rdquo;
            for readability.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Modeled &amp; ecological.</strong> Outcomes are CDC PLACES-style model-based
            estimates, not direct counts. ZIP-level associations describe places, not individuals, and
            do not imply causation. See the{" "}
            <Link href="/methods">methods</Link> and <Link href="/sources">sources</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

/* --- small inline icons (no icon dependency in the landing bundle) --- */
function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}
function BookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z" />
      <path d="M8 7h7M8 11h7" />
    </svg>
  );
}
