"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useUrlState } from "@/lib/urlState";
import {
  loadCharts, loadGeoCatalog, loadInsights, loadMapValues, loadMetricCatalog, loadRegionCatalog,
} from "@/lib/data";
import { percentileOf, valueFmt, fmtPop } from "@/lib/format";
import type {
  ChartsPayload, GeoCatalog, InsightsPayload, MapValues, MetricCatalog, MetricMeta, RegionCatalog,
} from "@/lib/types";
import Controls from "./Controls";
import Legend from "./Legend";
import InsightRail from "./InsightRail";
import ZipCard from "./ZipCard";

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

  const [catalog, setCatalog] = useState<MetricCatalog | null>(null);
  const [regions, setRegions] = useState<RegionCatalog | null>(null);
  const [geo, setGeo] = useState<GeoCatalog | null>(null);

  const [mapValues, setMapValues] = useState<MapValues | null>(null);
  const [charts, setCharts] = useState<ChartsPayload | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  const [hovered, setHovered] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [overMap, setOverMap] = useState(false); // floating tooltip only while pointer is on the map

  // eager catalogs + lazy geo names
  useEffect(() => {
    loadMetricCatalog().then(setCatalog).catch(() => {});
    loadRegionCatalog().then(setRegions).catch(() => {});
    loadGeoCatalog().then(setGeo).catch(() => {});
  }, []);

  // resolve metric meta (with fallback)
  const meta: MetricMeta | null = useMemo(() => {
    if (!catalog) return null;
    return catalog.metrics.find((m) => m.metric_id === state.metric) ?? catalog.metrics.find((m) => m.metric_id === catalog.default_metric) ?? catalog.metrics[0];
  }, [catalog, state.metric]);
  const metricInvalid = !!catalog && !catalog.metrics.some((m) => m.metric_id === state.metric);

  // metric payloads (stale-but-visible: keep old until new resolves)
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    setLoading(true);
    Promise.all([loadMapValues(meta.metric_id), loadCharts(meta.metric_id), loadInsights(meta.metric_id)])
      .then(([mv, ch, ins]) => {
        if (!alive) return;
        setMapValues(mv); setCharts(ch); setInsights(ins); setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [meta]);

  // region bounds
  const bounds = useMemo<[number, number, number, number]>(() => {
    const r = regions?.regions.find((x) => x.id === state.region);
    return (r?.bounds as [number, number, number, number]) ?? US_BOUNDS;
  }, [regions, state.region]);

  // sorted values for percentile lookups
  const sortedValues = useMemo(
    () => (mapValues ? Object.values(mapValues.values).sort((a, b) => a - b) : []),
    [mapValues],
  );

  const selected = state.selected;
  const selectedValue = selected && mapValues ? mapValues.values[selected] : undefined;
  const selectedPct = selectedValue != null ? percentileOf(sortedValues, selectedValue) : undefined;
  const geoRec = selected && geo ? geo.zips[selected] : undefined;
  const hoverRec = hovered && geo ? geo.zips[hovered] : undefined;
  const hoverVal = hovered && mapValues ? mapValues.values[hovered] : undefined;

  const onSelect = (zip: string | null) => setState({ selected: zip ?? undefined });
  const fmt = meta ? valueFmt(meta.format, meta.unit) : (v: number) => `${v}`;

  if (!catalog || !meta) {
    return <main className="app"><p className="muted" style={{ padding: 40 }}>Loading the atlas…</p></main>;
  }

  const placeOf = (rec?: GeoCatalog["zips"][string]) => (rec ? `${rec[0]}, ${rec[1]}` : "");

  return (
    <main id="main" className="app">
      <header className="masthead">
        <span className="kicker">ZIP Health Atlas</span>
        <h1>U.S. health outcomes, ZIP code by ZIP code</h1>
        <p className="sub">
          Ten health measures across {catalog.metrics[0] ? "31,491" : ""} ZIP codes — mapped against the
          national average and against neighborhood deprivation. Estimates are modeled (CDC PLACES-style);
          associations are ecological, not causal.
        </p>
      </header>

      <Controls metrics={catalog.metrics} regions={regions?.regions ?? []} state={state} onChange={setState} />

      {metricInvalid && (
        <div className="notice" role="status">
          Unknown measure “{state.metric}”. Showing <strong>{meta.label}</strong> instead.
        </div>
      )}

      <div className="stage">
        <div className="map-col">
          <div
            className="map-frame"
            aria-busy={loading}
            onMouseEnter={() => setOverMap(true)}
            onMouseLeave={() => { setOverMap(false); setHovered(null); }}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setPointer({ x: e.clientX - r.left, y: e.clientY - r.top });
            }}
          >
            <MapChoropleth
              payload={mapValues}
              mode={state.mode}
              domain={meta.domain}
              benchmark={meta.benchmark}
              bounds={bounds}
              selected={selected}
              hovered={hovered}
              onSelect={onSelect}
              onHover={setHovered}
            />
            <Legend mode={state.mode} domain={meta.domain} benchmark={meta.benchmark} fmt={fmt} title={meta.short_label} lowerIsBetter={meta.lower_is_better} />
            {hovered && overMap && (
              <div className="tooltip" style={{ left: Math.min(pointer.x + 14, 9999), top: pointer.y + 14 }}>
                <div className="tt-name">{placeOf(hoverRec) || `ZIP ${hovered}`}</div>
                <div className="tt-val">
                  {meta.short_label}: {hoverVal != null ? fmt(hoverVal) : "no estimate"}
                  {hoverRec ? ` · ${fmtPop(hoverRec[5])} people` : ""}
                </div>
              </div>
            )}
            {loading && <div className="tooltip" style={{ left: 14, top: 14, background: "var(--panel-2)" }}>Updating…</div>}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Hover a ZIP for its value; click to pin it. {meta.description}. Denominator: {meta.denominator}.
            {meta.missing_count > 0 ? ` ${meta.missing_count.toLocaleString()} ZIPs have no estimate (shown grey).` : ""}
          </p>
        </div>

        <aside>
          {selected && (
            <div style={{ marginBottom: 12 }}>
              <ZipCard
                zip={selected}
                place={placeOf(geoRec)}
                region={geoRec?.[2]}
                population={geoRec?.[5]}
                meta={meta}
                value={selectedValue}
                percentile={selectedPct}
                onClear={() => onSelect(null)}
              />
            </div>
          )}
          {insights && <InsightRail insights={insights.insights} onSelect={onSelect} metricLabel={meta.label} />}
        </aside>
      </div>

      <section className="panels" aria-label="Analytical panels">
        {charts &&
          PANELS.map(({ Cmp, title, sub }) => (
            <div className="panel" key={title}>
              <h3>{title}</h3>
              <p className="panel-sub">{sub}</p>
              <Cmp
                charts={charts}
                meta={meta}
                selected={selected}
                selectedValue={selectedValue}
                onSelect={onSelect}
                onHover={setHovered}
              />
            </div>
          ))}
      </section>

      <footer className="footer">
        <p>
          <strong>Sources.</strong> Health outcomes: CDC PLACES-style model-based small-area estimates, read
          from the public <code>Health_Zip_converted.pmtiles</code>. Socioeconomic context (Area Deprivation
          Index, income, education, age): <code>health_zip.parquet</code>. Both hosted publicly on Tigris and
          read directly by the browser; no credentials are used at runtime. Built statically — the map recolors
          via MapLibre feature-state without rebuilding the source.
        </p>
        <p>
          <strong>Caveats.</strong> Estimates are modeled, not direct counts. ZIP/ZCTA-level associations are
          ecological and do not describe individuals or imply causation. Generated {catalog.generated_at.slice(0, 10)}.
        </p>
      </footer>
    </main>
  );
}
