import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="prose-wrap">
      <header className="page-head" style={{ borderBottom: "none" }}>
        <span className="eyebrow">404</span>
        <h1>That page isn&apos;t on the map</h1>
        <p className="page-lede">
          The page you&apos;re looking for doesn&apos;t exist. Head back home, open the atlas, or search a
          ZIP code.
        </p>
      </header>
      <div className="hero-actions">
        <Link href="/" className="btn-lg btn-primary">
          Back home
        </Link>
        <Link href="/atlas" className="btn-ghost">
          Open the atlas
        </Link>
      </div>
    </main>
  );
}
