"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useUrlState } from "@/lib/urlState";
import {
  loadCharts, loadComposite, loadGeoCatalog, loadInsights, loadMapValues, loadMetricCatalog,
  loadMetricDistributions, loadProfileShard, loadRegionCatalog, loadStateSummary,
} from "@/lib/data";
import { percentileOf, valueFmt, fmtPop } from "@/lib/format";
import { COMPOSITE_META } from "@/lib/snapshot";
import type {
  ChartsPayload, GeoCatalog, InsightsPayload, MapValues, MetricCatalog, MetricDistributions,
  MetricMeta, Mode, ProfileZip, RegionCatalog, StateSummary,
} from "@/lib/types";
import Controls from "./Controls";
import Legend from "./Legend";
import InsightRail from "./InsightRail";
import ZipCard from "./ZipCard";
import ZipSearch from "./search/ZipSearch";
import SnapshotScoreCard from "./snapshot/SnapshotScoreCard";
import HealthSnapshot from "./snapshot/HealthSnapshot";

const US_BOUNDS: [number, number, number, number] = [-125, 24, -66.5, 49.5];

const MapChoropleth = dynamic(() => import("./MapChoropleth"), {
  ssr: false,
  loading: () => <div className="map-canvas" style={{ display: "grid", placeItems: "center" }}><span className="muted">Loading map…</span></div>,
});
const RankedDotPlot = dynamic(() => import("./panels/RankedDotPlot"), { ssr: false, loading: () => <PanelSkeleton /> });
const Distribution = dynamic(() => import("./panels/Distribution"), { ssr: false, loading: () => <PanelSkeleton /> });
const ScatterLoess = dynamic(() => import("./panels/ScatterLoess"), { ssr: false, loading: () => <PanelSkeleton /> });
const DisparityGradient = dynamic(() => import("./panels/DisparityGradient"), { ssr: false, loading: () => <PanelSkeleton /> });

function PanelSkeleton() {
  return <div style={{ height: 300, display: "grid", placeItems: "center" }} className="muted">Loading chart…</div>;
}

const PANELS: { Cmp: any; title: string; sub: string }[] = [
  { Cmp: DisparityGradient, title: "The deprivation gradient", sub: "Population-weighted average across Area Deprivation Index deciles, with 95% confidence band." },
  { Cmp: RankedDotPlot, title: "Highest- and lowest-burden ZIP codes", sub: "Each ZIP against the U.S. average. Hover or focus a row to highlight it on the map." },
  { Cmp: Distribution, title: "How ZIP codes are distributed", sub: "Count of ZIP codes by value, with the U.S. average and high-burden threshold marked." },
  { Cmp: ScatterLoess, title: "Health vs. area deprivation", sub: "Each point is a ZIP code. The line is a LOESS trend. Association is ecological, not causal." },
];

export default function AppClient() {
  const [state, setState] = useUrlState();
  const isSnap = state.view === "snapshot";

  const [catalog, setCatalog] = useState<MetricCatalog | null>(null);
  const [regions, setRegions] = useState<RegionCatalog | null>(null);
  const [geo, setGeo] = useState<GeoCatalog | null>(null);

  // measure-view payloads
  const [mapValues, setMapValues] = useState<MapValues | null>(null);
  const [charts, setCharts] = useState<ChartsPayload | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  // snapshot-view payloads
  const [composite, setComposite] = useState<MapValues | null>(null);
  const [dists, setDists] = useState<MetricDistributions | null>(null);
  const [stateSummary, setStateSummary] = useState<StateSummary | null>(null);
  const [profile, setProfile] = useState<ProfileZip | null>(null);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overMap, setOverMap] = useState(false);

  useEffect(() => {
    loadMetricCatalog().then(setCatalog).catch(() => {});
    loadRegionCatalog().then(setRegions).catch(() => {});
    loadGeoCatalog().then(setGeo).catch(() => {});
  }, []);

  const meta: MetricMeta | null = useMemo(() => {
    if (!catalog) return null;
    return catalog.metrics.find((m) => m.metric_id === state.metric) ?? catalog.metrics.find((m) => m.metric_id === catalog.default_metric) ?? catalog.metrics[0];
  }, [catalog, state.metric]);
  const metricInvalid = !!catalog && !catalog.metrics.some((m) => m.metric_id === state.metric);

  // measure payloads (skip in snapshot view)
  useEffect(() => {
    if (!meta || isSnap) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadMapValues(meta.metric_id), loadCharts(meta.metric_id), loadInsights(meta.metric_id)])
      .then(([mv, ch, ins]) => {
        if (!alive) return;
        setMapValues(mv); setCharts(ch); setInsights(ins); setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [meta, isSnap]);

  // snapshot base payloads (composite map + distributions + state means)
  useEffect(() => {
    if (!isSnap) return;
    loadComposite().then(setComposite).catch(() => {});
    loadMetricDistributions().then(setDists).catch(() => {});
    loadStateSummary().then(setStateSummary).catch(() => {});
  }, [isSnap]);

  // selected ZIP profile (used by the snapshot)
  useEffect(() => {
    const z = state.selected;
    if (!z) { setProfile(null); return; }
    let alive = true;
    loadProfileShard(z.slice(0, 2)).then((sh) => { if (alive) setProfile(sh.zips[z] ?? null); }).catch(() => alive && setProfile(null));
    return () => { alive = false; };
  }, [state.selected]);

  // map framing: zoom to the selected ZIP's metro, else the chosen region
  const bounds = useMemo<[number, number, number, number]>(() => {
    const rec = state.selected && geo ? geo.zips[state.selected] : undefined;
    if (rec) {
      const lat = rec[3], lon = rec[4];
      const dLat = 0.55;
      const dLon = 0.55 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
      return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
    }
    const r = regions?.regions.find((x) => x.id === state.region);
    return (r?.bounds as [number, number, number, number]) ?? US_BOUNDS;
  }, [geo, state.selected, regions, state.region]);

  // what the shared map paints
  const mapPayload = isSnap ? composite : mapValues;
  const mapMeta = isSnap ? COMPOSITE_META : meta;
  const mapMode: Mode = isSnap ? "rate" : state.mode;
  const mapBusy = isSnap ? !composite : loading;

  const selected = state.selected;
  const sortedValues = useMemo(() => (mapValues ? Object.values(mapValues.values).sort((a, b) => a - b) : []), [mapValues]);
  const selectedValue = selected && mapValues ? mapValues.values[selected] : undefined;
  const selectedPct = selectedValue != null ? percentileOf(sortedValues, selectedValue) : undefined;
  const geoRec = selected && geo ? geo.zips[selected] : undefined;
  const hoverRec = hovered && geo ? geo.zips[hovered] : undefined;
  const hoverVal = hovered && mapPayload ? mapPayload.values[hovered] : undefined;

  const onSelect = (zip: string | null) => setState({ selected: zip ?? undefined });
  const mapFmt = mapMeta ? valueFmt(mapMeta.format, mapMeta.unit) : (v: number) => `${v}`;

  if (!catalog || !meta || !mapMeta) {
    return <main className="app"><p className="muted" style={{ padding: 40 }}>Loading the atlas…</p></main>;
  }

  const placeOf = (rec?: GeoCatalog["zips"][string]) => (rec ? [rec[0], rec[1]].filter(Boolean).join(", ") : "");
  const stateMeans = profile?.c[1] && stateSummary ? stateSummary[profile.c[1]] : undefined;

  return (
    <main id="main" className="app">
      <header className="masthead">
        <span className="kicker">ZIP Health Atlas</span>
        <h1>{isSnap ? "A health snapshot for any ZIP code" : "U.S. health outcomes, ZIP code by ZIP code"}</h1>
        <p className="sub">
          {isSnap
            ? `Pick a ZIP code to see where it lands across ${catalog.metrics.length} health and social-need measures, with ACS demographics, ADI context, and one experimental composite score.`
            : `${catalog.metrics.length} burden-oriented measures across 32,409 ZIP/ZCTA areas — mapped against the national average, neighborhood deprivation, and local demographic context.`}
        </p>
      </header>

      <div className="view-tabs" role="tablist" aria-label="Choose a view">
        <button role="tab" aria-selected={isSnap} className={isSnap ? "active" : ""} onClick={() => setState({ view: "snapshot" })}>
          ZIP health snapshot
        </button>
        <button role="tab" aria-selected={!isSnap} className={!isSnap ? "active" : ""} onClick={() => setState({ view: "measure" })}>
          Explore by measure
        </button>
      </div>

      {isSnap ? (
        <div className="controls">
          <div className="field" style={{ flex: "1 1 280px", maxWidth: 360 }}>
            <label>Find a ZIP</label>
            <ZipSearch compact onSubmit={(z) => setState({ selected: z })} placeholder="ZIP code — e.g. 10001" />
          </div>
          <div className="field">
            <label htmlFor="snap-region">Zoom to</label>
            <select id="snap-region" value={state.region} onChange={(e) => setState({ region: e.target.value, selected: undefined })}>
              {(regions?.regions ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <Controls metrics={catalog.metrics} regions={regions?.regions ?? []} state={state} onChange={setState} />
      )}

      {!isSnap && metricInvalid && (
        <div className="notice" role="status">Unknown measure “{state.metric}”. Showing <strong>{meta.label}</strong> instead.</div>
      )}

      <div className="stage">
        <div className="map-col">
          <div
            className="map-frame"
            aria-busy={mapBusy}
            onMouseEnter={() => setOverMap(true)}
            onMouseLeave={() => { setOverMap(false); setHovered(null); }}
            onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPointer({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
          >
            <MapChoropleth
              payload={mapPayload}
              mode={mapMode}
              domain={mapMeta.domain}
              benchmark={mapMeta.benchmark}
              bounds={bounds}
              selected={selected}
              hovered={hovered}
              onSelect={onSelect}
              onHover={setHovered}
            />
            <Legend mode={mapMode} domain={mapMeta.domain} benchmark={mapMeta.benchmark} fmt={mapFmt} title={mapMeta.short_label} lowerIsBetter={mapMeta.lower_is_better} />
            {hovered && overMap && (
              <div className="tooltip" style={{ left: Math.min(pointer.x + 14, 9999), top: pointer.y + 14 }}>
                <div className="tt-name">{placeOf(hoverRec) || `ZIP ${hovered}`}</div>
                <div className="tt-val">
                  {mapMeta.short_label}: {hoverVal != null ? mapFmt(hoverVal) : "no estimate"}
                  {hoverRec ? ` · ${fmtPop(hoverRec[5])} people` : ""}
                </div>
              </div>
            )}
            {mapBusy && <div className="tooltip" style={{ left: 14, top: 14, background: "var(--panel-2)" }}>Updating…</div>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            {isSnap
              ? "Shaded by overall health burden — deeper red means higher combined burden across available measures. Hover a ZIP for its percentile; click for its full snapshot."
              : <>Hover a ZIP for its value; click to pin it. {meta.description}. Denominator: {meta.denominator}.{meta.missing_count > 0 ? ` ${meta.missing_count.toLocaleString()} ZIP/ZCTA rows have no estimate for this measure and draw as no-data where they are in the tiles.` : ""}</>}
          </p>
        </div>

        <aside>
          {isSnap ? (
            selected && profile ? (
              <SnapshotScoreCard zip={selected} profile={profile} nMeasured={profile.m.filter(Boolean).length} onClear={() => onSelect(null)} />
            ) : (
              <div className="snap-empty">
                <h2>See any ZIP&apos;s health snapshot</h2>
                <p className="muted">
                  Search a ZIP code above, or click any area on the map, to see how it compares across
                  all {catalog.metrics.length} measures, ACS context, state averages, and the nation.
                </p>
                {selected && !profile && <p className="muted">Loading ZIP {selected}…</p>}
              </div>
            )
          ) : (
            <>
              {selected && (
                <div style={{ marginBottom: 12 }}>
                  <ZipCard
                    zip={selected}
                    place={placeOf(geoRec)}
                    region={geoRec?.[2] ?? undefined}
                    population={geoRec?.[5]}
                    county={geoRec?.[6]}
                    source={geoRec?.[8]}
                    backfilled={geoRec?.[10]}
                    adi={geoRec?.[11]}
                    income={geoRec?.[12]}
                    meta={meta}
                    value={selectedValue}
                    percentile={selectedPct}
                    onClear={() => onSelect(null)}
                  />
                </div>
              )}
              {insights && <InsightRail insights={insights.insights} onSelect={onSelect} metricLabel={meta.label} />}
            </>
          )}
        </aside>
      </div>

      {isSnap && selected && profile && dists && (
        <section className="snap-strips-section" aria-label="Per-measure health snapshot">
          <HealthSnapshot
            profile={profile}
            metrics={catalog.metrics}
            dists={dists}
            stateMeans={stateMeans}
            onPickMetric={(id) => setState({ view: "measure", metric: id })}
          />
        </section>
      )}

      {!isSnap && (
        <section className="panels" aria-label="Analytical panels">
          {charts &&
            PANELS.map(({ Cmp, title, sub }) => (
              <div className="panel" key={title}>
                <h3>{title}</h3>
                <p className="panel-sub">{sub}</p>
                <Cmp charts={charts} meta={meta} selected={selected} selectedValue={selectedValue} onSelect={onSelect} onHover={setHovered} />
              </div>
            ))}
        </section>
      )}

      <footer className="footer">
        <p>
          <strong>Sources.</strong> Health outcomes: CDC PLACES-style model-based small-area estimates,
          prepared from <code>zcta_atlas.parquet</code> and joined to public PMTiles geometry. Socioeconomic
          context includes ACS demographics and ADI 2023 v4.0.1. The composite health score is an
          experimental average of national percentiles across available measures.
        </p>
        <p>
          <strong>Caveats.</strong> Estimates are modeled, not direct counts. Pennsylvania and Kentucky
          include documented tract-to-ZCTA backfill where native CDC ZCTA cells are absent. ZIP/ZCTA-level
          associations are ecological and do not describe individuals or imply causation. Generated {catalog.generated_at.slice(0, 10)}.
        </p>
      </footer>
    </main>
  );
}
