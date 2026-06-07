# Health of America's ZIP Codes

A polished, **server-rendered, map-first** atlas of U.S. health outcomes for every ZIP/ZCTA area —
chronic, behavioral, mental, and general-health measures, each mapped against the national average
and the neighborhood deprivation gradient.

- **31,491** ZIP/ZCTA areas · **10** health measures (5 domains) · **~297M** people in mapped areas
- A dark "civic health observatory" interface: a luminous MapLibre + PMTiles choropleth that recolors
  via feature-state (no source rebuild), with four D3 analytical panels, an insight rail, a ZIP
  profile card, and URL-shareable state.
- Crawlable by design: the landing, methods, and sources pages render **real content and numbers**
  into static HTML — no "Loading…"-only shell.

## Repository layout

```
web/         Next.js (App Router) app — the deployable site
data-prep/   Python pipeline that produces web/public/data/* (run offline)
docs/        Data contract + audit notes
```

The deployable application is **`web/`**. The Python pipeline and large source artifacts
(PMTiles, Parquet) are not needed at build or runtime — the map streams the public PMTiles over
HTTPS range requests, and the precomputed JSON in `web/public/data/` is committed.

## Deploy on Vercel

1. Import this repository into Vercel.
2. **Set the project's _Root Directory_ to `web`.** (Settings → General → Root Directory.) Vercel
   then auto-detects Next.js and runs the static export build.
3. _(Optional)_ set an environment variable **`NEXT_PUBLIC_SITE_URL`** to your final URL
   (e.g. `https://your-domain.com`). It is used for canonical links, the sitemap, and Open Graph
   tags. If unset, a sensible default is used.
4. Deploy. No other environment variables are required at runtime.

The app is a static export (`output: "export"` → `web/out`), so it also runs on any static host.

## Local development

```bash
cd web
npm install
npm run dev        # http://localhost:3000
npm run build      # static export → web/out
```

## Routes

| Route       | Rendering | What it is                                                            |
| ----------- | --------- | -------------------------------------------------------------------- |
| `/`         | static    | Editorial landing page with live headline stats from the manifest    |
| `/atlas`    | static shell + client | The interactive choropleth, charts, insight rail, ZIP profile |
| `/methods`  | static    | Methodology, ZIP-vs-ZCTA, view modes, missingness, accessibility     |
| `/sources`  | static    | Underlying files and per-measure provenance                          |

`sitemap.xml`, `robots.txt`, and an Open Graph image are generated at build.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · MapLibre GL JS · PMTiles · D3 · static export.

## Data & caveats

Health outcomes are **CDC PLACES-style model-based small-area estimates** (modeled, not direct
counts). ZIP-level associations are **ecological** — they describe places, not individuals, and do
not imply causation. **ZCTAs** approximate USPS ZIP Code service areas and are not official mailing
boundaries. See [`/methods`](web/app/methods/page.tsx), [`/sources`](web/app/sources/page.tsx), and
[`docs/data-contract.md`](docs/data-contract.md).
