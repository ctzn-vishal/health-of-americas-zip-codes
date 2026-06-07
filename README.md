# Health of America's ZIP Codes

A polished, **server-rendered, map-first** atlas of U.S. health outcomes for every ZIP/ZCTA area —
chronic, behavioral, mental, and general-health measures, each mapped against the national average
and the neighborhood deprivation gradient.

- **31,491** ZIP/ZCTA areas · **10** health measures (5 domains) · **~297M** people in mapped areas
- A dark "civic health observatory" interface with two complementary views in the atlas:
  - **ZIP health snapshot** (by place): pick a ZIP for a composite health score plus strip-plot small
    multiples that place it against its **state** and the **nation** across all 10 measures. The map
    zooms to the ZIP's metro and shades areas by overall burden.
  - **Explore by measure** (one outcome at a time): a luminous MapLibre + PMTiles choropleth that
    recolors via feature-state, with four D3 analytical panels and an insight rail.
- Selecting a ZIP **zooms the map to its metro**; state is URL-shareable.
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

This repo ships a root [`vercel.json`](vercel.json) that builds the `web/` subdirectory and serves
its static export — so **importing the repo and deploying works with no dashboard configuration**.

1. Import this repository into Vercel and deploy. (Leave the Root Directory as the repo root.)
2. _(Optional)_ set an environment variable **`NEXT_PUBLIC_SITE_URL`** to your final URL
   (e.g. `https://your-domain.com`). It is used for canonical links, the sitemap, and Open Graph
   tags. If unset, a sensible default is used.

No other environment variables are required at runtime.

> **Alternative:** instead of the root `vercel.json`, you can set the project's **Root Directory to
> `web`** (Settings → General); Vercel then auto-detects Next.js. Use one approach or the other —
> if Root Directory is `web`, the root `vercel.json` is ignored.

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
| `/atlas`    | static shell + client | Interactive atlas — `?view=snapshot` (by place) or `?view=measure` (by outcome) |
| `/methods`  | static    | Methodology, ZIP-vs-ZCTA, view modes, missingness, accessibility     |
| `/sources`  | static    | Underlying files and per-measure provenance                          |

`sitemap.xml`, `robots.txt`, and an Open Graph image are generated at build.

## Precomputed snapshot data

The "by place" snapshot is powered by compact artifacts derived **from the already-committed
`public/data` payloads** (no Python/Tigris needed):

```bash
cd web && npm run gen:profiles   # → metric_distributions.json, state_summary.json,
                                 #   profiles/{zip2}.json, map_values/composite.json
```

Re-run this after regenerating the base payloads with the Python pipeline. The outputs are committed
and served as static assets, so each ZIP snapshot loads only a small shard at runtime.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · MapLibre GL JS · PMTiles · D3 · static export.

## Data & caveats

Health outcomes are **CDC PLACES-style model-based small-area estimates** (modeled, not direct
counts). ZIP-level associations are **ecological** — they describe places, not individuals, and do
not imply causation. **ZCTAs** approximate USPS ZIP Code service areas and are not official mailing
boundaries. See [`/methods`](web/app/methods/page.tsx), [`/sources`](web/app/sources/page.tsx), and
[`docs/data-contract.md`](docs/data-contract.md).
