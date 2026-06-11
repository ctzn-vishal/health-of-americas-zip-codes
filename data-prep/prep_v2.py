"""V2 prep pipeline: local zcta_atlas parquet -> static atlas payloads.

This replaces the old "health from PMTiles + context from parquet" contract with the
updated analytic parquet as the source of health, demographics, ADI, coverage, and
provenance. The PMTiles remain the runtime geometry source.

Run from repo root:
  python data-prep/prep_v2.py
Then from web/:
  npm run gen:profiles
"""
from __future__ import annotations

import datetime as dt
import json
import math
import pathlib
from typing import Any

import duckdb
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
HERE = pathlib.Path(__file__).resolve().parent
RAW = ROOT / "raw_data" / "zcta_atlas.parquet"
META_PATH = ROOT / "raw_data" / "zcta_atlas.parquet.meta.json"
DATA = ROOT / "web" / "public" / "data"

PMTILES_URL = "https://ontopic-public-data.t3.tigrisfiles.io/pmtiles/Health_Zip_converted.pmtiles"
CDC_URL = "https://www.cdc.gov/places/"
ADI_URL = "https://www.neighborhoodatlas.medicine.wisc.edu/"
ACS_URL = "https://www.census.gov/programs-surveys/acs/"

STATE_BY_FIPS = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY",
}

REGION_BY_STATE = {
    **{s: "Northeast" for s in ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"]},
    **{s: "Midwest" for s in ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"]},
    **{s: "South" for s in ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"]},
    **{s: "West" for s in ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"]},
}


def esc(value: str) -> str:
    return value.replace("'", "''")


def sql_case(mapping: dict[str, str], expr: str, default: str = "NULL") -> str:
    parts = [f"WHEN '{esc(k)}' THEN '{esc(v)}'" for k, v in mapping.items()]
    return f"CASE {expr} {' '.join(parts)} ELSE {default} END"


def clean_num(col: str) -> str:
    return f"CASE WHEN {col} < 0 THEN NULL ELSE {col} END"


def clean_pct(col: str) -> str:
    return f"CASE WHEN {col} < 0 THEN NULL ELSE {col} * 100 END"


def places_source(vintage: str) -> str:
    return f"CDC PLACES 2025 ZCTA estimates, with documented PA/KY tract-aggregate backfill where CDC ZCTA cells are absent ({vintage})"


# All featured metrics are burden-oriented: higher = worse. For positive prevention
# measures, use derived "not served / no recent service" measures so colors and scores
# remain consistent across the app.
METRICS: dict[str, dict[str, Any]] = {
    # health outcomes
    "diabetes": dict(col="health_diabetes", label="Diabetes", short="Diabetes", topic="Health outcomes",
                     denom="adults 18+", desc="Diagnosed diabetes among adults 18+"),
    "bphigh": dict(col="health_bphigh", label="High blood pressure", short="High BP", topic="Health outcomes",
                   denom="adults 18+", desc="High blood pressure among adults 18+"),
    "chd": dict(col="health_chd", label="Coronary heart disease", short="Heart disease", topic="Health outcomes",
                denom="adults 18+", desc="Coronary heart disease among adults 18+"),
    "stroke": dict(col="health_stroke", label="Stroke", short="Stroke", topic="Health outcomes",
                   denom="adults 18+", desc="Stroke among adults 18+"),
    "copd": dict(col="health_copd", label="COPD", short="COPD", topic="Health outcomes",
                 denom="adults 18+", desc="Chronic obstructive pulmonary disease among adults 18+"),
    "cancer": dict(col="health_cancer", label="Cancer", short="Cancer", topic="Health outcomes",
                   denom="adults 18+", desc="Cancer, excluding non-melanoma skin cancer, among adults 18+"),
    "teethlost": dict(col="health_teethlost", label="All teeth lost (65+)", short="Teeth lost", topic="Health outcomes",
                      denom="adults 65+", desc="All natural teeth lost among adults 65+"),
    # mental and functional health
    "depression": dict(col="health_depression", label="Depression", short="Depression", topic="Mental & functional health",
                       denom="adults 18+", desc="Diagnosed depression among adults 18+"),
    "mhlth": dict(col="health_mhlth", label="Frequent poor mental health", short="Poor mental health", topic="Mental & functional health",
                  denom="adults 18+", desc="Frequent mental distress among adults 18+"),
    "phlth": dict(col="health_phlth", label="Frequent poor physical health", short="Poor physical health", topic="Mental & functional health",
                  denom="adults 18+", desc="Frequent physical distress among adults 18+"),
    "ghlth": dict(col="health_ghlth", label="Fair or poor health", short="Fair/poor health", topic="Mental & functional health",
                  denom="adults 18+", desc="Self-rated fair or poor health among adults 18+"),
    "disability": dict(col="health_disability", label="Any disability", short="Disability", topic="Mental & functional health",
                       denom="adults 18+", desc="Any disability among adults 18+"),
    # health behaviors
    "obesity": dict(col="health_obesity", label="Obesity", short="Obesity", topic="Health behaviors",
                    denom="adults 18+", desc="Obesity among adults 18+"),
    "smoking": dict(col="health_csmoking", label="Smoking", short="Smoking", topic="Health behaviors",
                    denom="adults 18+", desc="Current cigarette smoking among adults 18+"),
    "inactivity": dict(col="health_lpa", label="Physical inactivity", short="Inactivity", topic="Health behaviors",
                       denom="adults 18+", desc="No leisure-time physical activity among adults 18+"),
    "short_sleep": dict(col="health_sleep", label="Short sleep", short="Short sleep", topic="Health behaviors",
                        denom="adults 18+", desc="Short sleep duration among adults 18+"),
    "binge": dict(col="health_binge", label="Binge drinking", short="Binge drinking", topic="Health behaviors",
                  denom="adults 18+", desc="Binge drinking among adults 18+"),
    # access and prevention
    "uninsured": dict(col="health_access2", label="Uninsured", short="Uninsured", topic="Access & prevention",
                      denom="adults 18-64", desc="Lack of health insurance among adults 18-64"),
    "no_dental_visit": dict(expr="100 - health_dental", label="No recent dental visit", short="No dental visit", topic="Access & prevention",
                            denom="adults 18+", desc="Derived from dental visit prevalence; higher means fewer adults had a recent dental visit"),
    "no_checkup": dict(expr="100 - health_checkup", label="No annual checkup", short="No checkup", topic="Access & prevention",
                       denom="adults 18+", desc="Derived from annual checkup prevalence; higher means fewer adults had a recent checkup"),
    # health-related social needs
    "food_insecurity": dict(col="health_foodinsecu", label="Food insecurity", short="Food insecurity", topic="Health-related needs",
                            denom="adults 18+", desc="Food insecurity among adults 18+"),
    "housing_insecurity": dict(col="health_housinsecu", label="Housing insecurity", short="Housing insecurity", topic="Health-related needs",
                               denom="adults 18+", desc="Housing insecurity among adults 18+"),
    "transport_barriers": dict(col="health_lacktrpt", label="Transportation barriers", short="Transport barriers", topic="Health-related needs",
                               denom="adults 18+", desc="Transportation barriers among adults 18+"),
    "low_social_support": dict(col="health_emotionspt", label="Low social support", short="Low support", topic="Health-related needs",
                               denom="adults 18+", desc="Lack of social or emotional support among adults 18+"),
    "loneliness": dict(col="health_loneliness", label="Loneliness", short="Loneliness", topic="Health-related needs",
                       denom="adults 18+", desc="Loneliness among adults 18+"),
    "utility_threat": dict(col="health_shututility", label="Utility shutoff threat", short="Utility threat", topic="Health-related needs",
                           denom="adults 18+", desc="Threat of utility services shutoff among adults 18+"),
}

CONTEXT: dict[str, dict[str, str]] = {
    "adi_national_rank": dict(label="Area Deprivation Index rank", short="ADI", higher="more deprived"),
    "median_income_clean": dict(label="Median household income", short="Income", higher="higher income"),
    "poverty_pct": dict(label="Poverty rate", short="Poverty", higher="more poverty"),
    "college_pct": dict(label="College graduates", short="College+", higher="more college graduates"),
    "unemployed_pct": dict(label="Unemployment rate", short="Unemployment", higher="more unemployment"),
    "age65_pct": dict(label="Adults 65+", short="65+", higher="older population"),
    "black_pct": dict(label="Black population share", short="Black share", higher="larger Black population share"),
    "hispanic_pct": dict(label="Hispanic population share", short="Hispanic share", higher="larger Hispanic population share"),
    "population_density": dict(label="Population density", short="Density", higher="denser population"),
    "home_value_clean": dict(label="Median home value", short="Home value", higher="higher home value"),
}


def write(rel: str, obj: Any) -> None:
    path = DATA / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def finite_or_none(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, np.generic):
        return finite_or_none(v.item())
    return v


def records(df) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in df.to_dict("records"):
        out.append({k: finite_or_none(v) for k, v in row.items()})
    return out


def loess(x: np.ndarray, y: np.ndarray, grid: np.ndarray, frac: float = 0.35) -> list[list[float]]:
    n = len(x)
    if n == 0:
        return []
    k = max(min(int(frac * n), n), min(30, n))
    order = np.argsort(x)
    xs, ys = x[order], y[order]
    out: list[list[float]] = []
    for gx in grid:
        d = np.abs(xs - gx)
        idx = np.argsort(d)[:k]
        dx, dy = xs[idx], ys[idx]
        dmax = np.max(np.abs(dx - gx)) or 1.0
        w = (1 - (np.abs(dx - gx) / dmax) ** 3) ** 3
        w = np.clip(w, 0, None)
        if float(np.sum(w)) == 0:
            out.append([round(float(gx), 2), round(float(np.mean(dy)), 3)])
            continue
        sw = np.sum(w)
        mx = np.sum(w * dx) / sw
        my = np.sum(w * dy) / sw
        bx = np.sum(w * (dx - mx) * (dy - my))
        bxx = np.sum(w * (dx - mx) ** 2) or 1e-9
        slope = bx / bxx
        out.append([round(float(gx), 2), round(float(my + slope * (gx - mx)), 3)])
    return out


def main() -> None:
    if not RAW.exists():
        raise FileNotFoundError(RAW)
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    vintage = meta.get("source", {}).get("vintage", "CDC PLACES 2025")
    generated_at = meta.get("source", {}).get("accessed_at") or dt.datetime.now(dt.UTC).isoformat()
    generated_at = generated_at.replace("+00:00", "Z")

    state_case = sql_case(STATE_BY_FIPS, "state_fips")
    region_case = sql_case(REGION_BY_STATE, "state")
    metric_selects: list[str] = []
    for metric_id, cfg in METRICS.items():
        if "expr" in cfg:
            metric_selects.append(f"CASE WHEN {cfg['expr']} IS NULL THEN NULL ELSE {cfg['expr']} END AS {metric_id}")
        else:
            metric_selects.append(f"{clean_num(cfg['col'])} AS {metric_id}")

    con = duckdb.connect()
    src = f"read_parquet('{RAW.as_posix()}')"
    con.execute(
        f"""
        CREATE OR REPLACE TABLE j AS
        WITH base AS (
          SELECT
            GEOID AS zip,
            COALESCE(state_abbr, {state_case}) AS state,
            state_fips,
            county_fips,
            COALESCE(NULLIF(county_name, ''), NULLIF(cbsa_name, ''), 'ZCTA ' || GEOID) AS place,
            county_name,
            cbsa_code,
            cbsa_name,
            latitude AS lat,
            longitude AS lon,
            geometry IS NOT NULL AS has_geometry,
            population,
            population_density,
            is_urban,
            is_rural,
            {clean_num('adi_national_rank')} AS adi_national_rank,
            {clean_num('adi_state_decile')} AS adi_state_decile,
            {clean_num('median_income')} AS median_income_clean,
            {clean_num('median_home_value')} AS home_value_clean,
            {clean_pct('per_poverty')} AS poverty_pct,
            {clean_pct('per_college_above')} AS college_pct,
            {clean_pct('per_unemployed')} AS unemployed_pct,
            {clean_pct('per_65_over')} AS age65_pct,
            {clean_pct('per_black')} AS black_pct,
            {clean_pct('per_hispanic')} AS hispanic_pct,
            {clean_pct('per_white')} AS white_pct,
            {clean_pct('per_asian')} AS asian_pct,
            {clean_num('racial_diversity_index')} AS racial_diversity_index,
            health_n_measures,
            health_n_backfilled,
            health_source,
            {', '.join(metric_selects)}
          FROM {src}
        )
        SELECT *,
               {region_case} AS region
        FROM base
        """
    )
    n_total = con.execute("SELECT count(*) FROM j").fetchone()[0]

    source = places_source(vintage)
    catalog: list[dict[str, Any]] = []
    for metric_id, cfg in METRICS.items():
        row = records(con.execute(
            f"""
            SELECT count({metric_id}) n,
                   count(*) - count({metric_id}) miss,
                   min({metric_id}) mn,
                   max({metric_id}) mx,
                   quantile_cont({metric_id}, 0.02) p2,
                   quantile_cont({metric_id}, 0.50) p50,
                   quantile_cont({metric_id}, 0.90) p90,
                   quantile_cont({metric_id}, 0.98) p98,
                   sum({metric_id} * population) / sum(population)
                     FILTER (WHERE {metric_id} IS NOT NULL) bench,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND health_source = 'native') native_rows,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND health_source = 'mixed') mixed_rows,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND health_source = 'aggregated') aggregated_rows,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND NOT has_geometry) no_geometry_rows
            FROM j
            """
        ).fetchdf())[0]
        if row["n"] == 0:
            continue
        domain = [round(float(row["p2"]), 1), round(float(row["bench"]), 1), round(float(row["p98"]), 1)]
        source_column = cfg.get("col") or cfg.get("expr")
        catalog.append({
            "metric_id": metric_id,
            "label": cfg["label"],
            "short_label": cfg["short"],
            "topic": cfg["topic"],
            "unit": "percent",
            "format": ".1f",
            "lower_is_better": True,
            "domain": domain,
            "scale_kind": "sequential",
            "benchmark_kind": "national_pop_weighted",
            "benchmark": round(float(row["bench"]), 2),
            "p90": round(float(row["p90"]), 1),
            "denominator": cfg["denom"],
            "description": cfg["desc"],
            "source": source,
            "source_url": CDC_URL,
            "source_from": "parquet",
            "source_column": source_column,
            "source_year": 2025,
            "vintage_note": vintage,
            "confidence_interval_available": False,
            "suppression_rule": "CDC source gaps left null where neither native ZCTA nor tract aggregate is available",
            "missingness_note": f"{int(row['miss'])} of {n_total} ZCTAs missing",
            "n_zip": int(row["n"]),
            "missing_count": int(row["miss"]),
            "value_min": round(float(row["mn"]), 1),
            "value_max": round(float(row["mx"]), 1),
            "native_rows": int(row["native_rows"]),
            "mixed_rows": int(row["mixed_rows"]),
            "aggregated_rows": int(row["aggregated_rows"]),
            "no_geometry_rows": int(row["no_geometry_rows"]),
        })

        vals = con.execute(
            f"SELECT zip, round({metric_id}, 2) v FROM j WHERE {metric_id} IS NOT NULL"
        ).fetchall()
        write(f"map_values/{metric_id}.json", {
            "metric_id": metric_id,
            "join_key": "zip",
            "unit": "percent",
            "domain": domain,
            "benchmark": round(float(row["bench"]), 2),
            "values": {z: finite_or_none(v) for z, v in vals},
            "source": source,
            "source_year": 2025,
            "generated_at": generated_at,
        })

    write("metric_catalog.json", {
        "metrics": catalog,
        "default_metric": "diabetes",
        "generated_at": generated_at,
        "sources": {
            "pmtiles": PMTILES_URL,
            "parquet": str(RAW.relative_to(ROOT)).replace("\\", "/"),
            "metadata": str(META_PATH.relative_to(ROOT)).replace("\\", "/"),
        },
    })

    write("context_catalog.json", {
        "contexts": [
            {"context_id": k, "label": v["label"], "short_label": v["short"], "higher_means": v["higher"]}
            for k, v in CONTEXT.items()
        ],
        "default_context": "adi_national_rank",
        "generated_at": generated_at,
    })

    for metric in catalog:
        metric_id = metric["metric_id"]
        bench = metric["benchmark"]
        p90 = metric["p90"]
        fmt_label = metric["short_label"] or metric["label"]

        summ = records(con.execute(
            f"""
            SELECT count({metric_id}) n,
                   avg({metric_id}) mean,
                   sum(CASE WHEN {metric_id} >= {p90} THEN population ELSE 0 END) high_pop,
                   sum(population) tot_pop,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND health_source = 'native') native_rows,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND health_source = 'mixed') mixed_rows,
                   count(*) FILTER (WHERE {metric_id} IS NOT NULL AND health_source = 'aggregated') aggregated_rows
            FROM j
            WHERE {metric_id} IS NOT NULL
            """
        ).fetchdf())[0]

        def ranked(order: str) -> list[dict[str, Any]]:
            return records(con.execute(
                f"""
                SELECT zip, place AS city, state, round({metric_id}, 1) AS value,
                       population, round({metric_id} - {bench}, 1) AS gap,
                       health_source, health_n_backfilled
                FROM j
                WHERE {metric_id} IS NOT NULL
                ORDER BY {metric_id} {order}, population DESC
                LIMIT 20
                """
            ).fetchdf())

        lo_hi = con.execute(
            f"SELECT quantile_cont({metric_id}, 0.01), quantile_cont({metric_id}, 0.99) FROM j WHERE {metric_id} IS NOT NULL"
        ).fetchone()
        lo, hi = float(lo_hi[0]), float(lo_hi[1])
        if hi <= lo:
            hi = lo + 1
        edges = np.linspace(lo, hi, 41)
        counts = records(con.execute(
            f"""
            SELECT least(39, greatest(0, floor(({metric_id} - {lo}) / ({hi} - {lo}) * 40)))::INT b,
                   count(*) c
            FROM j
            WHERE {metric_id} IS NOT NULL
            GROUP BY b
            ORDER BY b
            """
        ).fetchdf())
        cmap = {int(r["b"]): int(r["c"]) for r in counts}
        bins = [
            {"x0": round(float(edges[i]), 2), "x1": round(float(edges[i + 1]), 2), "count": cmap.get(i, 0)}
            for i in range(40)
        ]

        corrs: list[dict[str, Any]] = []
        for ctx, cmeta in CONTEXT.items():
            rho, n = con.execute(
                f"""
                SELECT corr(rx, ry) rho, count(*) n
                FROM (
                  SELECT rank() OVER (ORDER BY {ctx}) rx,
                         rank() OVER (ORDER BY {metric_id}) ry
                  FROM j
                  WHERE {ctx} IS NOT NULL AND {metric_id} IS NOT NULL
                )
                """
            ).fetchone()
            corrs.append({
                "context": ctx,
                "label": cmeta["label"],
                "short": cmeta["short"],
                "rho": round(float(rho), 3) if rho is not None else None,
                "n": int(n),
            })
        corrs.sort(key=lambda d: abs(d["rho"] or 0), reverse=True)

        grad_rows = records(con.execute(
            f"""
            WITH d AS (
              SELECT {metric_id} v, population pop, adi_national_rank adi,
                     ntile(10) OVER (ORDER BY adi_national_rank) decile
              FROM j
              WHERE adi_national_rank IS NOT NULL AND {metric_id} IS NOT NULL
            )
            SELECT decile,
                   sum(v * pop) / sum(pop) wmean,
                   stddev_samp(v) sd,
                   count(*) n,
                   min(adi) adi_lo,
                   max(adi) adi_hi
            FROM d
            GROUP BY decile
            ORDER BY decile
            """
        ).fetchdf())
        gradient = []
        for g in grad_rows:
            se = (float(g["sd"] or 0) / (int(g["n"]) ** 0.5)) if g["n"] else 0
            wmean = float(g["wmean"])
            gradient.append({
                "decile": int(g["decile"]),
                "value": round(wmean, 2),
                "lci": round(wmean - 1.96 * se, 2),
                "uci": round(wmean + 1.96 * se, 2),
                "n": int(g["n"]),
                "adi_lo": round(float(g["adi_lo"]), 1),
                "adi_hi": round(float(g["adi_hi"]), 1),
            })
        gap_td = round(gradient[-1]["value"] - gradient[0]["value"], 1) if len(gradient) >= 2 else None

        full = con.execute(
            f"""
            SELECT zip, place AS city, state, adi_national_rank x, {metric_id} y, population
            FROM j
            WHERE adi_national_rank IS NOT NULL AND {metric_id} IS NOT NULL
            """
        ).fetchdf()
        xx, yy = full["x"].to_numpy(float), full["y"].to_numpy(float)
        if len(full) >= 2:
            gx = np.linspace(np.quantile(xx, 0.01), np.quantile(xx, 0.99), 40)
            loess_pts = loess(xx, yy, gx)
            lp = np.array(loess_pts)
            pred = np.interp(xx, lp[:, 0], lp[:, 1])
            full = full.assign(resid=yy - pred)
            worse = records(full.nlargest(8, "resid")[["zip", "city", "state", "x", "y", "resid"]].round(2))
            better = records(full.nsmallest(8, "resid")[["zip", "city", "state", "x", "y", "resid"]].round(2))
        else:
            loess_pts, worse, better = [], [], []
        sample = records(con.execute(
            f"""
            SELECT zip, round(adi_national_rank, 1) x, round({metric_id}, 1) y
            FROM j
            WHERE adi_national_rank IS NOT NULL AND {metric_id} IS NOT NULL
            USING SAMPLE 1800 ROWS (reservoir, 42)
            """
        ).fetchdf())

        write(f"charts/{metric_id}.json", {
            "metric_id": metric_id,
            "benchmark": bench,
            "high_burden_threshold": p90,
            "summary": {
                "national_average": bench,
                "unweighted_mean": round(float(summ["mean"]), 2),
                "n_zip": int(summ["n"]),
                "high_burden_population": int(summ["high_pop"]),
                "total_population": int(summ["tot_pop"]),
                "high_burden_pct_pop": round(100 * int(summ["high_pop"]) / max(int(summ["tot_pop"]), 1), 1),
                "native_rows": int(summ["native_rows"]),
                "mixed_rows": int(summ["mixed_rows"]),
                "aggregated_rows": int(summ["aggregated_rows"]),
            },
            "ranked_top": ranked("DESC"),
            "ranked_bottom": ranked("ASC"),
            "distribution": {"bins": bins, "benchmark": bench, "p90": p90},
            "correlations": corrs,
            "disparity_gradient": {"by": "adi_national_rank", "deciles": gradient, "top_minus_bottom": gap_td},
            "scatter": {
                "context": "adi_national_rank",
                "points": sample,
                "loess": loess_pts,
                "worse_than_expected": worse,
                "better_than_expected": better,
            },
            "source": source,
            "generated_at": generated_at,
        })

        topc = corrs[0] if corrs else None
        top_place = ranked("DESC")[0]
        insights = [{
            "insight_id": f"{metric_id}_national",
            "type": "benchmark",
            "rank": 1,
            "claim": f"The population-weighted U.S. average for {fmt_label.lower()} is {bench}%.",
            "value": bench,
            "supporting_geo_id": None,
            "supporting_chart": "distribution",
            "severity": "info",
            "method_note": "Population-weighted mean across ZCTAs with estimates.",
        }]
        if gap_td is not None:
            insights.append({
                "insight_id": f"{metric_id}_adi_gradient",
                "type": "adi_gradient",
                "rank": 2,
                "claim": f"The most-deprived ADI tenth averages {abs(gap_td)} points "
                         f"{'higher' if gap_td >= 0 else 'lower'} than the least-deprived tenth.",
                "value": gap_td,
                "supporting_geo_id": None,
                "supporting_chart": "disparity_gradient",
                "severity": "high" if abs(gap_td) >= 3 else "medium",
                "method_note": "Population-weighted ADI national-rank decile means; ecological, not causal.",
            })
        if topc and topc["rho"] is not None:
            insights.append({
                "insight_id": f"{metric_id}_corr",
                "type": "correlation",
                "rank": 3,
                "claim": f"Across ZCTAs, {fmt_label.lower()} is most associated with "
                         f"{topc['label'].lower()} (Spearman rho={topc['rho']}, n={topc['n']:,}).",
                "value": topc["rho"],
                "supporting_geo_id": None,
                "supporting_chart": "scatter",
                "severity": "info",
                "method_note": "Spearman rank correlation; place-level association only.",
            })
        insights.append({
            "insight_id": f"{metric_id}_top_place",
            "type": "extreme",
            "rank": 4,
            "claim": f"Highest-burden ZCTA: {top_place['zip']} ({top_place['city']}, {top_place['state']}) "
                     f"at {top_place['value']}%.",
            "value": top_place["value"],
            "supporting_geo_id": top_place["zip"],
            "supporting_chart": "ranked",
            "severity": "medium",
            "method_note": "Maximum ZCTA value; ties broken by population.",
        })
        insights.append({
            "insight_id": f"{metric_id}_high_pop",
            "type": "affected",
            "rank": 5,
            "claim": f"About {int(summ['high_pop']) / 1e6:.1f} million people live in ZCTAs at or above "
                     f"the high-burden threshold ({p90}%).",
            "value": int(summ["high_pop"]),
            "supporting_geo_id": None,
            "supporting_chart": "map",
            "severity": "medium",
            "method_note": f"Population in ZCTAs at or above the 90th percentile ({p90}%).",
        })
        write(f"insights/{metric_id}.json", {"metric_id": metric_id, "insights": insights, "generated_at": generated_at})

    geo_rows = records(con.execute(
        """
        SELECT zip, place, state, region, round(lat, 3) lat, round(lon, 3) lon, population,
               county_name, state_fips, health_source, health_n_measures, health_n_backfilled,
               round(adi_national_rank, 1) adi, round(median_income_clean, 0) income,
               round(poverty_pct, 1) poverty, round(college_pct, 1) college,
               round(black_pct, 1) black, round(hispanic_pct, 1) hispanic,
               round(age65_pct, 1) age65, is_urban, has_geometry
        FROM j
        """
    ).fetchdf())
    write("geo_catalog.json", {
        "fields": [
            "place", "state", "region", "lat", "lon", "pop", "county", "state_fips",
            "health_source", "health_n_measures", "health_n_backfilled", "adi", "income",
            "poverty", "college", "black", "hispanic", "age65", "is_urban", "has_geometry",
        ],
        "zips": {
            r["zip"]: [
                r["place"], r["state"], r["region"], r["lat"], r["lon"], int(r["population"]),
                r["county_name"], r["state_fips"], r["health_source"], int(r["health_n_measures"] or 0),
                int(r["health_n_backfilled"] or 0), r["adi"], r["income"], r["poverty"],
                r["college"], r["black"], r["hispanic"], r["age65"], bool(r["is_urban"]),
                bool(r["has_geometry"]),
            ]
            for r in geo_rows
        },
        "generated_at": generated_at,
    })

    regions = [{"id": "us", "label": "United States", "kind": "national",
                "bounds": [-125.0, 24.0, -66.5, 49.5], "default": True, "n_zip": n_total}]
    for kind, col in [("census_region", "region"), ("state", "state")]:
        rows = records(con.execute(
            f"""
            SELECT {col} id, count(*) n, min(lon) w, min(lat) s, max(lon) e, max(lat) nth
            FROM j
            WHERE {col} IS NOT NULL
              AND lat BETWEEN 18 AND 72
              AND lon BETWEEN -180 AND -60
              AND has_geometry
            GROUP BY {col}
            ORDER BY {col}
            """
        ).fetchdf())
        for r in rows:
            regions.append({
                "id": r["id"],
                "label": r["id"],
                "kind": kind,
                "n_zip": int(r["n"]),
                "bounds": [
                    round(float(r["w"]) - 0.4, 2), round(float(r["s"]) - 0.4, 2),
                    round(float(r["e"]) + 0.4, 2), round(float(r["nth"]) + 0.4, 2),
                ],
            })
    write("region_catalog.json", {"regions": regions, "generated_at": generated_at})

    coverage = {
        "generated_at": generated_at,
        "source_vintage": vintage,
        "source_limitations": meta.get("limitations", []),
        "rows": records(con.execute(
            """
            SELECT count(*) n_rows,
                   count(DISTINCT zip) n_unique_geoids,
                   count(*) FILTER (WHERE has_geometry) n_with_geometry,
                   count(*) FILTER (WHERE NOT has_geometry) n_without_geometry,
                   count(*) FILTER (WHERE health_source = 'native') n_native,
                   count(*) FILTER (WHERE health_source = 'mixed') n_mixed,
                   count(*) FILTER (WHERE health_source = 'aggregated') n_aggregated,
                   count(*) FILTER (WHERE health_source = 'none') n_no_health,
                   sum(health_n_backfilled) total_backfilled_cells
            FROM j
            """
        ).fetchdf())[0],
        "by_state": records(con.execute(
            """
            SELECT state, count(*) n,
                   count(*) FILTER (WHERE has_geometry) n_with_geometry,
                   count(*) FILTER (WHERE health_source = 'native') n_native,
                   count(*) FILTER (WHERE health_source = 'mixed') n_mixed,
                   count(*) FILTER (WHERE health_source = 'aggregated') n_aggregated,
                   count(*) FILTER (WHERE health_source = 'none') n_no_health,
                   sum(health_n_backfilled) total_backfilled_cells
            FROM j
            GROUP BY state
            ORDER BY state NULLS LAST
            """
        ).fetchdf()),
    }
    write("coverage_report.json", coverage)
    print(f"V2 payloads written: {len(catalog)} metrics, {n_total} ZCTAs, generated {generated_at}")


if __name__ == "__main__":
    main()
