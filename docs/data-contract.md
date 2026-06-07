# Data Contract — ZIP Health Atlas

> Single source of truth between `data-prep/` and `web/`. Produced from the Phase 0
> data audit (`data-prep/recon_parquet.json`, `recon_pmtiles.json`, `recon_join.json`).
> Generated artifacts live in `web/public/data/`.

## Sources (public, range-request hosted — read directly, never re-hosted)
| Source | URL | Role |
|---|---|---|
| PMTiles | `https://ontopic-public-data.t3.tigrisfiles.io/pmtiles/Health_Zip_converted.pmtiles` | Geometry **+ 15 baked health outcomes** |
| Parquet | `https://ontopic-public-data.t3.tigrisfiles.io/sample-data/health_zip.parquet` | Socioeconomic **context** + 2 behavioral outcomes + identity/centroids |

S3 equivalents (used at build time with `.env` creds): `s3://ontopic-public-data/...`.
**Credentials never leave the build.** The browser only ever sees the public PMTiles URL and the generated JSON.

## KEY FINDING (deviation from the original assumption)
The brief assumed 6–10 health outcomes would be **parquet columns**. The audit shows otherwise:
- The parquet's only health *outcomes* are `obesity_rate` and `smoking_rate`; its other 32 columns are
  geography, identity, and **socioeconomic context** (ADI, income, poverty, education, race, age…).
- The **15 chronic / mental / physical health outcomes live in the PMTiles** feature properties
  (`*_zip`), layer `zipcode_demographics`.

Resolution (honest reading of the actual data): **health outcomes come from the PMTiles** (extracted to
`data-prep/tile_health.parquet` by decoding all 16,386 tiles), **disparity context comes from the parquet**,
joined on ZIP. This preserves the GOAL ("U.S. ZIP-code health") with maximal signal.

## Grain & join
- Analytical grain: **ZIP / ZCTA**, one row per ZIP (no time dimension — single cross-section).
- Join key: **`zip`** — zero-padded 5-char STRING on both sides.
  - Parquet: `lpad(CAST(location_id AS VARCHAR), 5, '0')` (stored as INTEGER, leading zeros stripped).
  - PMTiles: `zip_code` property is already a 5-char string (e.g. `"02568"`).
- PMTiles: layer **`zipcode_demographics`**, **promoteId = `zip_code`**, zoom **0–10**,
  bounds `[-176.70, 18.91, -66.93, 71.34]` (incl. AK/HI/territories).
- Join cardinality: parquet 31,634 · tiles 32,263 · **overlap 31,491 (99.55% of parquet)** ·
  parquet-only 143 · tile-only 772 · **no duplicate ZIPs on either side**.

## Regions (URL `region`; default `us`)
National atlas. `us` = contiguous-US default extent `[-125, 24, -66.5, 49.5]`; full extent includes AK/HI.
Also filterable by the 4 census `region` values and by `state_abbreviation` (50). Per-ZIP centroids come
from parquet `latitude`/`longitude`; region/state bounds are derived in prep → `geo_catalog`/`region_catalog`.

## Metrics → `metric_catalog.json` (10 featured, spanning chronic / behavioral / mental / physical / access)
Domains = `[p2, population-weighted national mean (= benchmark / diverging midpoint), p98]`. All are
percentages; **all `lower_is_better = true`**. Benchmark = population-weighted national mean.

Values below are the **actual emitted `metric_catalog.json`** (regenerate this table from it if prep changes).

| metric_id | label | source | unit | domain [min,mid,max] | benchmark | suppression |
|---|---|---|---|---|---|---|
| `diabetes`*default* | Diabetes | pmtiles | % | [5.7, 10.6, 19.0] | 10.61 | none (100% cov) |
| `bphigh` | High blood pressure | pmtiles | % | [21.0, 31.7, 48.9] | 31.73 | none |
| `chd` | Coronary heart disease | pmtiles | % | [3.1, 5.9, 11.3] | 5.87 | none |
| `copd` | COPD | pmtiles | % | [3.5, 6.9, 14.1] | 6.90 | none |
| `obesity_rate` | Obesity | parquet | % | [21.6, 32.2, 45.2] | 32.23 | none |
| `smoking_rate` | Smoking | parquet | % | [9.5, 17.6, 30.8] | 17.58 | none |
| `depression` | Depression | pmtiles | % | [14.9, 20.6, 29.4] | 20.58 | none |
| `mhlth` | Frequent poor mental health | pmtiles | % | [10.1, 15.0, 22.5] | 15.05 | none |
| `ghlth` | Fair or poor health | pmtiles | % | [10.4, 19.5, 35.1] | 19.48 | none |
| `teethlost` | All teeth lost (65+) | pmtiles | % | [6.1, 14.6, 31.9] | 14.57 | **value < 0 → missing (−1 sentinel, 161 ZIPs)** |

Only `teethlost` carries the −1 missing sentinel; every other metric is 100% covered across the 31,491 joined ZIPs.
Also present in source but **not surfaced in v1**: `arthritis, cancer, casthma, highchol, kidney, phlth, stroke`.

## Context variables → `context` (parquet; for scatter / disparity / correlation)
`area_deprivation_index` (headline disparity axis; mean 100, range 10–215, ~0.96% null),
`median_income` (6.6% null), `percent_poverty`, `percent_college_graduated`, `percent_unemployed`,
`percent_over_65` (age confounder), `population`, `population_density`. Default context = `area_deprivation_index`.

## Precomputed analytics to emit
- [x] `metric_catalog.json`, `geo_catalog.json` (centroids + bounds), `region_catalog.json`
- [x] `map_values/{metric}.json` — `{join_key, domain, benchmark, values:{zip:value}}` (feeds feature-state)
- [x] `charts/{metric}.json` — ranked, distribution (histogram bins), correlations (Spearman vs context),
      disparity gradient (population-weighted mean by ADI decile + 95% CI)
- [x] `insights/{metric}.json` — validated source-backed claim bank
- [x] Every payload stamped `source`, `source_year`, `generated_at`

## Rendering model → STATIC export
- **Choice: static export** (`output: 'export'`). Rationale: curated single cross-section, public data,
  payloads bake cleanly and small. **Guard:** largest `map_values` payload ≈ 31,491 entries ≈ **~0.45 MB**,
  far under the 3 MB threshold → stay fully static (no on-demand fetch needed).
- Where payloads land: `web/public/data/` (served as static assets); PMTiles streamed via MapLibre range
  requests directly from the public Tigris URL.
- Secret handling: **server/build-side only**; never imported into `web/`.

## Honesty caveats (surface in UI)
- Health outcomes are **CDC PLACES-style model-based small-area estimates** (modeled, not direct counts);
  treat as crude prevalence. Age-adjustment cannot be confirmed from the tiles — labeled as estimated prevalence.
- **Ecological**: ZIP-level associations are not individual-level; correlations are **Spearman, not causal**.
- `teethlost` carries a −1 missing sentinel (handled); ADI/income have minor missingness (reported in UI).
- 143 parquet ZIPs lack tile geometry/health; 772 tile ZIPs lack parquet context → shown as no-data where relevant.
