import Link from "next/link";
import { SITE } from "@/lib/site";

// Static, server-rendered footer — indexable links + the standing data caveat.
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div style={{ maxWidth: "34ch" }}>
          <h4>{SITE.name}</h4>
          <p className="foot-note">
            Area-level health estimates for U.S. ZIP/ZCTA areas. This is not individual medical
            guidance. ZCTAs approximate USPS ZIP Code service areas and are not official mailing
            boundaries.
          </p>
        </div>
        <div>
          <h4>Explore</h4>
          <div className="foot-links">
            <Link href="/atlas">Interactive atlas</Link>
            <Link href="/stories">Stories — what the data teaches</Link>
            <Link href="/methods">Methods &amp; limitations</Link>
            <Link href="/sources">Sources &amp; provenance</Link>
          </div>
        </div>
        <div>
          <h4>Data</h4>
          <div className="foot-links">
            <a href="https://www.cdc.gov/places/" target="_blank" rel="noopener noreferrer">
              CDC PLACES
            </a>
            <a
              href="https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Census ZCTAs
            </a>
            <span className="muted">Cross-sectional · estimates modeled</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
