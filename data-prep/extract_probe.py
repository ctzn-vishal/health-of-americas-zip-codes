"""Probe: can we decode the PMTiles MVT and read health props? What zoom gives full coverage?
Also verifies the parquet<->tiles join on a sample (zero-padded ZIP string).
"""
from __future__ import annotations

import gzip
import urllib.request

import mapbox_vector_tile
from pmtiles.reader import Reader

from env_tigris import connect, PMTILES_URL

LAYER = "zipcode_demographics"


def make_reader() -> Reader:
    def get_bytes(offset: int, length: int) -> bytes:
        req = urllib.request.Request(
            PMTILES_URL, headers={"Range": f"bytes={offset}-{offset + length - 1}"}
        )
        with urllib.request.urlopen(req) as resp:
            return resp.read()

    return Reader(get_bytes)


def decode_tile(raw: bytes):
    if raw is None:
        return None
    try:
        return mapbox_vector_tile.decode(raw)
    except Exception:
        return mapbox_vector_tile.decode(gzip.decompress(raw))


def tiles_at_zoom(z: int):
    n = 2 ** z
    for x in range(n):
        for y in range(n):
            yield z, x, y


def probe_zoom(reader: Reader, z: int, max_tiles: int = 64):
    """Collect distinct zip codes seen across (up to max_tiles) tiles at zoom z."""
    zips = set()
    sample_props = None
    tiles_with_data = 0
    checked = 0
    for (zz, x, y) in tiles_at_zoom(z):
        checked += 1
        if checked > max_tiles:
            break
        raw = reader.get(zz, x, y)
        if not raw:
            continue
        decoded = decode_tile(raw)
        if not decoded or LAYER not in decoded:
            continue
        feats = decoded[LAYER]["features"]
        if feats:
            tiles_with_data += 1
        for f in feats:
            props = f.get("properties", {})
            zc = props.get("zip_code")
            if zc is not None:
                zips.add(str(zc))
            if sample_props is None:
                sample_props = props
    return zips, sample_props, tiles_with_data, checked


if __name__ == "__main__":
    reader = make_reader()

    # 1) Decode the single z0 tile first — best case is full coverage in one tile.
    for z in (0, 1, 2, 3):
        zips, sample, twd, checked = probe_zoom(reader, z, max_tiles=4 ** z if z <= 3 else 64)
        print(f"z{z}: distinct_zips={len(zips)} tiles_with_data={twd}/{checked}")
        if z == 0 and sample:
            print("  sample z0 properties keys:", list(sample.keys()))
            print("  sample z0 property values:", {k: sample[k] for k in list(sample)[:6]})
        if len(zips) >= 31000:
            print(f"  >>> FULL COVERAGE reached at z{z}")
            break

    # 2) Join check vs parquet (zero-padded 5-char ZIP string)
    con, parquet = connect()
    pq_zips = con.execute(
        f"SELECT DISTINCT lpad(CAST(location_id AS VARCHAR), 5, '0') AS zip FROM read_parquet('{parquet}')"
    ).fetchdf()["zip"].tolist()
    pq_set = set(pq_zips)
    print(f"\nparquet distinct zips: {len(pq_set)}  sample: {sorted(pq_set)[:5]}")

    # Compare against whatever tile zips we have from the deepest probed zoom
    print(f"tile zips (probed): {len(zips)}  sample: {sorted(zips)[:5]}")
    overlap = pq_set & zips
    print(f"overlap (probed subset): {len(overlap)}")
    print(f"in parquet not in probed tiles: {len(pq_set - zips)} (expected >0 if probe was partial)")
    print(f"in probed tiles not in parquet: {len(zips - pq_set)}")
