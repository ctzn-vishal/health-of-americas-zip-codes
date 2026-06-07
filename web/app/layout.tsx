import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteHeader from "@/components/chrome/SiteHeader";
import SiteFooter from "@/components/chrome/SiteFooter";
import { SITE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE.name} — U.S. health outcomes by ZIP/ZCTA`,
    template: `%s · ${SITE.short}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [
    "ZIP code health",
    "ZCTA",
    "public health",
    "CDC PLACES",
    "health atlas",
    "choropleth map",
    "area deprivation index",
    "chronic disease prevalence",
    "United States",
  ],
  category: "health",
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name} — U.S. health outcomes by ZIP/ZCTA`,
    description: SITE.description,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name}`,
    description: SITE.tagline,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080b12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
