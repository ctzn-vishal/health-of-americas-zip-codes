"""Phase 0 reviewer: adversarial join + value audit between the two sources.

- Confirms parquet (location_id ZIP) <-> tile_health.parquet (zip) overlap.
- Validates every health metric's distribution (range, percentiles, out-of-[0,100]).
- Computes population-weighted NATIONAL benchmarks (for 'gap' mode) and ramp domains.
- Writes data-prep/recon_join.json and a human data audit -> docs/data-audit.md
"""
from __future__ import annotations

import json
import pathlib

from env_tigris import connect, PARQUET_HTTPS, PARQUET_S3, PMTILES_URL

HERE = pathlib.Path(__file__).resolve().parent
DOCS = HERE.parent / "docs"
TILE_HEALTH = (HERE / "tile_health.parquet").as_posix()

# health metrics extracted from tiles + behavioral metrics from parquet
TILE_METRICS = [
    "arthritis", "bphigh", "cancer", "casthma", "chd", "copd", "depression",
    "diabetes", "ghlth", "highchol", "kidney", "mhlth", "phlth", "stroke", "teethlost",
]
PARQUET_METRICS = ["obesity_rate", "smoking_rate"]


def main() -> None:
    con, parquet = connect()
    P = f"read_parquet('{parquet}')"
    T = f"read_parquet('{TILE_HEALTH}')"

    # normalized parquet zip view
    con.execute(
        f"CREATE VIEW pq AS SELECT lpad(CAST(location_id AS VARCHAR),5,'0') AS zip, * FROM {P}"
    )
    con.execute(f"CREATE VIEW th AS SELECT * FROM {T}")

    n_pq = con.execute("SELECT count(*) FROM pq").fetchone()[0]
    n_th = con.execute("SELECT count(*) FROM th").fetchone()[0]
    n_overlap = con.execute("SELECT count(*) FROM pq JOIN th USING(zip)").fetchone()[0]
    pq_only = con.execute("SELECT count(*) FROM pq ANTI JOIN th USING(zip)").fetchone()[0]
    th_only = con.execute("SELECT count(*) FROM th ANTI JOIN pq USING(zip)").fetchone()[0]
    dup_pq = con.execute("SELECT count(*) FROM (SELECT zip FROM pq GROUP BY zip HAVING count(*)>1)").fetchone()[0]
    dup_th = con.execute("SELECT count(*) FROM (SELECT zip FROM th GROUP BY zip HAVING count(*)>1)").fetchone()[0]

    join = {
        "parquet_rows": n_pq,
        "tile_rows": n_th,
        "overlap": n_overlap,
        "parquet_only": pq_only,
        "tile_only": th_only,
        "overlap_pct_of_parquet": round(100 * n_overlap / n_pq, 2),
        "duplicate_zip_in_parquet": dup_pq,
        "duplicate_zip_in_tiles": dup_th,
    }

    # joined analysis table: tile health + parquet context + population
    con.execute(
        """
        CREATE VIEW j AS
        SELECT th.*, pq.population, pq.obesity_rate, pq.smoking_rate,
               pq.area_deprivation_index, pq.median_income, pq.percent_poverty,
               pq.percent_college_graduated, pq.percent_over_65
        FROM th JOIN pq USING(zip)
        """
    )

    def metric_stats(col: str, source: str) -> dict:
        tbl = "j" if source == "tile" else "j"  # both available on j after join
        row = con.execute(
            f"""
            SELECT count({col}) n, min({col}) mn, max({col}) mx, avg({col}) mean,
                   quantile_cont({col},0.02) p2, quantile_cont({col},0.5) p50,
                   quantile_cont({col},0.98) p98,
                   count(*) FILTER (WHERE {col} < 0 OR {col} > 100) AS out_of_pct_range,
                   sum({col}*population)/sum(population) FILTER (WHERE {col} IS NOT NULL) AS pop_wtd_mean
            FROM {tbl}
            """
        ).fetchdf().to_dict("records")[0]
        return {
            "n": int(row["n"]),
            "min": round(row["mn"], 3), "max": round(row["mx"], 3),
            "mean": round(row["mean"], 3),
            "p2": round(row["p2"], 3), "p50": round(row["p50"], 3), "p98": round(row["p98"], 3),
            "out_of_pct_range": int(row["out_of_pct_range"]),
            "pop_weighted_national": round(row["pop_wtd_mean"], 3),
            # ramp domain: [p2, pop-weighted national (mid for gap=benchmark), p98]
            "suggested_domain": [round(row["p2"], 1), round(row["pop_wtd_mean"], 1), round(row["p98"], 1)],
        }

    metrics = {}
    for m in TILE_METRICS:
        metrics[m] = {"source": "pmtiles", **metric_stats(m, "tile")}
    for m in PARQUET_METRICS:
        metrics[m] = {"source": "parquet", **metric_stats(m, "parquet")}

    # context distribution (ADI deciles sanity)
    adi = con.execute(
        "SELECT count(area_deprivation_index) n, min(area_deprivation_index) mn, "
        "max(area_deprivation_index) mx, avg(area_deprivation_index) mean FROM j"
    ).fetchdf().to_dict("records")[0]

    # spot-check 3 specific zips across both sources
    spot = con.execute(
        "SELECT zip, diabetes, obesity_rate, area_deprivation_index, population, median_income "
        "FROM j WHERE zip IN ('10001','60601','90011','99501') ORDER BY zip"
    ).fetchdf().to_dict("records")

    report = {
        "sources": {"parquet": [PARQUET_S3, PARQUET_HTTPS], "pmtiles": PMTILES_URL},
        "join": join,
        "metrics": metrics,
        "adi_summary": {k: (round(v, 3) if isinstance(v, float) else int(v)) for k, v in adi.items()},
        "spot_check_zips": spot,
    }
    (HERE / "recon_join.json").write_text(json.dumps(report, indent=2, default=str))
    print("wrote recon_join.json")
    print(json.dumps(join, indent=2))
    print("\nper-metric (n, range, pop-wtd national benchmark, suggested domain):")
    for m, s in metrics.items():
        print(f"  {m:<14} src={s['source']:<7} n={s['n']:<6} range=[{s['min']},{s['max']}] "
              f"bench={s['pop_weighted_national']} domain={s['suggested_domain']} oob={s['out_of_pct_range']}")
    print("\nspot check:", json.dumps(spot, indent=2, default=str))


if __name__ == "__main__":
    main()
