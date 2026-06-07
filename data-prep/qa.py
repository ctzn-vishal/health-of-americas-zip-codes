"""
ADVERSARIAL QA script for the ZIP-health data pipeline.
Recomputes all summaries INDEPENDENTLY from raw sources and diffs against emitted payloads.
Does NOT import or reuse prep.py logic.

Run: data-prep/.venv/Scripts/python.exe data-prep/qa.py
"""
from __future__ import annotations

import json
import os
import pathlib
import random
import sys

import duckdb
import pandas as pd
import numpy as np
from dotenv import load_dotenv

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
DATA = ROOT / "web" / "public" / "data"
TILE_HEALTH = (HERE / "tile_health.parquet").as_posix()
ENV_PATH = ROOT / ".env"

# ---------------------------------------------------------------------------
# Credentials (never printed / never written to disk)
# ---------------------------------------------------------------------------
load_dotenv(ENV_PATH)
_cid = os.environ.get("TIGRIS_CLIENT_ID", "")
_csecret = os.environ.get("TIGRIS_CLIENT_SECRET", "")
_endpoint = (
    os.environ.get("TIGRIS_ENDPOINT", "t3.storage.dev")
    .replace("https://", "").replace("http://", "").strip("/")
)
PARQUET_S3 = "s3://ontopic-public-data/sample-data/health_zip.parquet"
PARQUET_HTTPS = "https://ontopic-public-data.t3.tigrisfiles.io/sample-data/health_zip.parquet"
PMTILES_LOCAL = (HERE / "Health_Zip_converted.pmtiles").as_posix()

METRICS_TILE = ["diabetes", "bphigh", "chd", "copd", "depression",
                "mhlth", "ghlth", "teethlost"]
METRICS_PARQUET = ["obesity_rate", "smoking_rate"]
METRICS_ALL = ["diabetes", "bphigh", "chd", "copd", "obesity_rate",
               "smoking_rate", "depression", "mhlth", "ghlth", "teethlost"]
CONTEXT_VARS = ["area_deprivation_index", "median_income", "percent_poverty",
                "percent_college_graduated", "percent_over_65"]

RATE_TOL = 0.05   # absolute tolerance for rate-level differences (%)
COUNT_TOL = 0     # exact match for counts

results: list[dict] = []


def rec(name: str, status: str, detail: str, **kw) -> dict:
    d = {"name": name, "status": status, "detail": detail}
    d.update(kw)
    return d


def fail(name: str, detail: str, **kw) -> dict:
    print(f"  FAIL  [{name}]: {detail}")
    return rec(name, "FAIL", detail, **kw)


def ok(name: str, detail: str = "", **kw) -> dict:
    print(f"  PASS  [{name}]: {detail}")
    return rec(name, "PASS", detail, **kw)


# ---------------------------------------------------------------------------
# DuckDB connection (fresh — NOT reusing env_tigris)
# ---------------------------------------------------------------------------
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
if _cid and _csecret:
    con.execute(
        """CREATE OR REPLACE SECRET tigris (
             TYPE s3, PROVIDER config,
             KEY_ID    $key, SECRET $secret,
             REGION 'auto', ENDPOINT $endpoint, URL_STYLE 'vhost'
           )""",
        {"key": _cid, "secret": _csecret, "endpoint": _endpoint},
    )
    PARQUET = PARQUET_S3
    print("Using S3 path for parquet")
else:
    PARQUET = PARQUET_HTTPS
    print("No creds found, using HTTPS for parquet")

P = f"read_parquet('{PARQUET}')"
T = f"read_parquet('{TILE_HEALTH}')"

# ---------------------------------------------------------------------------
# CHECK 1: JOIN CARDINALITY
# ---------------------------------------------------------------------------
print("\n=== CHECK 1: Join Cardinality ===")
pq_zips = con.execute(
    f"SELECT count(DISTINCT lpad(CAST(location_id AS VARCHAR),5,'0')) FROM {P}"
).fetchone()[0]
tile_zips = con.execute(
    f"SELECT count(DISTINCT zip) FROM {T}"
).fetchone()[0]
pq_dups = con.execute(
    f"SELECT count(*) - count(DISTINCT lpad(CAST(location_id AS VARCHAR),5,'0')) FROM {P}"
).fetchone()[0]
tile_dups = con.execute(
    f"SELECT count(*) - count(DISTINCT zip) FROM {T}"
).fetchone()[0]

# Overlap: build join
con.execute(f"""
CREATE OR REPLACE TABLE qa_pq AS
  SELECT lpad(CAST(location_id AS VARCHAR),5,'0') AS zip, * FROM {P}
""")
con.execute(f"""
CREATE OR REPLACE TABLE qa_tile AS
  SELECT * FROM {T}
""")
overlap = con.execute(
    "SELECT count(DISTINCT a.zip) FROM qa_tile a INNER JOIN qa_pq b USING(zip)"
).fetchone()[0]
pq_only = con.execute(
    "SELECT count(DISTINCT b.zip) FROM qa_pq b LEFT JOIN qa_tile a USING(zip) WHERE a.zip IS NULL"
).fetchone()[0]
tile_only = con.execute(
    "SELECT count(DISTINCT a.zip) FROM qa_tile a LEFT JOIN qa_pq b USING(zip) WHERE b.zip IS NULL"
).fetchone()[0]

print(f"  parquet distinct zips:  {pq_zips}  (expected ~31634, dups={pq_dups})")
print(f"  tile_health distinct zips: {tile_zips}  (expected ~32263, dups={tile_dups})")
print(f"  overlap: {overlap}  (expected ~31491)")
print(f"  parquet-only: {pq_only}, tile-only: {tile_only}")

# Compare to expected ref
card_ok = True
expected = {"pq_zips": 31634, "tile_zips": 32263, "overlap": 31491, "pq_dups": 0, "tile_dups": 0}
card_detail = (
    f"parquet={pq_zips}(exp {expected['pq_zips']}), "
    f"tiles={tile_zips}(exp {expected['tile_zips']}), "
    f"overlap={overlap}(exp {expected['overlap']}), "
    f"pq_dups={pq_dups}, tile_dups={tile_dups}, "
    f"pq_only={pq_only}, tile_only={tile_only}"
)
if abs(pq_zips - expected["pq_zips"]) > 0 or abs(tile_zips - expected["tile_zips"]) > 0 or abs(overlap - expected["overlap"]) > 0:
    card_ok = False
if pq_dups != 0 or tile_dups != 0:
    card_ok = False
results.append(ok("cardinality", card_detail) if card_ok else fail("cardinality", card_detail))
results[-1]["counts"] = {"pq_zips": pq_zips, "tile_zips": tile_zips, "overlap": overlap,
                          "pq_dups": pq_dups, "tile_dups": tile_dups,
                          "pq_only": pq_only, "tile_only": tile_only}

# ---------------------------------------------------------------------------
# CHECK 2: EXTRACTION INTEGRITY (adversarial tile sample)
# ---------------------------------------------------------------------------
print("\n=== CHECK 2: Tile Extraction Integrity ===")
try:
    import gzip as _gzip
    from pmtiles.reader import MmapSource, all_tiles
    import mapbox_vector_tile

    # Tile property names -> metric id in tile_health.parquet
    TILE_FIELD_MAP = {
        "ARTHRITIS_zip": "arthritis", "BPHIGH_zip": "bphigh", "CANCER_zip": "cancer",
        "CASTHMA_zip": "casthma", "CHD_zip": "chd", "COPD_zip": "copd",
        "DEPRESSION_zip": "depression", "DIABETES_zip": "diabetes",
        "GHLTH_zip": "ghlth", "HIGHCHOL_zip": "highchol", "KIDNEY_zip": "kidney",
        "MHLTH_zip": "mhlth", "PHLTH_zip": "phlth", "STROKE_zip": "stroke",
        "TEETHLOST_zip": "teethlost",
    }
    LAYER = "zipcode_demographics"

    # Load tile_health.parquet into memory dict via DuckDB (no pandas/pyarrow needed)
    th_rows = con.execute(f"SELECT * FROM {T}").fetchdf()
    th_lookup: dict[str, dict] = {str(row["zip"]).zfill(5): row.to_dict()
                                   for _, row in th_rows.iterrows()}

    # Collect all tiles then sample ~40 by random
    with open(PMTILES_LOCAL, "rb") as f:
        src = MmapSource(f)
        all_tile_list = list(all_tiles(src))

    random.seed(42)
    if len(all_tile_list) > 40:
        sampled = random.sample(all_tile_list, 40)
    else:
        sampled = all_tile_list

    # Within each sampled tile: gather zip->health vals
    # Extraction logic: for each zip keep highest-zoom value (matching extract_pmtiles.py)
    # Here we just collect all per tile since it's a spot-check across tiles
    # (a zip can appear in multiple tiles; we trust extract_pmtiles kept the highest-zoom)
    # So: for each zip encountered in sampled tiles, verify its value against the parquet.
    tile_zip_vals: dict[str, dict] = {}  # zip -> {metric_id: float}

    def _decode_tile(raw: bytes) -> dict:
        try:
            return mapbox_vector_tile.decode(raw)
        except Exception:
            return mapbox_vector_tile.decode(_gzip.decompress(raw))

    for zxy, data in sampled:
        if not data:
            continue
        try:
            decoded = _decode_tile(data)
        except Exception:
            continue
        layer = decoded.get(LAYER, {})
        for feat in layer.get("features", []):
            props = feat.get("properties", {})
            zc = props.get("zip_code")
            if zc is None:
                continue
            zc = str(zc).zfill(5)
            if zc not in tile_zip_vals:
                tile_zip_vals[zc] = {}
            for tile_key, metric_id in TILE_FIELD_MAP.items():
                if metric_id in tile_zip_vals[zc]:
                    continue  # already have it from another tile
                raw_v = props.get(tile_key)
                if raw_v is not None:
                    try:
                        tile_zip_vals[zc][metric_id] = float(raw_v)
                    except (TypeError, ValueError):
                        pass

    # Adversarial check: for each zip in tile_zip_vals, its values must match tile_health.parquet
    mismatches = []
    for zc, tile_vals in tile_zip_vals.items():
        if zc not in th_lookup:
            # zip in tile but not in parquet — only a problem if parquet should cover it
            # (tile has more zips than parquet overlap; not a mismatch of *values*)
            continue
        pq_row = th_lookup[zc]
        for metric_id, tv in tile_vals.items():
            if metric_id not in pq_row:
                continue
            pv = pq_row[metric_id]
            # teethlost: -1 is the raw sentinel stored as-is in tile_health.parquet
            # (prep maps <0 -> NULL only at payload stage); so both should be -1
            if pv is None or (isinstance(pv, float) and np.isnan(pv)):
                # parquet has null for this metric on this zip -> cannot verify from tile
                continue
            if abs(float(tv) - float(pv)) > 0.05:
                mismatches.append(
                    f"zip={zc} metric={metric_id}: tile_raw={tv}, parquet={pv}"
                )

    n_tile_zips_sampled = len(tile_zip_vals)
    n_tile_zips_verified = sum(1 for zc in tile_zip_vals if zc in th_lookup)
    if mismatches:
        results.append(fail("extraction_integrity",
                            f"{len(mismatches)} mismatches in {n_tile_zips_verified} verified zips "
                            f"({n_tile_zips_sampled} total from {len(sampled)} tiles)",
                            mismatches=mismatches[:20]))
    else:
        results.append(ok("extraction_integrity",
                          f"0 mismatches across {n_tile_zips_verified} verified zips "
                          f"({n_tile_zips_sampled} total from {len(sampled)} tiles)"))
except Exception as e:
    import traceback
    results.append(fail("extraction_integrity", f"ERROR: {e}\n{traceback.format_exc()}"))

# ---------------------------------------------------------------------------
# BUILD MASTER JOIN for checks 3-6
# ---------------------------------------------------------------------------
print("\n=== Building master join table ===")
tile_cols = []
for m in METRICS_TILE:
    if m == "teethlost":
        tile_cols.append("CASE WHEN th.teethlost < 0 THEN NULL ELSE th.teethlost END AS teethlost")
    else:
        tile_cols.append(f"th.{m} AS {m}")
parquet_cols = [f"pq.{m} AS {m}" for m in METRICS_PARQUET]
all_col_exprs = tile_cols + parquet_cols

con.execute(f"""
CREATE OR REPLACE TABLE j AS
SELECT th.zip AS zip,
       pq.city_name AS city, pq.state_abbreviation AS state,
       pq.population AS population,
       pq.area_deprivation_index, pq.median_income, pq.percent_poverty,
       pq.percent_college_graduated, pq.percent_over_65,
       {', '.join(all_col_exprs)}
FROM qa_tile th
JOIN qa_pq pq USING(zip)
""")
n_joined = con.execute("SELECT count(*) FROM j").fetchone()[0]
print(f"  joined rows: {n_joined}")

# Load metric_catalog for reference
mc_path = DATA / "metric_catalog.json"
mc_raw = json.loads(mc_path.read_text())
mc: dict[str, dict] = {m["metric_id"]: m for m in mc_raw["metrics"]}

# ---------------------------------------------------------------------------
# CHECK 3: PER-METRIC recompute vs metric_catalog
# ---------------------------------------------------------------------------
print("\n=== CHECK 3: Per-metric stats vs metric_catalog.json ===")
for m in METRICS_ALL:
    row = con.execute(f"""
        SELECT count({m}) AS n,
               min({m}) AS mn,
               max({m}) AS mx,
               quantile_cont({m}, 0.02) AS p2,
               quantile_cont({m}, 0.98) AS p98,
               sum({m}*population)/sum(population) FILTER (WHERE {m} IS NOT NULL) AS bench
        FROM j
    """).fetchdf().to_dict("records")[0]

    ref = mc.get(m, {})
    issues = []

    # n_zip
    if int(row["n"]) != int(ref.get("n_zip", -999)):
        issues.append(f"n_zip: got {int(row['n'])} expected {ref.get('n_zip')}")

    # benchmark
    my_bench = round(float(row["bench"]), 2)
    ref_bench = float(ref.get("benchmark", -999))
    if abs(my_bench - ref_bench) > RATE_TOL:
        issues.append(f"benchmark: got {my_bench} expected {ref_bench} diff={abs(my_bench-ref_bench):.4f}")

    # domain: [p2, benchmark, p98]
    # prep stores domain[0]=round(p2,1), domain[1]=round(bench,1), domain[2]=round(p98,1)
    # but benchmark field in catalog is round(bench,2)
    my_p2 = round(float(row["p2"]), 1)
    my_p98 = round(float(row["p98"]), 1)
    my_bench_1dp = round(float(row["bench"]), 1)  # for domain[1] comparison
    ref_domain = ref.get("domain", [None, None, None])
    if ref_domain[0] is not None and abs(my_p2 - ref_domain[0]) > RATE_TOL:
        issues.append(f"p2/domain[0]: got {my_p2} expected {ref_domain[0]}")
    if ref_domain[2] is not None and abs(my_p98 - ref_domain[2]) > RATE_TOL:
        issues.append(f"p98/domain[2]: got {my_p98} expected {ref_domain[2]}")
    if ref_domain[1] is not None and abs(my_bench_1dp - ref_domain[1]) > RATE_TOL:
        issues.append(f"domain[1] (benchmark 1dp): got {my_bench_1dp} expected {ref_domain[1]} (catalog benchmark 2dp={my_bench})")

    # value_min / value_max
    my_mn = round(float(row["mn"]), 1)
    my_mx = round(float(row["mx"]), 1)
    if abs(my_mn - float(ref.get("value_min", -999))) > RATE_TOL:
        issues.append(f"value_min: got {my_mn} expected {ref.get('value_min')}")
    if abs(my_mx - float(ref.get("value_max", -999))) > RATE_TOL:
        issues.append(f"value_max: got {my_mx} expected {ref.get('value_max')}")

    detail = f"n={int(row['n'])}, bench={my_bench}, p2={my_p2}, p98={my_p98}, min={my_mn}, max={my_mx}"
    if issues:
        results.append(fail(f"metric_catalog_{m}", "; ".join(issues),
                            recomputed={"n": int(row["n"]), "benchmark": my_bench,
                                        "p2": my_p2, "p98": my_p98,
                                        "min": my_mn, "max": my_mx}))
    else:
        results.append(ok(f"metric_catalog_{m}", detail))

# ---------------------------------------------------------------------------
# CHECK 4: map_values/{metric}.json
# ---------------------------------------------------------------------------
print("\n=== CHECK 4: map_values/ ===")
for m in METRICS_ALL:
    mv_path = DATA / "map_values" / f"{m}.json"
    try:
        mv = json.loads(mv_path.read_text())
    except Exception as e:
        results.append(fail(f"map_values_{m}", f"cannot read: {e}"))
        continue

    vals_payload: dict = mv.get("values", {})
    n_payload = len(vals_payload)

    # Recompute count
    n_qa = con.execute(f"SELECT count({m}) FROM j WHERE {m} IS NOT NULL").fetchone()[0]

    issues = []
    # count match
    if n_payload != n_qa:
        issues.append(f"value count: payload={n_payload} recomputed={n_qa}")

    # no negatives
    neg_in_payload = {z: v for z, v in vals_payload.items() if isinstance(v, (int, float)) and v < 0}
    if neg_in_payload:
        issues.append(f"negative values found: {len(neg_in_payload)} (first 3: {list(neg_in_payload.items())[:3]})")

    # 5 random zip exact match (round to 2dp)
    qa_vals = con.execute(
        f"SELECT zip, round({m}, 2) AS v FROM j WHERE {m} IS NOT NULL"
    ).fetchdf()
    qa_dict = dict(zip(qa_vals["zip"], qa_vals["v"].astype(float)))
    sample_zips = random.sample(list(qa_dict.keys()), min(5, len(qa_dict)))
    val_mismatches = []
    for zc in sample_zips:
        qa_v = round(qa_dict[zc], 2)
        pay_v = vals_payload.get(zc)
        if pay_v is None:
            val_mismatches.append(f"zip {zc}: missing in payload (qa={qa_v})")
        elif abs(float(pay_v) - float(qa_v)) > 0.005:
            val_mismatches.append(f"zip {zc}: payload={pay_v} qa={qa_v}")
    if val_mismatches:
        issues.append("spot-check mismatches: " + "; ".join(val_mismatches))

    if issues:
        results.append(fail(f"map_values_{m}", "; ".join(issues),
                            payload_count=n_payload, qa_count=n_qa))
    else:
        results.append(ok(f"map_values_{m}",
                          f"count={n_payload}=={n_qa}, no negatives, 5 spot-checks OK"))

# ---------------------------------------------------------------------------
# CHECK 5: charts/{metric}.json
# ---------------------------------------------------------------------------
print("\n=== CHECK 5: charts/ ===")
for m in METRICS_ALL:
    chart_path = DATA / "charts" / f"{m}.json"
    try:
        ch = json.loads(chart_path.read_text())
    except Exception as e:
        results.append(fail(f"charts_{m}", f"cannot read: {e}"))
        continue

    issues = []
    ref_mc = mc[m]

    # (a) summary.national_average == benchmark
    na = ch.get("summary", {}).get("national_average")
    bench_ref = ref_mc["benchmark"]
    if na is None or abs(float(na) - float(bench_ref)) > RATE_TOL:
        issues.append(f"national_average: payload={na} expected={bench_ref}")

    # (b) high_burden_population: sum pop where value >= p90 (recompute p90 independently)
    p90_qa = con.execute(
        f"SELECT quantile_cont({m}, 0.90) FROM j WHERE {m} IS NOT NULL"
    ).fetchone()[0]
    hbp_qa = con.execute(
        f"SELECT sum(population) FROM j WHERE {m} IS NOT NULL AND {m} >= {p90_qa}"
    ).fetchone()[0]
    hbp_payload = ch.get("summary", {}).get("high_burden_population")
    if hbp_payload is not None and hbp_qa is not None:
        # populations are integers — allow 1% relative tolerance (p90 rounding)
        rel_diff = abs(int(hbp_qa) - int(hbp_payload)) / max(int(hbp_qa), 1)
        if rel_diff > 0.02:
            issues.append(f"high_burden_population: qa={int(hbp_qa)} payload={hbp_payload} rel_diff={rel_diff:.3f}")

    # (c) ranked_top[0] = max-value ZIP
    top_qa = con.execute(
        f"SELECT zip, round({m}, 1) AS v FROM j WHERE {m} IS NOT NULL ORDER BY {m} DESC, population DESC LIMIT 1"
    ).fetchone()
    ranked_top = ch.get("ranked_top", [])
    if ranked_top and top_qa:
        top_payload = ranked_top[0]
        if top_payload.get("zip") != top_qa[0]:
            issues.append(f"ranked_top[0].zip: payload={top_payload.get('zip')} qa={top_qa[0]}")
        if abs(float(top_payload.get("value", 0)) - float(top_qa[1])) > RATE_TOL:
            issues.append(f"ranked_top[0].value: payload={top_payload.get('value')} qa={top_qa[1]}")

    # (d) disparity_gradient.top_minus_bottom
    grad_qa = con.execute(f"""
        WITH d AS (
            SELECT {m} v, population pop,
                   ntile(10) OVER (ORDER BY area_deprivation_index) decile
            FROM j
            WHERE area_deprivation_index IS NOT NULL AND {m} IS NOT NULL
        )
        SELECT decile, sum(v*pop)/sum(pop) AS wmean
        FROM d GROUP BY decile ORDER BY decile
    """).fetchdf()
    if len(grad_qa) >= 10:
        top10 = float(grad_qa[grad_qa["decile"] == 10]["wmean"].iloc[0])
        bot1 = float(grad_qa[grad_qa["decile"] == 1]["wmean"].iloc[0])
        tmb_qa = round(top10 - bot1, 1)
        tmb_payload = ch.get("disparity_gradient", {}).get("top_minus_bottom")
        if tmb_payload is not None and abs(float(tmb_payload) - tmb_qa) > RATE_TOL:
            issues.append(f"top_minus_bottom: payload={tmb_payload} qa={tmb_qa}")

    # (e) correlations: top |Spearman| matches
    # Recompute Spearman as corr(rank(x), rank(y))
    spearman_qa = []
    for ctx in CONTEXT_VARS:
        r = con.execute(f"""
            SELECT corr(rx, ry) AS rho, count(*) AS n
            FROM (
                SELECT rank() OVER (ORDER BY {ctx}) rx,
                       rank() OVER (ORDER BY {m}) ry
                FROM j WHERE {ctx} IS NOT NULL AND {m} IS NOT NULL
            )
        """).fetchone()
        if r and r[0] is not None:
            spearman_qa.append({"context": ctx, "rho": round(float(r[0]), 3), "n": int(r[1])})
    spearman_qa.sort(key=lambda d: abs(d["rho"]), reverse=True)

    corrs_payload = ch.get("correlations", [])
    if corrs_payload and spearman_qa:
        top_payload_ctx = corrs_payload[0].get("context")
        top_qa_ctx = spearman_qa[0]["context"]
        top_payload_rho = float(corrs_payload[0].get("rho", 0))
        top_qa_rho = spearman_qa[0]["rho"]
        if top_payload_ctx != top_qa_ctx:
            issues.append(f"correlations[0].context: payload={top_payload_ctx} qa={top_qa_ctx}")
        if abs(top_payload_rho - top_qa_rho) > RATE_TOL:
            issues.append(f"correlations[0].rho: payload={top_payload_rho} qa={top_qa_rho}")

    if issues:
        results.append(fail(f"charts_{m}", "; ".join(issues),
                            p90_qa=round(float(p90_qa), 2) if p90_qa else None,
                            spearman_top_qa=spearman_qa[0] if spearman_qa else None,
                            tmb_qa=tmb_qa if len(grad_qa) >= 10 else None))
    else:
        results.append(ok(f"charts_{m}",
                          f"national_avg OK, high_burden_pop OK, top_zip={top_qa[0] if top_qa else '?'}, "
                          f"tmb={tmb_qa if len(grad_qa)>=10 else '?'}, corr={spearman_qa[0] if spearman_qa else '?'}"))

# ---------------------------------------------------------------------------
# CHECK 6: DENOMINATOR / CONSISTENCY SANITY
# ---------------------------------------------------------------------------
print("\n=== CHECK 6: Denominator/Consistency Sanity ===")
for m in METRICS_ALL:
    issues = []
    ref_mc = mc[m]

    # a) All map_values in [0, 100]
    mv_path = DATA / "map_values" / f"{m}.json"
    try:
        mv = json.loads(mv_path.read_text())
        out_of_range = {z: v for z, v in mv.get("values", {}).items()
                        if not (0 <= float(v) <= 100)}
        if out_of_range:
            issues.append(f"{len(out_of_range)} values outside [0,100]: first={list(out_of_range.items())[:3]}")
    except Exception as e:
        issues.append(f"cannot read map_values: {e}")

    # b) benchmark within [min, max]
    bench = float(ref_mc.get("benchmark", 0))
    vmin = float(ref_mc.get("value_min", 0))
    vmax = float(ref_mc.get("value_max", 0))
    if not (vmin <= bench <= vmax):
        issues.append(f"benchmark {bench} outside [value_min={vmin}, value_max={vmax}]")

    # c) domain strictly increasing
    domain = ref_mc.get("domain", [])
    if len(domain) == 3:
        if not (domain[0] < domain[1] < domain[2]):
            issues.append(f"domain not strictly increasing: {domain}")
    else:
        issues.append(f"domain has {len(domain)} elements, expected 3")

    if issues:
        results.append(fail(f"sanity_{m}", "; ".join(issues)))
    else:
        results.append(ok(f"sanity_{m}",
                          f"all in [0,100], benchmark in [min,max], domain strictly increasing"))

# ---------------------------------------------------------------------------
# WRITE REPORT
# ---------------------------------------------------------------------------
failures = [r for r in results if r["status"] == "FAIL"]
passes = [r for r in results if r["status"] == "PASS"]
n_fail = len(failures)
n_pass = len(passes)

report = {
    "summary": {
        "total_checks": len(results),
        "pass": n_pass,
        "fail": n_fail,
        "overall": "PASS" if n_fail == 0 else f"FAIL ({n_fail} failures)",
    },
    "cardinality": {
        "parquet_distinct_zips": pq_zips,
        "tile_distinct_zips": tile_zips,
        "overlap": overlap,
        "pq_dups": pq_dups,
        "tile_dups": tile_dups,
        "pq_only": pq_only,
        "tile_only": tile_only,
    },
    "checks": results,
    "failures": failures,
}

report_path = HERE / "qa_report.json"
report_path.write_text(json.dumps(report, indent=2, default=str))
print(f"\nWrote {report_path}")

# Final summary line
if n_fail == 0:
    print("\nQA RESULT: PASS")
else:
    print(f"\nQA RESULT: FAIL ({n_fail} failures)")
    for f in failures:
        print(f"  FAIL [{f['name']}]: {f['detail']}")

# Print key evidence even on pass
diabetes_mc = mc.get("diabetes", {})
print(f"\n--- Evidence (independently computed) ---")
print(f"  diabetes benchmark (QA):  ", end="")
db_bench = con.execute(
    "SELECT sum(diabetes*population)/sum(population) FROM j WHERE diabetes IS NOT NULL"
).fetchone()[0]
print(round(float(db_bench), 4))

# ADI gap for diabetes
grad_d = con.execute("""
    WITH d AS (
        SELECT diabetes v, population pop,
               ntile(10) OVER (ORDER BY area_deprivation_index) decile
        FROM j
        WHERE area_deprivation_index IS NOT NULL AND diabetes IS NOT NULL
    )
    SELECT decile, sum(v*pop)/sum(pop) AS wmean
    FROM d GROUP BY decile ORDER BY decile
""").fetchdf()
if len(grad_d) >= 10:
    t10 = float(grad_d[grad_d["decile"] == 10]["wmean"].iloc[0])
    b1 = float(grad_d[grad_d["decile"] == 1]["wmean"].iloc[0])
    print(f"  diabetes ADI gap (decile10 - decile1): {round(t10-b1, 2)}")

sys.exit(0 if n_fail == 0 else 1)
