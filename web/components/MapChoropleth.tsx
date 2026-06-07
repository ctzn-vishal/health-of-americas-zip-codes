"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import * as pmtiles from "pmtiles";
import { useFeatureStateMetric, setInteractionState } from "./useFeatureStateMetric";
import { maplibreColorExpr, NODATA, INK } from "@/lib/colors";
import { PMTILES_URL, SOURCE_LAYER, JOIN_KEY } from "@/lib/types";
import type { MapValues, Mode } from "@/lib/types";
import "maplibre-gl/dist/maplibre-gl.css";

type Bounds = [number, number, number, number];
interface Props {
  payload: MapValues | null;
  mode: Mode;
  domain: [number, number, number];
  benchmark: number;
  bounds: Bounds;
  selected?: string;
  hovered?: string | null;
  onSelect?: (id: string | null) => void;
  onHover?: (id: string | null) => void;
}

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function MapChoropleth({
  payload, mode, domain, benchmark, bounds, selected, hovered, onSelect, onHover,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const hoverRef = useRef<string | null>(null);
  const selRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  // keep latest callbacks in refs so the once-registered map handlers never go stale
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  useEffect(() => { onSelectRef.current = onSelect; onHoverRef.current = onHover; }, [onSelect, onHover]);

  // init once
  useEffect(() => {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    const map = new maplibregl.Map({
      container: elRef.current!,
      style: {
        version: 8,
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#0b1020" } }],
      },
      bounds,
      fitBoundsOptions: { padding: 28 },
      attributionControl: false,
      dragRotate: false,
      maxZoom: 12,
      minZoom: 2,
      // keep the WebGL buffer so the map appears in screenshots (visual regression) and
      // users can capture it; negligible cost for this static choropleth.
      preserveDrawingBuffer: true,
    });
    mapRef.current = map;
    // The container can finish sizing AFTER this effect runs — notably in the static export,
    // where the stylesheet that sizes .map-frame loads after the JS. MapLibre only auto-resizes
    // on window resize, so without this the canvas can stay at its (too-small) initial size.
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    if (elRef.current) ro.observe(elRef.current);
    map.on("error", (e) => console.error("[map] error:", (e as any)?.error?.message ?? e));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          "Health: CDC PLACES (via Health_Zip PMTiles) · Context: health_zip.parquet · Tiles © OpenMapTiles",
      }),
      "bottom-right",
    );

    map.on("load", () => {
      map.addSource("geo", { type: "vector", url: `pmtiles://${PMTILES_URL}`, promoteId: JOIN_KEY });
      map.addLayer({
        id: "geo-fill",
        type: "fill",
        source: "geo",
        "source-layer": SOURCE_LAYER,
        paint: {
          "fill-color": maplibreColorExpr(mode, domain, benchmark),
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 1,
            ["boolean", ["feature-state", "hover"], false], 0.97,
            0.9,
          ],
        },
      });
      // thin boundaries
      map.addLayer({
        id: "geo-line",
        type: "line",
        source: "geo",
        "source-layer": SOURCE_LAYER,
        paint: { "line-color": "rgba(255,255,255,0.22)", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.1, 9, 0.5] },
      });
      // hover/selected outline (weight + ink, not color-only)
      map.addLayer({
        id: "geo-outline",
        type: "line",
        source: "geo",
        "source-layer": SOURCE_LAYER,
        paint: {
          "line-color": INK,
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false], 2.4,
            ["boolean", ["feature-state", "hover"], false], 1.2,
            0,
          ],
        },
      });

      // Hover is lifted to app state (onHover); the `hovered` prop effect below paints the
      // feature-state, so hover is a single source of truth and panels can cross-highlight the map.
      map.on("mousemove", "geo-fill", (e) => {
        const id = e.features?.[0]?.id != null ? String(e.features[0].id) : null;
        if (id !== hoverRef.current) {
          onHoverRef.current?.(id);
          map.getCanvas().style.cursor = id ? "pointer" : "";
        }
      });
      map.on("mouseleave", "geo-fill", () => {
        onHoverRef.current?.(null);
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "geo-fill", (e) => {
        const id = e.features?.[0]?.id != null ? String(e.features[0].id) : null;
        onSelectRef.current?.(id);
      });
      map.on("click", (e) => {
        // click on empty background clears selection
        const f = map.queryRenderedFeatures(e.point, { layers: ["geo-fill"] });
        if (f.length === 0) onSelectRef.current?.(null);
      });

      map.getCanvas().setAttribute("data-map-ready", "true");
      setReady(true);
    });

    return () => {
      ro.disconnect();
      map.remove();
      maplibregl.removeProtocol("pmtiles");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // paint metric values (val + pct) via feature-state
  useFeatureStateMetric(mapRef.current, ready, "geo", SOURCE_LAYER, payload);

  // mode / domain change -> swap the paint expression ONLY (no rebuild, no refetch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setPaintProperty("geo-fill", "fill-color", maplibreColorExpr(mode, domain, benchmark));
  }, [mode, domain, benchmark, ready]);

  // region change -> fitBounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.fitBounds(bounds, { padding: 28, duration: reduceMotion() ? 0 : 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds[0], bounds[1], bounds[2], bounds[3], ready]);

  // selection -> feature-state
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setInteractionState(map, "geo", SOURCE_LAYER, "selected", selected ?? null, selRef.current);
    selRef.current = selected ?? null;
  }, [selected, ready]);

  // hover (from map OR cross-highlighted from a panel) -> feature-state, single source of truth
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    setInteractionState(map, "geo", SOURCE_LAYER, "hover", hovered ?? null, hoverRef.current);
    hoverRef.current = hovered ?? null;
  }, [hovered, ready]);

  return (
    <div
      ref={elRef}
      className="map-canvas"
      role="img"
      aria-label="Choropleth map of U.S. ZIP codes colored by the selected health metric. Use the data table for an accessible view."
      data-volatile
    />
  );
}

export { NODATA };
