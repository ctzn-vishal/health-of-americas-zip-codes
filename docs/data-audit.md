# Data Audit — ZIP Health Atlas (Phase 0)

Machine-readable artifacts: `data-prep/recon_parquet.json`, `recon_pmtiles.json`, `recon_join.json`,
`qa_report.json`. This file is the human summary.

## Sources
| File | Rows / layer | Key | Notes |
|---|---|---|---|
| `sample-data/health_zip.parquet` | 31,634 rows, 34 cols | `location_id` (INTEGER ZIP) | context + obesity/smoking |
| `pmtiles/Health_Zip_converted.pmtiles` | layer `zipcode_demographics`, z0–10 | `zip_code` (5-char string) | 15 baked health measures |

## Key finding
The parquet's only health **outcomes** are `obesity_rate` and `smoking_rate`; the other 32 columns are
geography and **socioeconomic context**. The 15 chronic/mental/physical health outcomes live in the
**PMTiles feature properties** (`*_zip`). Resolution: extract the tile health measures
(`data-prep/extract_pmtiles.py` → `tile_health.parquet`, decoding all 16,386 tiles) and join to parquet
context on a zero-padded 5-char `zip`. Documented in [data-contract.md](data-contract.md).

## Join (verified, no duplicates)
parquet 31,634 · tiles 32,263 · **overlap 31,491 (99.55%)** · parquet-only 143 · tile-only 772.
`location_id` → `lpad(...,5,'0')` matches the tiles' already-zero-padded `zip_code`.

## Metrics chosen (10, spanning chronic / behavioral / mental / general / oral-access)
diabetes (default), bphigh, chd, copd, obesity_rate, smoking_rate, depression, mhlth, ghlth, teethlost.
All are percentages, all `lower_is_better`. Domains = `[p2, pop-weighted national mean (= benchmark), p98]`.
Diabetes: benchmark 10.6%, ADI top–bottom-decile gap **+7.7 pts**, strongest correlate median income (ρ=−0.69).

## Data-quality catches
- `teethlost` carries a **−1 missing sentinel** (161 ZIPs) → mapped to NULL in payloads.
- ADI ~0.96% null, median income ~6.6% null → surfaced; not imputed.
- 143 parquet ZIPs lack tile geometry; 772 tile ZIPs lack context → shown as no-data where relevant.

## Rendering decision
**Static export.** Largest `map_values` payload ≈ 0.39 MB (< 3 MB guard) → fully static; no on-demand fetch.

## Independent adversarial QA (Phase 2) — PASS 42/42
A separate agent recomputed every summary **from raw** with fresh SQL and diffed against the payloads
(`data-prep/qa.py`, `qa_report.json`):
- Join cardinality reproduced exactly (31,491 overlap, no dups).
- **Tile-extraction integrity:** decoded 40 random tiles, **0 value mismatches across 1,658 ZIPs** vs `tile_health.parquet`.
- Per-metric benchmark, p2/p98, value range, n_zip — all match (≤0.05 tolerance on rates).
- `map_values`: counts match, **zero negative values** (teethlost handled), spot-checks exact.
- charts: national average, high-burden population, ranked top, ADI disparity gap, top Spearman correlate — all reconcile.
- All percentages ∈ [0,100]; benchmark ∈ [min,max]; domains strictly increasing.
