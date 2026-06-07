"""Extract the 15 baked health measures from the PMTiles into a tidy table.

The health OUTCOMES live in the PMTiles feature properties (layer
'zipcode_demographics'), not in the parquet. We decode every tile locally
(16,386 tiles, ~58 MB file) and keep each ZIP's value from the HIGHEST zoom
it appears at (most detailed). Output: data-prep/tile_health.parquet keyed by
zip (zero-padded 5-char string) — the prep stage joins this to parquet context.

Run (uses the venv):  .venv/Scripts/python.exe extract_pmtiles.py
"""
from __future__ import annotations

import gzip
import pathlib

import duckdb
import mapbox_vector_tile
import pandas as pd
from pmtiles.reader import MmapSource, all_tiles

HERE = pathlib.Path(__file__).resolve().parent
PMTILES_LOCAL = HERE / "Health_Zip_converted.pmtiles"
OUT_PARQUET = HERE / "tile_health.parquet"
LAYER = "zipcode_demographics"

# 15 baked health props -> clean metric_id (snake). Values are CDC PLACES-style
# crude prevalence percents (or mean days for MHLTH/PHLTH).
HEALTH_FIELDS = {
    "ARTHRITIS_zip": "arthritis",
    "BPHIGH_zip": "bphigh",
    "CANCER_zip": "cancer",
    "CASTHMA_zip": "casthma",
    "CHD_zip": "chd",
    "COPD_zip": "copd",
    "DEPRESSION_zip": "depression",
    "DIABETES_zip": "diabetes",
    "GHLTH_zip": "ghlth",
    "HIGHCHOL_zip": "highchol",
    "KIDNEY_zip": "kidney",
    "MHLTH_zip": "mhlth",
    "PHLTH_zip": "phlth",
    "STROKE_zip": "stroke",
    "TEETHLOST_zip": "teethlost",
}


def decode_tile(raw: bytes):
    try:
        return mapbox_vector_tile.decode(raw)
    except Exception:
        return mapbox_vector_tile.decode(gzip.decompress(raw))


def main() -> None:
    assert PMTILES_LOCAL.exists(), f"missing {PMTILES_LOCAL} (download first)"
    # zip -> (zoom_seen, {metric: value})
    best: dict[str, tuple[int, dict]] = {}
    tiles_seen = 0
    tiles_with_layer = 0

    with open(PMTILES_LOCAL, "rb") as f:
        src = MmapSource(f)
        for (z, x, y), data in all_tiles(src):
            tiles_seen += 1
            if not data:
                continue
            decoded = decode_tile(data)
            if not decoded or LAYER not in decoded:
                continue
            tiles_with_layer += 1
            for feat in decoded[LAYER]["features"]:
                props = feat.get("properties", {})
                zc = props.get("zip_code")
                if zc is None:
                    continue
                zc = str(zc).zfill(5)
                prev = best.get(zc)
                if prev is not None and prev[0] >= z:
                    continue  # keep higher-zoom value
                vals = {}
                for raw_key, mid in HEALTH_FIELDS.items():
                    v = props.get(raw_key)
                    if v is not None:
                        try:
                            vals[mid] = float(v)
                        except (TypeError, ValueError):
                            pass
                best[zc] = (z, vals)
            if tiles_seen % 2000 == 0:
                print(f"  ...{tiles_seen} tiles, {len(best)} zips so far")

    print(f"tiles_seen={tiles_seen} tiles_with_layer={tiles_with_layer} distinct_zips={len(best)}")

    # Build rows and write parquet via DuckDB (no pandas dtype surprises).
    rows = []
    for zc, (z, vals) in best.items():
        row = {"zip": zc, "src_zoom": z}
        for mid in HEALTH_FIELDS.values():
            row[mid] = vals.get(mid)
        rows.append(row)

    df = pd.DataFrame(rows)
    con = duckdb.connect()
    con.register("t", df)
    # quick coverage report per metric
    cols = ", ".join(f"count({m}) AS n_{m}" for m in HEALTH_FIELDS.values())
    cov = con.execute(f"SELECT count(*) AS n_zip, {cols} FROM t").fetchdf().to_dict("records")[0]
    print("coverage:", {k: int(v) for k, v in cov.items()})
    con.execute(f"COPY t TO '{OUT_PARQUET.as_posix()}' (FORMAT parquet)")
    print("wrote", OUT_PARQUET)


if __name__ == "__main__":
    main()
