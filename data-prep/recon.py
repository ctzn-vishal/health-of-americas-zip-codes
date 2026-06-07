"""Phase 0 recon — profile the parquet and the PMTiles, write a machine-readable audit.

Outputs:
  data-prep/recon_parquet.json   schema, row count, join-key candidates, years,
                                 metric candidates, SE/CI/suppression cols, null rates
  data-prep/recon_pmtiles.json   vector layer name(s), fields, join field, zoom, bounds
  data-prep/recon_join.json      sample overlap check between parquet key and PMTiles ids
"""
from __future__ import annotations

import json
import pathlib
import urllib.request

from env_tigris import connect, PMTILES_URL

HERE = pathlib.Path(__file__).resolve().parent


def jdump(name: str, obj) -> None:
    (HERE / name).write_text(json.dumps(obj, indent=2, default=str))
    print("wrote", name)


def profile_parquet() -> dict:
    con, parquet = connect()
    src = f"read_parquet('{parquet}')"

    schema = con.execute(f"DESCRIBE SELECT * FROM {src}").fetchall()
    cols = [{"name": r[0], "type": r[1]} for r in schema]
    n = con.execute(f"SELECT count(*) FROM {src}").fetchone()[0]

    # null rate + distinct count per column
    profile = []
    for c in cols:
        name, typ = c["name"], c["type"]
        q = (
            f'SELECT count(*) FILTER (WHERE "{name}" IS NULL), '
            f'count(DISTINCT "{name}") FROM {src}'
        )
        nulls, distinct = con.execute(q).fetchone()
        entry = {
            "name": name,
            "type": typ,
            "null_count": nulls,
            "null_pct": round(100 * nulls / n, 2) if n else None,
            "distinct": distinct,
        }
        # numeric range for numeric columns
        if any(t in typ.upper() for t in ("INT", "DECIMAL", "DOUBLE", "FLOAT", "REAL", "BIGINT")):
            mn, mx, avg = con.execute(
                f'SELECT min("{name}"), max("{name}"), avg("{name}") FROM {src}'
            ).fetchone()
            entry["min"], entry["max"] = mn, mx
            entry["avg"] = round(avg, 4) if avg is not None else None
        profile.append(entry)

    # sample rows
    sample = con.execute(f"SELECT * FROM {src} LIMIT 5").fetchdf().to_dict(orient="records")

    report = {
        "parquet_path": parquet,
        "row_count": n,
        "column_count": len(cols),
        "columns": profile,
        "sample_rows": sample,
    }
    jdump("recon_parquet.json", report)
    return report


def inspect_pmtiles() -> dict:
    """Read the PMTiles header + metadata over HTTP range requests (no full download)."""
    from pmtiles.reader import Reader

    # Range-request fetch helper for the pmtiles Reader
    def get_bytes(offset: int, length: int) -> bytes:
        req = urllib.request.Request(
            PMTILES_URL, headers={"Range": f"bytes={offset}-{offset + length - 1}"}
        )
        with urllib.request.urlopen(req) as resp:
            return resp.read()

    reader = Reader(get_bytes)
    header = reader.header()
    meta = reader.metadata()

    # tippecanoe/pmtiles metadata carries vector_layers with fields
    vector_layers = meta.get("vector_layers", [])
    layers = [
        {
            "id": vl.get("id"),
            "fields": vl.get("fields", {}),
            "minzoom": vl.get("minzoom"),
            "maxzoom": vl.get("maxzoom"),
        }
        for vl in vector_layers
    ]

    def deg(v):
        return v / 1e7

    report = {
        "pmtiles_url": PMTILES_URL,
        "tile_type": str(header.get("tile_type")),
        "min_zoom": header.get("min_zoom"),
        "max_zoom": header.get("max_zoom"),
        "bounds": {
            "min_lon": deg(header.get("min_lon_e7", 0)),
            "min_lat": deg(header.get("min_lat_e7", 0)),
            "max_lon": deg(header.get("max_lon_e7", 0)),
            "max_lat": deg(header.get("max_lat_e7", 0)),
        },
        "center": {
            "lon": deg(header.get("center_lon_e7", 0)),
            "lat": deg(header.get("center_lat_e7", 0)),
            "zoom": header.get("center_zoom"),
        },
        "vector_layers": layers,
        "metadata_keys": list(meta.keys()),
        "metadata_name": meta.get("name"),
    }
    jdump("recon_pmtiles.json", report)
    return report


if __name__ == "__main__":
    pq = profile_parquet()
    print("\n=== PARQUET ===")
    print("rows:", pq["row_count"], "cols:", pq["column_count"])
    for c in pq["columns"]:
        extra = ""
        if "min" in c:
            extra = f" range=[{c['min']}, {c['max']}] avg={c.get('avg')}"
        print(f"  {c['name']:<28} {c['type']:<12} null%={c['null_pct']:<6} distinct={c['distinct']}{extra}")

    print("\n=== PMTILES ===")
    pm = inspect_pmtiles()
    print("zoom:", pm["min_zoom"], "-", pm["max_zoom"], "bounds:", pm["bounds"])
    for layer in pm["vector_layers"]:
        print(f"  layer '{layer['id']}' z{layer['minzoom']}-{layer['maxzoom']} fields={list(layer['fields'].keys())}")
