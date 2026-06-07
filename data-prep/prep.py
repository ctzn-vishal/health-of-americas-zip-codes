"""Phase 2 prep pipeline: DuckDB over Tigris + extracted tile health -> app payloads.

Emits into web/public/data/:
  metric_catalog.json, geo_catalog.json, region_catalog.json,
  map_values/{metric}.json, charts/{metric}.json, insights/{metric}.json

Health outcomes come from data-prep/tile_health.parquet (extracted from the PMTiles by
extract_pmtiles.py); socioeconomic context comes from the Tigris parquet. Joined on ZIP.

Prereqs:  extract_pmtiles.py has produced tile_health.parquet.
Run:      .venv/Scripts/python.exe prep.py
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib

import numpy as np

from env_tigris import connect, PMTILES_URL, PARQUET_S3

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE.parent / "web" / "public" / "data"
TILE_HEALTH = (HERE / "tile_health.parquet").as_posix()
STAMP = dt.datetime(2026, 6, 6).isoformat() + "Z"  # fixed (deterministic build)

PLACES_SRC = "CDC PLACES — model-based small-area estimates (ZCTA), via Health_Zip PMTiles"
PARQUET_SRC = "health_zip.parquet (Tigris) — behavioral risk factors"
SRC_URL = "https://www.cdc.gov/places/"

# ---- Metric semantics (authored — the catalog is where meaning lives) ------------------
# topic, label, short, denominator, source, from(tiles|parquet)
METRICS = {
    "diabetes":     dict(label="Diabetes", short="Diabetes", topic="Cardiometabolic",
                         denom="adults 18+", src="tiles", desc="Diagnosed diabetes among adults 18+"),
    "bphigh":       dict(label="High blood pressure", short="High BP", topic="Cardiometabolic",
                         denom="adults 18+", src="tiles", desc="High blood pressure among adults 18+"),
    "chd":          dict(label="Coronary heart disease", short="Heart disease", topic="Cardiometabolic",
                         denom="adults 18+", src="tiles", desc="Coronary heart disease among adults 18+"),
    "copd":         dict(label="COPD", short="COPD", topic="Respiratory",
                         denom="adults 18+", src="tiles", desc="Chronic obstructive pulmonary disease, adults 18+"),
    "obesity_rate": dict(label="Obesity", short="Obesity", topic="Behavioral",
                         denom="adults 18+", src="parquet", desc="Obesity among adults 18+"),
    "smoking_rate": dict(label="Smoking", short="Smoking", topic="Behavioral",
                         denom="adults 18+", src="parquet", desc="Current cigarette smoking among adults 18+"),
    "depression":   dict(label="Depression", short="Depression", topic="Mental health",
                         denom="adults 18+", src="tiles", desc="Diagnosed depression among adults 18+"),
    "mhlth":        dict(label="Frequent poor mental health", short="Poor mental health", topic="Mental health",
                         denom="adults 18+", src="tiles", desc="≥14 days poor mental health in past month, adults 18+"),
    "ghlth":        dict(label="Fair or poor health", short="Fair/poor health", topic="General health",
                         denom="adults 18+", src="tiles", desc="Self-rated fair or poor health, adults 18+"),
    "teethlost":    dict(label="All teeth lost (65+)", short="Teeth lost", topic="Oral health / access",
                         denom="adults 65+", src="tiles", desc="All natural teeth lost among adults 65+"),
}
CONTEXT = {
    "area_deprivation_index": dict(label="Area Deprivation Index", short="ADI", higher="more deprived"),
    "median_income":          dict(label="Median household income", short="Median income", higher="higher income"),
    "percent_poverty":        dict(label="Poverty rate", short="Poverty", higher="more poverty"),
    "percent_college_graduated": dict(label="College graduates", short="College+", higher="more college grads"),
    "percent_over_65":        dict(label="Adults 65+", short="65+", higher="older population"),
}


def write(rel: str, obj) -> None:
    p = DATA / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, separators=(",", ":")))


def loess(x: np.ndarray, y: np.ndarray, grid: np.ndarray, frac: float = 0.3) -> list:
    """Tricube-weighted local linear regression (classic LOESS) on a grid."""
    n = len(x)
    k = max(int(frac * n), 30)
    out = []
    order = np.argsort(x)
    xs, ys = x[order], y[order]
    for gx in grid:
        d = np.abs(xs - gx)
        idx = np.argsort(d)[:k]
        dx, dy = xs[idx], ys[idx]
        dmax = np.max(np.abs(dx - gx)) or 1.0
        w = (1 - (np.abs(dx - gx) / dmax) ** 3) ** 3
        w = np.clip(w, 0, None)
        # weighted linear fit
        W = np.sum(w)
        mx = np.sum(w * dx) / W
        my = np.sum(w * dy) / W
        bx = np.sum(w * (dx - mx) * (dy - my))
        bxx = np.sum(w * (dx - mx) ** 2) or 1e-9
        slope = bx / bxx
        out.append([round(float(gx), 2), round(float(my + slope * (gx - mx)), 3)])
    return out


def main() -> None:
    con, parquet = connect()
    P = f"read_parquet('{parquet}')"
    T = f"read_parquet('{TILE_HEALTH}')"

    # Master joined table. teethlost -1 sentinel -> NULL. Reliability flag = has tile + context.
    metric_cols = []
    for m, meta in METRICS.items():
        if meta["src"] == "tiles":
            col = f"CASE WHEN th.{m} < 0 THEN NULL ELSE th.{m} END AS {m}" if m == "teethlost" else f"th.{m} AS {m}"
        else:
            col = f"pq.{m} AS {m}"
        metric_cols.append(col)
    con.execute(
        f"""
        CREATE TABLE j AS
        SELECT th.zip AS zip,
               pq.city_name AS city, pq.state_abbreviation AS state, pq.county_name AS county,
               pq.region AS region, pq.latitude AS lat, pq.longitude AS lon,
               pq.population AS population,
               pq.area_deprivation_index, pq.median_income, pq.percent_poverty,
               pq.percent_college_graduated, pq.percent_over_65, pq.percent_unemployed,
               pq.population_density,
               {', '.join(metric_cols)}
        FROM {T} th JOIN (SELECT lpad(CAST(location_id AS VARCHAR),5,'0') AS zip, * FROM {P}) pq
          USING(zip)
        """
    )
    n_total = con.execute("SELECT count(*) FROM j").fetchone()[0]
    print("joined rows:", n_total)

    # ---- metric_catalog + map_values ----
    catalog = []
    for m, meta in METRICS.items():
        row = con.execute(
            f"""SELECT count({m}) n, count(*)-count({m}) miss,
                       min({m}) mn, max({m}) mx,
                       quantile_cont({m},0.02) p2, quantile_cont({m},0.5) p50,
                       quantile_cont({m},0.98) p98, quantile_cont({m},0.90) p90,
                       sum({m}*population)/sum(population) FILTER (WHERE {m} IS NOT NULL) bench
                FROM j"""
        ).fetchdf().to_dict("records")[0]
        domain = [round(row["p2"], 1), round(row["bench"], 1), round(row["p98"], 1)]
        catalog.append({
            "metric_id": m, "label": meta["label"], "short_label": meta["short"],
            "topic": meta["topic"], "unit": "percent", "format": ".1f",
            "lower_is_better": True, "domain": domain,
            "scale_kind": "sequential", "benchmark_kind": "national_pop_weighted",
            "benchmark": round(row["bench"], 2),
            "p90": round(row["p90"], 1),
            "denominator": meta["denom"], "description": meta["desc"],
            "source": PLACES_SRC if meta["src"] == "tiles" else PARQUET_SRC,
            "source_url": SRC_URL, "source_from": meta["src"],
            "source_year": None, "vintage_note": "Year not stated in source; treat as recent cross-section.",
            "confidence_interval_available": False,
            "suppression_rule": "value < 0 treated as missing (−1 sentinel)" if m == "teethlost" else "none",
            "missingness_note": f"{int(row['miss'])} of {n_total} ZIPs missing",
            "n_zip": int(row["n"]), "missing_count": int(row["miss"]),
            "value_min": round(row["mn"], 1), "value_max": round(row["mx"], 1),
        })

        # map_values payload (feeds MapLibre feature-state)
        vals = con.execute(
            f"SELECT zip, round({m},2) v FROM j WHERE {m} IS NOT NULL"
        ).fetchall()
        write(f"map_values/{m}.json", {
            "metric_id": m, "join_key": "zip", "unit": "percent",
            "domain": domain, "benchmark": round(row["bench"], 2),
            "values": {z: v for z, v in vals},
            "source": catalog[-1]["source"], "source_year": None, "generated_at": STAMP,
        })
    write("metric_catalog.json", {"metrics": catalog, "default_metric": "diabetes",
                                  "generated_at": STAMP,
                                  "sources": {"pmtiles": PMTILES_URL, "parquet": PARQUET_S3}})
    print("wrote metric_catalog + map_values for", len(catalog), "metrics")

    # ---- charts + insights per metric ----
    for m, meta in METRICS.items():
        bench = next(c["benchmark"] for c in catalog if c["metric_id"] == m)
        p90 = next(c["p90"] for c in catalog if c["metric_id"] == m)

        # summary
        summ = con.execute(
            f"""SELECT count({m}) n, avg({m}) mean,
                       sum(CASE WHEN {m}>={p90} THEN population ELSE 0 END) high_pop,
                       sum(population) tot_pop
                FROM j WHERE {m} IS NOT NULL"""
        ).fetchdf().to_dict("records")[0]

        # ranked top/bottom 20
        def ranked(direction: str):
            order = "DESC" if direction == "top" else "ASC"
            return con.execute(
                f"""SELECT zip, city, state, round({m},1) AS "value", population,
                           round({m}-{bench},1) AS gap
                    FROM j WHERE {m} IS NOT NULL
                    ORDER BY {m} {order}, population DESC LIMIT 20"""
            ).fetchdf().to_dict("records")

        # distribution histogram (40 bins over p1..p99)
        lo, hi = con.execute(
            f"SELECT quantile_cont({m},0.01), quantile_cont({m},0.99) FROM j WHERE {m} IS NOT NULL"
        ).fetchone()
        edges = np.linspace(lo, hi, 41)
        counts = con.execute(
            f"""SELECT least(39, greatest(0, floor(({m} - {lo}) / ({hi} - {lo}) * 40)))::INT b,
                       count(*) c
                FROM j WHERE {m} IS NOT NULL GROUP BY b ORDER BY b"""
        ).fetchdf()
        cmap = dict(zip(counts["b"], counts["c"]))
        bins = [{"x0": round(float(edges[i]), 2), "x1": round(float(edges[i + 1]), 2),
                 "count": int(cmap.get(i, 0))} for i in range(40)]

        # correlations vs context (Spearman)
        corrs = []
        for ctx, cmeta in CONTEXT.items():
            r = con.execute(
                f"""SELECT corr(rx, ry) rho, count(*) n FROM (
                      SELECT rank() OVER (ORDER BY {ctx}) rx, rank() OVER (ORDER BY {m}) ry
                      FROM j WHERE {ctx} IS NOT NULL AND {m} IS NOT NULL)"""
            ).fetchone()
            corrs.append({"context": ctx, "label": cmeta["label"], "short": cmeta["short"],
                          "rho": round(r[0], 3) if r[0] is not None else None, "n": int(r[1])})
        corrs.sort(key=lambda d: abs(d["rho"] or 0), reverse=True)

        # disparity gradient by ADI decile (population-weighted mean + 95% CI across ZIPs)
        grad = con.execute(
            f"""WITH d AS (
                  SELECT {m} v, population pop, area_deprivation_index adi,
                         ntile(10) OVER (ORDER BY area_deprivation_index) decile
                  FROM j WHERE area_deprivation_index IS NOT NULL AND {m} IS NOT NULL)
                SELECT decile,
                       sum(v*pop)/sum(pop) wmean, avg(v) mean, stddev_samp(v) sd, count(*) n,
                       min(adi) adi_lo, max(adi) adi_hi
                FROM d GROUP BY decile ORDER BY decile"""
        ).fetchdf().to_dict("records")
        gradient = []
        for g in grad:
            se = (g["sd"] / (g["n"] ** 0.5)) if g["n"] else 0
            gradient.append({
                "decile": int(g["decile"]), "value": round(g["wmean"], 2),
                "lci": round(g["wmean"] - 1.96 * se, 2), "uci": round(g["wmean"] + 1.96 * se, 2),
                "n": int(g["n"]), "adi_lo": round(g["adi_lo"], 1), "adi_hi": round(g["adi_hi"], 1),
            })
        gap_td = round(gradient[-1]["value"] - gradient[0]["value"], 1) if gradient else None

        # scatter sample (1500) + LOESS on full + residual outliers
        full = con.execute(
            f"""SELECT zip, city, state, area_deprivation_index x, {m} y, population
                FROM j WHERE area_deprivation_index IS NOT NULL AND {m} IS NOT NULL"""
        ).fetchdf()
        xx, yy = full["x"].to_numpy(float), full["y"].to_numpy(float)
        gx = np.linspace(np.quantile(xx, 0.01), np.quantile(xx, 0.99), 40)
        loess_pts = loess(xx, yy, gx, frac=0.35)
        # predicted via interpolation for residuals
        lp = np.array(loess_pts)
        pred = np.interp(xx, lp[:, 0], lp[:, 1])
        full = full.assign(resid=yy - pred)
        worse = full.nlargest(8, "resid")[["zip", "city", "state", "x", "y", "resid"]].round(2).to_dict("records")
        better = full.nsmallest(8, "resid")[["zip", "city", "state", "x", "y", "resid"]].round(2).to_dict("records")
        sample = con.execute(
            f"""SELECT zip, round(area_deprivation_index,1) x, round({m},1) y
                FROM j WHERE area_deprivation_index IS NOT NULL AND {m} IS NOT NULL
                USING SAMPLE 1500 ROWS (reservoir, 42)"""
        ).fetchdf().to_dict("records")

        write(f"charts/{m}.json", {
            "metric_id": m, "benchmark": bench, "high_burden_threshold": p90,
            "summary": {
                "national_average": bench, "unweighted_mean": round(summ["mean"], 2),
                "n_zip": int(summ["n"]),
                "high_burden_population": int(summ["high_pop"]),
                "total_population": int(summ["tot_pop"]),
                "high_burden_pct_pop": round(100 * summ["high_pop"] / summ["tot_pop"], 1),
            },
            "ranked_top": ranked("top"), "ranked_bottom": ranked("bottom"),
            "distribution": {"bins": bins, "benchmark": bench, "p90": p90},
            "correlations": corrs,
            "disparity_gradient": {"by": "area_deprivation_index", "deciles": gradient,
                                   "top_minus_bottom": gap_td},
            "scatter": {"context": "area_deprivation_index", "points": sample,
                        "loess": loess_pts, "worse_than_expected": worse,
                        "better_than_expected": better},
            "source": next(c["source"] for c in catalog if c["metric_id"] == m),
            "generated_at": STAMP,
        })

        # ---- insight bank (validated, source-backed) ----
        topc = corrs[0] if corrs else None
        top_place = ranked("top")[0]
        ins = []
        ins.append({"insight_id": f"{m}_national", "type": "benchmark", "rank": 1,
                    "claim": f"The population-weighted U.S. average is {bench}%.",
                    "value": bench, "supporting_geo_id": None, "supporting_chart": "distribution",
                    "severity": "info", "method_note": "Population-weighted mean across ZIPs."})
        if gap_td is not None:
            ins.append({"insight_id": f"{m}_adi_gradient", "type": "adi_gradient", "rank": 2,
                        "claim": f"ZIPs in the most-deprived tenth (by ADI) average {gap_td} points "
                                 f"{'higher' if gap_td>=0 else 'lower'} than the least-deprived tenth.",
                        "value": gap_td, "supporting_geo_id": None,
                        "supporting_chart": "disparity_gradient", "severity": "high" if abs(gap_td) >= 3 else "medium",
                        "method_note": "Population-weighted decile means over Area Deprivation Index."})
        if topc and topc["rho"] is not None:
            ins.append({"insight_id": f"{m}_corr", "type": "correlation", "rank": 3,
                        "claim": f"Across ZIPs, {meta['label'].lower()} is most associated with "
                                 f"{topc['label'].lower()} (Spearman ρ={topc['rho']}, n={topc['n']:,}).",
                        "value": topc["rho"], "supporting_geo_id": None, "supporting_chart": "scatter",
                        "severity": "info", "method_note": "Spearman rank correlation, ecological (ZIP-level); not causal."})
        ins.append({"insight_id": f"{m}_top_place", "type": "extreme", "rank": 4,
                    "claim": f"Highest-burden ZIP: {top_place['zip']} ({top_place['city']}, {top_place['state']}) "
                             f"at {top_place['value']}%.",
                    "value": top_place["value"], "supporting_geo_id": top_place["zip"],
                    "supporting_chart": "ranked", "severity": "medium",
                    "method_note": "Maximum ZIP value (ties broken by population)."})
        ins.append({"insight_id": f"{m}_high_pop", "type": "affected", "rank": 5,
                    "claim": f"About {summ['high_pop']/1e6:.1f} million people live in ZIPs above the "
                             f"high-burden threshold ({p90}%).",
                    "value": int(summ["high_pop"]), "supporting_geo_id": None, "supporting_chart": "map",
                    "severity": "medium", "method_note": f"Sum of population in ZIPs at or above the 90th percentile ({p90}%)."})
        write(f"insights/{m}.json", {"metric_id": m, "insights": ins, "generated_at": STAMP})

    print("wrote charts + insights for all metrics")

    # ---- geo_catalog (compact lazy lookup) + region_catalog ----
    geo = con.execute(
        "SELECT zip, city, state, region, round(lat,3) lat, round(lon,3) lon, population FROM j"
    ).fetchdf()
    write("geo_catalog.json", {
        "fields": ["city", "state", "region", "lat", "lon", "pop"],
        "zips": {r["zip"]: [r["city"], r["state"], r["region"], r["lat"], r["lon"], int(r["population"])]
                 for r in geo.to_dict("records")},
        "generated_at": STAMP,
    })

    # region/state bounds from centroids (pad 0.4deg); filter implausible (0,0)
    regions = [{"id": "us", "label": "United States", "kind": "national",
                "bounds": [-125.0, 24.0, -66.5, 49.5], "default": True}]
    for kind, col in [("census_region", "region"), ("state", "state")]:
        rows = con.execute(
            f"""SELECT {col} id, count(*) n, min(lon) w, min(lat) s, max(lon) e, max(lat) nth
                FROM j WHERE lat BETWEEN 18 AND 72 AND lon BETWEEN -180 AND -60
                GROUP BY {col} ORDER BY {col}"""
        ).fetchdf().to_dict("records")
        for r in rows:
            if not r["id"]:
                continue
            regions.append({"id": r["id"], "label": r["id"], "kind": kind, "n_zip": int(r["n"]),
                            "bounds": [round(r["w"] - 0.4, 2), round(r["s"] - 0.4, 2),
                                       round(r["e"] + 0.4, 2), round(r["nth"] + 0.4, 2)]})
    write("region_catalog.json", {"regions": regions, "generated_at": STAMP})
    print("wrote geo_catalog (", len(geo), "zips ) + region_catalog (", len(regions), "regions )")
    print("DONE -> web/public/data/")


if __name__ == "__main__":
    main()
