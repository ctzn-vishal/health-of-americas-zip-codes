"""Wealth-gradient story payload for /stories/wealth-gap.

Reads raw_data/zcta_atlas.parquet and emits:

  web/public/data/analytics/wealth_gap.json

The score is a socioeconomic advantage index, not direct household wealth:
income, college attainment, home value, reversed ADI, reversed poverty, and
reversed unemployment are converted to within-sample rank percentiles and
averaged. Top/bottom groups are ZIP/ZCTA deciles of that composite score.

Run from repo root:
  python data-prep/analytics_wealth.py
"""
from __future__ import annotations

import datetime as dt
import json
import math
import pathlib
from typing import Any

import duckdb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "raw_data" / "zcta_atlas.parquet"
DATA = ROOT / "web" / "public" / "data"
CATALOG = DATA / "metric_catalog.json"

MIN_POPULATION = 500

WEALTH_INPUTS = [
    {
        "key": "income",
        "column": "median_income",
        "label": "Median household income",
        "short": "Income",
        "higher_means": "higher income",
        "unit": "dollars",
        "score_direction": 1,
    },
    {
        "key": "college",
        "column": "per_college_above",
        "label": "College graduates",
        "short": "College+",
        "higher_means": "more college graduates",
        "unit": "percent",
        "score_direction": 1,
    },
    {
        "key": "home_value",
        "column": "median_home_value",
        "label": "Median home value",
        "short": "Home value",
        "higher_means": "higher home value",
        "unit": "dollars",
        "score_direction": 1,
    },
    {
        "key": "adi",
        "column": "adi_national_rank",
        "label": "Area Deprivation Index rank",
        "short": "ADI",
        "higher_means": "more deprived",
        "unit": "percentile",
        "score_direction": -1,
    },
    {
        "key": "poverty",
        "column": "per_poverty",
        "label": "Poverty rate",
        "short": "Poverty",
        "higher_means": "more poverty",
        "unit": "percent",
        "score_direction": -1,
    },
    {
        "key": "unemployed",
        "column": "per_unemployed",
        "label": "Unemployment rate",
        "short": "Unemployment",
        "higher_means": "more unemployment",
        "unit": "percent",
        "score_direction": -1,
    },
]

PCT_COLS = {"per_college_above", "per_poverty", "per_unemployed"}


def write(rel: str, obj: Any) -> None:
    path = DATA / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def clean(v: Any, nd: int = 2) -> Any:
    if v is None:
        return None
    v = float(v)
    if math.isnan(v) or math.isinf(v):
        return None
    return round(v, nd)


def weighted_mean(values: pd.Series | np.ndarray, weights: pd.Series | np.ndarray, nd: int = 2) -> Any:
    vv = np.asarray(values, dtype=float)
    ww = np.asarray(weights, dtype=float)
    mask = ~np.isnan(vv)
    if not mask.any():
        return None
    ww = np.where((ww > 0) & ~np.isnan(ww), ww, 1.0)
    return clean(np.average(vv[mask], weights=ww[mask]), nd)


def percentile_rank(values: pd.Series) -> pd.Series:
    # 0..100, average-tie ranked, with the lowest observed value at 0.
    r = values.rank(method="average")
    n = values.notna().sum()
    if n <= 1:
        return pd.Series(np.nan, index=values.index)
    return (r - 1) / (n - 1) * 100


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    metrics = catalog["metrics"]
    ids = [m["metric_id"] for m in metrics]
    by_id = {m["metric_id"]: m for m in metrics}
    generated_at = dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")

    derived = {
        "no_dental_visit": "100 - health_dental",
        "no_checkup": "100 - health_checkup",
    }
    col_for = {}
    for m in metrics:
        mid = m["metric_id"]
        if mid in derived:
            col_for[mid] = derived[mid]
        else:
            src = m["source_column"]
            col_for[mid] = f"CASE WHEN {src} < 0 THEN NULL ELSE {src} END"

    wealth_sql = []
    for w in WEALTH_INPUTS:
        col = w["column"]
        expr = f"CASE WHEN {col} < 0 THEN NULL ELSE {col} END"
        if col in PCT_COLS:
            expr = f"({expr}) * 100"
        wealth_sql.append(f"{expr} AS wealth_{w['key']}")

    metric_sql = ", ".join(f"({expr}) AS {mid}" for mid, expr in col_for.items())
    con = duckdb.connect()
    df = con.execute(
        f"""
        SELECT GEOID AS zip,
               COALESCE(NULLIF(county_name, ''), NULLIF(cbsa_name, ''), 'ZCTA ' || GEOID) AS place,
               state_abbr AS state,
               population,
               {", ".join(wealth_sql)},
               {metric_sql}
        FROM read_parquet('{RAW.as_posix()}')
        """
    ).fetchdf()

    wealth_keys = [f"wealth_{w['key']}" for w in WEALTH_INPUTS]
    eligible = df.dropna(subset=wealth_keys + ids).copy()
    eligible = eligible[eligible["population"].fillna(0) >= MIN_POPULATION].reset_index(drop=True)

    for w in WEALTH_INPUTS:
        key = f"wealth_{w['key']}"
        signed = eligible[key] * w["score_direction"]
        eligible[f"score_{w['key']}"] = percentile_rank(signed)
    score_cols = [f"score_{w['key']}" for w in WEALTH_INPUTS]
    eligible["wealth_score"] = eligible[score_cols].mean(axis=1)
    eligible["wealth_score_pct"] = percentile_rank(eligible["wealth_score"])

    q10, q90 = eligible["wealth_score"].quantile([0.1, 0.9])
    bottom = eligible[eligible["wealth_score"] <= q10].copy()
    top = eligible[eligible["wealth_score"] >= q90].copy()
    national = eligible.copy()

    corr_matrix = []
    for i, wi in enumerate(WEALTH_INPUTS):
      row = []
      xi = eligible[f"wealth_{wi['key']}"].to_numpy(float)
      for j, wj in enumerate(WEALTH_INPUTS):
          xj = eligible[f"wealth_{wj['key']}"].to_numpy(float)
          row.append(clean(spearmanr(xi, xj).statistic, 2) if i != j else 1.0)
      corr_matrix.append(row)

    score_correlations = [
        {
            "key": w["key"],
            "rho": clean(spearmanr(eligible[f"wealth_{w['key']}"], eligible["wealth_score"]).statistic, 2),
            "aligned_rho": clean(spearmanr(eligible[f"score_{w['key']}"], eligible["wealth_score"]).statistic, 2),
        }
        for w in WEALTH_INPUTS
    ]

    def group_payload(name: str, label: str, frame: pd.DataFrame) -> dict[str, Any]:
        pop = frame["population"].fillna(0)
        return {
            "id": name,
            "label": label,
            "n": int(len(frame)),
            "population": int(pop.sum()),
            "score": clean(frame["wealth_score"].mean(), 1),
            "score_pct": clean(frame["wealth_score_pct"].mean(), 1),
            "components": {
                w["key"]: {
                    "raw": weighted_mean(frame[f"wealth_{w['key']}"], pop, 1),
                    "score": clean(frame[f"score_{w['key']}"].mean(), 1),
                }
                for w in WEALTH_INPUTS
            },
        }

    groups = [
        group_payload("bottom", "Bottom wealth decile", bottom),
        group_payload("national", "Eligible ZIP/ZCTA average", national),
        group_payload("top", "Top wealth decile", top),
    ]

    def health_mean(frame: pd.DataFrame, mid: str) -> Any:
        return weighted_mean(frame[mid], frame["population"].fillna(0), 2)

    health_rows = []
    for mid in ids:
        tv = health_mean(top, mid)
        bv = health_mean(bottom, mid)
        nv = health_mean(national, mid)
        gap = clean(bv - tv, 2) if bv is not None and tv is not None else None
        ratio = clean(bv / tv, 2) if bv is not None and tv not in (None, 0) else None
        health_rows.append(
            {
                "id": mid,
                "label": by_id[mid]["label"],
                "short": by_id[mid]["short_label"],
                "topic": by_id[mid]["topic"],
                "top": tv,
                "bottom": bv,
                "national": nv,
                "gap": gap,
                "ratio": ratio,
            }
        )
    health_rows.sort(key=lambda r: (r["gap"] is not None, r["gap"] or -999), reverse=True)

    dec_edges = np.quantile(eligible["wealth_score"], np.linspace(0, 1, 11))
    dec = np.clip(np.searchsorted(dec_edges[1:-1], eligible["wealth_score"], side="right"), 0, 9)
    eligible["wealth_decile"] = dec + 1
    deciles = []
    for d in range(1, 11):
        frame = eligible[eligible["wealth_decile"] == d]
        pop = frame["population"].fillna(0)
        deciles.append(
            {
                "decile": d,
                "n": int(len(frame)),
                "population": int(pop.sum()),
                "score_lo": clean(frame["wealth_score"].min(), 1),
                "score_hi": clean(frame["wealth_score"].max(), 1),
                "score": clean(frame["wealth_score"].mean(), 1),
                "metrics": {mid: health_mean(frame, mid) for mid in ids},
            }
        )

    worst = max((r for r in health_rows if r["gap"] is not None), key=lambda r: r["gap"])
    reverse = [r for r in health_rows if r["gap"] is not None and r["gap"] < 0]

    write(
        "analytics/wealth_gap.json",
        {
            "n": int(len(eligible)),
            "min_population": MIN_POPULATION,
            "method": (
                "Complete-case ZIP/ZCTA areas with at least 500 residents. Wealth score is the "
                "mean of rank percentiles for income, college attainment, home value, reversed "
                "ADI, reversed poverty, and reversed unemployment. Group health rates are "
                "population-weighted means."
            ),
            "score": {
                "definition": "Mean aligned rank percentile across six socioeconomic advantage indicators.",
                "bottom_cutoff": clean(q10, 1),
                "top_cutoff": clean(q90, 1),
                "worse_count": int(sum(1 for r in health_rows if (r["gap"] or 0) > 0)),
                "reverse_count": int(len(reverse)),
                "largest_gap_metric": worst["id"],
                "largest_gap_points": worst["gap"],
                "largest_gap_ratio": worst["ratio"],
            },
            "inputs": [
                {
                    "key": w["key"],
                    "label": w["label"],
                    "short": w["short"],
                    "higher_means": w["higher_means"],
                    "unit": w["unit"],
                    "score_direction": w["score_direction"],
                }
                for w in WEALTH_INPUTS
            ],
            "correlation": {
                "method": "Spearman rank correlation across eligible ZIP/ZCTA areas.",
                "keys": [w["key"] for w in WEALTH_INPUTS],
                "labels": [w["short"] for w in WEALTH_INPUTS],
                "higher": [w["higher_means"] for w in WEALTH_INPUTS],
                "matrix": corr_matrix,
                "score": score_correlations,
            },
            "groups": groups,
            "metrics": health_rows,
            "deciles": deciles,
            "generated_at": generated_at,
        },
    )

    print(
        f"wealth_gap.json written: n={len(eligible):,}, "
        f"bottom={len(bottom):,}, top={len(top):,}, "
        f"{sum(1 for r in health_rows if (r['gap'] or 0) > 0)} of {len(ids)} worse in bottom decile"
    )
    print(
        f"largest gap: {worst['short']} {worst['bottom']}% vs {worst['top']}% "
        f"({worst['gap']} pts, {worst['ratio']}x)"
    )


if __name__ == "__main__":
    main()
