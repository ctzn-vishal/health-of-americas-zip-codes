"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, SITE } from "@/lib/site";

// Global navigation. A client component only so the active link can carry aria-current;
// its markup still prerenders into the static HTML, so crawlers see real, linked nav.
export default function SiteHeader() {
  const pathname = usePathname() || "/";
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="brand" aria-label={`${SITE.name} — home`}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Health of America&apos;s <span className="dim">ZIP Codes</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          {NAV.map((item, i) => {
            const active = !item.cta && pathname.startsWith(item.href);
            return (
              <Link
                key={`${item.href}-${i}`}
                href={item.href}
                className={item.cta ? "nav-cta" : undefined}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
