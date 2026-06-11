# Health of America's ZIP Codes

A polished, **server-rendered, map-first** atlas of U.S. ZIP/ZCTA health, social needs, ACS
demographics, and neighborhood deprivation.

- **32,409** ZIP/ZCTA rows · **32,263** current PMTiles geometries · **26** featured health and
  social-need measures
- A dark "civic health observatory" interface with two complementary views in the atlas:
  - **ZIP health snapshot** (by place): pick a ZIP for a composite health score plus strip-plot small
    multiples that place it against its **state** and the **nation** across all featured measures,
    with ACS/ADI context and per-ZIP source provenance. The map zooms to the ZIP's metro and shades
    areas by overall burden.
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

The deployable application is **`web/`**. The Python pipeline and large source artifacts are not
needed at app build or runtime. The map streams the public PMTiles geometry over HTTPS range
requests, and the precomputed JSON in `web/public/data/` is committed.

The current analytical source is `raw_data/zcta_atlas.parquet` plus
`raw_data/zcta_atlas.parquet.meta.json`. All geometry-bearing ZCTAs in that parquet already exist in
the current PMTiles, so **a new PMTiles file is not required** unless the geometry source changes.

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

## Regenerating data payloads

```bash
python data-prep/prep_v2.py
cd web && npm run gen:profiles
```

`prep_v2.py` reads the complete parquet and metadata, cleans ACS sentinels, derives burden-oriented
measures, writes catalog/map/chart/insight payloads, and emits a coverage report. `gen:profiles`
then builds profile shards, metric distributions, state summaries, and the composite burden layer.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · MapLibre GL JS · PMTiles · D3 · static export.

## Data & caveats

Health outcomes are **CDC PLACES model-based small-area estimates** (modeled, not direct counts).
Pennsylvania and Kentucky include documented tract-to-ZCTA backfill where native CDC ZCTA cells are
absent. ZIP-level associations are **ecological** — they describe places, not individuals, and do not
imply causation. **ZCTAs** approximate USPS ZIP Code service areas and are not official mailing
boundaries. See [`/methods`](web/app/methods/page.tsx), [`/sources`](web/app/sources/page.tsx), and
[`docs/data-contract.md`](docs/data-contract.md).
