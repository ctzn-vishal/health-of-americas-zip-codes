# Data Audit - ZIP Health Atlas v2

Human summary of the updated source check after `raw_data/zcta_atlas.parquet` and
`raw_data/zcta_atlas.parquet.meta.json` were added.

## Source status

| File | Rows | Notes |
|---|---:|---|
| `raw_data/zcta_atlas.parquet` | 32,409 | Complete analytical source with health, ACS, ADI, geometry flags, and provenance |
| `raw_data/zcta_atlas.parquet.meta.json` | - | Clean metadata and source limitations |
| `Health_Zip_converted.pmtiles` | 32,263 feature ids | Runtime geometry, layer `zipcode_demographics`, key `zip_code` |

## Key findings

- The fixed parquet has 32,409 unique ZCTA rows.
- 32,263 rows have geometry and all 32,263 already exist in the current PMTiles.
- 146 rows have no geometry in the source parquet; they cannot be added to PMTiles without a
  geometry source.
- Core health coverage is now effectively complete: 32,304 rows have health data and 105 rows have no
  usable health measures after cleanup.
- No new PMTiles file is required for the current v2 app.

## Health provenance

The source includes row-level provenance:

- `health_source`
- `health_n_measures`
- `health_n_backfilled`

Pennsylvania and Kentucky have documented CDC source-side ZCTA gaps. Native missing cells are
backfilled with population-weighted tract-to-ZCTA aggregates where tract PLACES data are available.
Remaining unfillable gaps are left null rather than imputed.

## Cleanup decisions

- ACS `-1` sentinels are treated as missing.
- `state_abbr` gaps are backfilled from `state_fips` where possible.
- `avg_commute_time` was excluded from v2 context because it looked suspicious in the updated data.
- Prevention measures are converted to burden framing (`no_dental_visit`, `no_checkup`) so all
  featured measures share `lower_is_better = true`.

## Emitted v2 artifacts

`data-prep/prep_v2.py` emits:

- `metric_catalog.json`
- `context_catalog.json`
- `coverage_report.json`
- `geo_catalog.json`
- `region_catalog.json`
- `map_values/*`
- `charts/*`
- `insights/*`

`web/scripts/build-profiles.mjs` then emits:

- `profiles/{zip2}.json`
- `metric_distributions.json`
- `state_summary.json`
- `map_values/composite.json`

## QA checks completed

- Parquet row count and unique ZCTA count verified.
- Geometry overlap with PMTiles verified.
- Health coverage and provenance counts verified.
- Generated v2 payloads verified for metric count, default metric, coverage report, and profile shard
  structure.

Follow-up QA should run after every source update:

```bash
python data-prep/prep_v2.py
cd web && npm run gen:profiles
npm run test
npm run build
```
