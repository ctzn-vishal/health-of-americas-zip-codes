"""V3 analytics: cross-measure structure payloads for the /stories section.

Reads the same raw parquet as prep_v2.py and emits precomputed analytical artifacts:

  analytics/correlations.json  26x26 Spearman matrix, hierarchically ordered, + context correlations
  analytics/pca.json           PCA on standardized measures: scree, loadings, biplot sample
  analytics/archetypes.json    k-means cluster profiles (z-scores, raw means, context, exemplars)
  analytics/gradients.json     ADI-decile gradient for every measure (slope-chart payload)
  analytics/dotmap.json        compact centroid arrays colored by PC1 percentile / archetype
  analytics/zip_axes.json      per-ZIP [cluster, pc1_percentile] for profile shards

Methods notes (mirrored on /methods):
  - Complete-case ZCTAs across all 26 measures; each ZCTA is one unweighted observation.
  - Measures standardized to z-scores before PCA / k-means.
  - PC1 is sign-oriented so that higher = more burden.
  - k for k-means chosen by silhouette score over k=3..8 on a fixed-seed sample.

Run from repo root AFTER prep_v2.py:
  python data-prep/analytics_v3.py
Then re-run from web/:
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
from scipy.cluster import hierarchy
from scipy.stats import spearmanr
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "raw_data" / "zcta_atlas.parquet"
DATA = ROOT / "web" / "public" / "data"
CATALOG = DATA / "metric_catalog.json"

SEED = 42

CONTEXT_COLS = {
    "adi": ("adi_national_rank", "ADI national rank", "more deprived"),
    "income": ("median_income", "Median household income", "higher income"),
    "poverty": ("per_poverty", "Poverty rate", "more poverty"),
    "college": ("per_college_above", "College graduates", "more college graduates"),
    "unemployed": ("per_unemployed", "Unemployment", "more unemployment"),
    "age65": ("per_65_over", "Adults 65+", "older population"),
    "black": ("per_black", "Black population share", "larger Black share"),
    "hispanic": ("per_hispanic", "Hispanic population share", "larger Hispanic share"),
    "density": ("population_density", "Population density", "denser"),
    "home_value": ("median_home_value", "Median home value", "higher home value"),
}

# Hand-written archetype labels, keyed by burden-ordered cluster index (0 = lowest
# overall burden after ordering by mean PC1). Written against the k=4 solution of the
# 2025 PLACES release; revisit if the cluster solution changes materially.
ARCHETYPE_LABELS: dict[int, dict[str, str]] = {
    0: dict(
        label="Comfortable suburbs",
        blurb="Affluent, college-educated suburban ZCTAs that sit below the national average on "
              "nearly every measure at once — the health advantages of money and place compound.",
    ),
    1: dict(
        label="Young metro strivers",
        blurb="Dense, young, diverse metro ZCTAs. Chronic disease is low — largely an age-structure "
              "effect — but loneliness, skipped checkups, and housing strain run well above average.",
    ),
    2: dict(
        label="Aging small towns",
        blurb="Low-density, older small-town and rural ZCTAs. Chronic conditions sit moderately "
              "above average, consistent with an older population, while social needs stay near the norm.",
    ),
    3: dict(
        label="Left-behind communities",
        blurb="High-poverty ZCTAs, disproportionately Black and Southern, where chronic disease, "
              "behavioral risk, and health-related social needs are all elevated together.",
    ),
}


def write(rel: str, obj: Any) -> None:
    path = DATA / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def f(v: Any, nd: int = 3) -> Any:
    if v is None:
        return None
    v = float(v)
    if math.isnan(v) or math.isinf(v):
        return None
    return round(v, nd)


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    metrics = catalog["metrics"]
    ids = [m["metric_id"] for m in metrics]
    by_id = {m["metric_id"]: m for m in metrics}
    generated_at = dt.datetime.now(dt.UTC).isoformat().replace("+00:00", "Z")

    # Re-derive the measure columns exactly as prep_v2 does (sentinels -> NULL, derived gaps).
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
    metric_sql = ", ".join(f"({expr}) AS {mid}" for mid, expr in col_for.items())
    pct_cols = {"per_poverty", "per_college_above", "per_unemployed", "per_65_over", "per_black", "per_hispanic"}
    ctx_sql = ", ".join(
        (f"CASE WHEN {col} < 0 THEN NULL ELSE {col} * 100 END AS ctx_{key}"
         if col in pct_cols
         else f"CASE WHEN {col} < 0 THEN NULL ELSE {col} END AS ctx_{key}")
        for key, (col, _, _) in CONTEXT_COLS.items()
    )

    con = duckdb.connect()
    df = con.execute(
        f"""
        SELECT GEOID AS zip,
               COALESCE(NULLIF(county_name, ''), NULLIF(cbsa_name, ''), 'ZCTA ' || GEOID) AS place,
               state_abbr AS state,
               population, latitude AS lat, longitude AS lon,
               geometry IS NOT NULL AS has_geometry,
               is_urban,
               {ctx_sql},
               {metric_sql}
        FROM read_parquet('{RAW.as_posix()}')
        """
    ).fetchdf()

    complete = df.dropna(subset=ids).reset_index(drop=True)
    n = len(complete)
    print(f"complete-case ZCTAs across {len(ids)} measures: {n} of {len(df)}")

    M = complete[ids].to_numpy(float)  # n x 26 raw values
    mu, sd = M.mean(axis=0), M.std(axis=0, ddof=1)
    Z = (M - mu) / sd

    # ---------------- correlations ----------------
    rho, _ = spearmanr(M)  # 26x26
    dist = 1 - rho
    np.fill_diagonal(dist, 0)
    order = hierarchy.leaves_list(
        hierarchy.optimal_leaf_ordering(
            hierarchy.linkage(dist[np.triu_indices(len(ids), 1)], method="average"),
            dist[np.triu_indices(len(ids), 1)],
        )
    )
    ordered_ids = [ids[i] for i in order]
    rho_o = rho[np.ix_(order, order)]

    ctx_keys = list(CONTEXT_COLS.keys())
    ctx_mat = []
    for mid in ordered_ids:
        row = []
        mvals = complete[mid].to_numpy(float)
        for key in ctx_keys:
            cv = complete[f"ctx_{key}"].to_numpy(float)
            mask = ~np.isnan(cv)
            r = spearmanr(mvals[mask], cv[mask]).statistic if mask.sum() > 100 else None
            row.append(f(r, 2))
        ctx_mat.append(row)

    pairs = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            pairs.append((ids[i], ids[j], float(rho[i, j])))
    pairs.sort(key=lambda t: -abs(t[2]))

    write("analytics/correlations.json", {
        "n": n,
        "method": "Spearman rank correlation over complete-case ZCTAs; ordered by average-linkage hierarchical clustering on 1 - rho with optimal leaf ordering.",
        "ids": ordered_ids,
        "labels": [by_id[i]["short_label"] for i in ordered_ids],
        "topics": [by_id[i]["topic"] for i in ordered_ids],
        "matrix": [[f(v, 2) for v in row] for row in rho_o],
        "context_keys": ctx_keys,
        "context_labels": [CONTEXT_COLS[k][1] for k in ctx_keys],
        "context_higher": [CONTEXT_COLS[k][2] for k in ctx_keys],
        "context_matrix": ctx_mat,
        "top_pairs": [
            {"a": a, "b": b, "rho": f(r, 2),
             "a_label": by_id[a]["short_label"], "b_label": by_id[b]["short_label"]}
            for a, b, r in pairs[:12]
        ],
        "generated_at": generated_at,
    })

    # ---------------- PCA ----------------
    pca = PCA(n_components=10, random_state=SEED)
    scores = pca.fit_transform(Z)
    load = pca.components_  # 10 x 26
    # Orient PC1: higher = more burden (positive average loading); PC2: positive = older/rural pole
    if load[0].mean() < 0:
        load[0] *= -1
        scores[:, 0] *= -1
    if load[1][ids.index("binge")] > 0:  # orient PC2 so binge/urban pole is negative end
        load[1] *= -1
        scores[:, 1] *= -1

    pc1_pct = (np.argsort(np.argsort(scores[:, 0])) / (n - 1) * 100)

    pc_ctx = []
    for pc in range(3):
        row = {}
        for key in ctx_keys:
            cv = complete[f"ctx_{key}"].to_numpy(float)
            mask = ~np.isnan(cv)
            row[key] = f(spearmanr(scores[mask, pc], cv[mask]).statistic, 2)
        pc_ctx.append(row)

    rng = np.random.default_rng(SEED)
    samp = rng.choice(n, size=min(4500, n), replace=False)
    samp = samp[np.argsort(samp)]
    inc = complete["ctx_income"].to_numpy(float)
    adi = complete["ctx_adi"].to_numpy(float)
    # The parquet's is_urban flag is 1 for every row (broken upstream); classify density
    # >= 1000 people/sq mi as "dense" instead, a common urbanized-area cutoff.
    urb = (complete["ctx_density"].fillna(0) >= 1000).to_numpy(bool)
    pops = complete["population"].fillna(0).to_numpy(float)

    write("analytics/pca.json", {
        "n": n,
        "method": "PCA on z-standardized measures over complete-case ZCTAs (unweighted). PC1 sign-oriented so higher = more burden.",
        "ids": ids,
        "labels": [by_id[i]["short_label"] for i in ids],
        "topics": [by_id[i]["topic"] for i in ids],
        "explained": [f(v, 4) for v in pca.explained_variance_ratio_],
        "loadings": [[f(v, 3) for v in load[pc]] for pc in range(3)],
        "pc_context": pc_ctx,
        "context_labels": {k: CONTEXT_COLS[k][1] for k in ctx_keys},
        "scatter": {
            "zip": [complete["zip"][i] for i in samp],
            "state": [complete["state"][i] if isinstance(complete["state"][i], str) else None for i in samp],
            "pc1": [f(scores[i, 0], 2) for i in samp],
            "pc2": [f(scores[i, 1], 2) for i in samp],
            "adi": [f(adi[i], 1) for i in samp],
            "income": [f(inc[i], 0) for i in samp],
            "dense": [bool(urb[i]) for i in samp],
            "pop": [int(pops[i]) for i in samp],
        },
        "generated_at": generated_at,
    })

    # ---------------- archetypes (k-means) ----------------
    sil_sample = rng.choice(n, size=min(6000, n), replace=False)
    best_k, best_sil = None, -1
    for k in range(3, 9):
        km = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit(Z)
        sil = silhouette_score(Z[sil_sample], km.labels_[sil_sample])
        print(f"k={k} silhouette={sil:.4f} inertia={km.inertia_:.0f}")
        if sil > best_sil:
            best_k, best_sil = k, sil
    k = best_k
    km = KMeans(n_clusters=k, n_init=25, random_state=SEED).fit(Z)
    labels = km.labels_

    # Order clusters by mean PC1 (overall burden), re-index 0..k-1
    burden = [scores[labels == c, 0].mean() for c in range(k)]
    remap = {old: new for new, old in enumerate(np.argsort(burden))}
    labels = np.array([remap[c] for c in labels])
    centers = km.cluster_centers_[np.argsort(burden)]

    clusters = []
    for c in range(k):
        mask = labels == c
        sub = complete[mask]
        zc = Z[mask].mean(axis=0)
        raw = M[mask].mean(axis=0)
        d = np.linalg.norm(Z[mask] - centers[c], axis=1)
        near = sub.iloc[np.argsort(d)[:60]]
        exemplars = near.nlargest(4, "population")[["zip", "place", "state", "population"]]
        ctx = {}
        for key in ctx_keys:
            cv = sub[f"ctx_{key}"].to_numpy(float)
            ctx[key] = f(np.nanmean(cv), 1)
        meta = ARCHETYPE_LABELS.get(c, {})
        clusters.append({
            "id": c,
            "n": int(mask.sum()),
            "pop": int(sub["population"].fillna(0).sum()),
            "share": f(mask.mean(), 3),
            "label": meta.get("label", f"Cluster {c + 1}"),
            "blurb": meta.get("blurb", ""),
            "dense_share": f(float((sub["ctx_density"].fillna(0) >= 1000).mean()), 3),
            "pc1_mean": f(scores[mask, 0].mean(), 2),
            "z": {mid: f(zc[i], 2) for i, mid in enumerate(ids)},
            "raw": {mid: f(raw[i], 1) for i, mid in enumerate(ids)},
            "context": ctx,
            "exemplars": [
                {"zip": r.zip, "place": r.place, "state": r.state, "pop": int(r.population)}
                for r in exemplars.itertuples()
            ],
        })

    write("analytics/archetypes.json", {
        "k": k,
        "n": n,
        "silhouette": f(best_sil, 3),
        "method": "k-means on z-standardized measures (complete-case ZCTAs); k chosen by silhouette over k=3..8; clusters ordered by mean PC1 burden.",
        "ids": ids,
        "labels": [by_id[i]["short_label"] for i in ids],
        "topics": [by_id[i]["topic"] for i in ids],
        "context_labels": {key: CONTEXT_COLS[key][1] for key in ctx_keys},
        "clusters": clusters,
        "generated_at": generated_at,
    })

    # ---------------- ADI gradients (slope-chart payload) ----------------
    grads = []
    adi_all = df["ctx_adi"].to_numpy(float)
    pop_all = df["population"].fillna(0).to_numpy(float)
    ok = ~np.isnan(adi_all)
    dec_edges = np.nanquantile(adi_all[ok], np.linspace(0, 1, 11))
    for mid in ids:
        v = df[mid].to_numpy(float)
        m2 = ok & ~np.isnan(v)
        dec = np.clip(np.searchsorted(dec_edges[1:-1], adi_all[m2], side="right"), 0, 9)
        means = []
        for dd in range(10):
            sel = dec == dd
            w = pop_all[m2][sel]
            means.append(f(np.average(v[m2][sel], weights=np.where(w > 0, w, 1)), 2))
        grads.append({
            "id": mid,
            "short": by_id[mid]["short_label"],
            "topic": by_id[mid]["topic"],
            "benchmark": by_id[mid]["benchmark"],
            "d": means,
            "gap": f(means[9] - means[0], 1),
            "rel": f(means[9] / means[0], 2) if means[0] else None,
        })
    grads.sort(key=lambda g: -(g["rel"] or 0))
    write("analytics/gradients.json", {
        "method": "Population-weighted mean by ADI national-rank decile (1 = least deprived).",
        "metrics": grads,
        "generated_at": generated_at,
    })

    # ---------------- dot map + per-ZIP axes ----------------
    geo_mask = complete["has_geometry"].to_numpy(bool)
    lat = complete["lat"].to_numpy(float)
    lon = complete["lon"].to_numpy(float)
    inb = geo_mask & (lat > 17) & (lat < 72) & (lon > -180) & (lon < -60)
    write("analytics/dotmap.json", {
        "n": int(inb.sum()),
        "lon": [f(x, 2) for x in lon[inb]],
        "lat": [f(x, 2) for x in lat[inb]],
        "pc1": [int(round(p)) for p in pc1_pct[inb]],
        "cluster": [int(c) for c in labels[inb]],
        "pop": [int(p) for p in pops[inb]],
        "generated_at": generated_at,
    })

    write("analytics/zip_axes.json", {
        "fields": ["cluster", "pc1_pct"],
        "zips": {complete["zip"][i]: [int(labels[i]), int(round(pc1_pct[i]))] for i in range(n)},
        "generated_at": generated_at,
    })

    print(f"analytics payloads written: k={k} archetypes, PC1 explains {pca.explained_variance_ratio_[0]:.1%}")
    print("\ncluster summary (for labeling):")
    for c in clusters:
        zs = sorted(c["z"].items(), key=lambda t: -abs(t[1] or 0))[:5]
        print(f"  #{c['id']}: n={c['n']:>5} pop={c['pop']/1e6:5.1f}M dense={c['dense_share']:.0%} "
              f"income=${c['context']['income']:,.0f} adi={c['context']['adi']} | " +
              ", ".join(f"{m}={v:+.1f}" for m, v in zs))


if __name__ == "__main__":
    main()
