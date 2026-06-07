"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

/** Width from a ResizeObserver on a wrapping element (height is fixed per chart). */
export function useResize<T extends HTMLElement = HTMLDivElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(Math.max(0, Math.floor(e.contentRect.width)));
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(mq.matches);
    const fn = () => setR(mq.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);
  return r;
}

export const CHART_M = { t: 14, r: 16, b: 34, l: 44 };

type AnyScale =
  | d3.ScaleLinear<number, number>
  | d3.ScaleBand<string>
  | d3.ScalePoint<string>
  | d3.ScalePoint<number>;

/** D3-rendered axis island (the one place we let D3 touch the DOM). */
export function Axis({
  orient, scale, tx, ty, ticks = 5, tickFormat, tickValues,
}: {
  orient: "bottom" | "left";
  scale: AnyScale;
  tx: number;
  ty: number;
  ticks?: number;
  tickFormat?: (d: d3.NumberValue) => string;
  tickValues?: number[];
}) {
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const axis = (orient === "bottom" ? d3.axisBottom(scale as any) : d3.axisLeft(scale as any))
      .ticks(ticks);
    if (tickFormat) axis.tickFormat(tickFormat as any);
    if (tickValues) axis.tickValues(tickValues as any);
    const g = d3.select(ref.current);
    g.call(axis as any);
    g.attr("class", "axis");
    g.select(".domain").attr("shape-rendering", "crispEdges");
    g.selectAll(".tick line").attr("shape-rendering", "crispEdges");
  }, [orient, scale, ticks, tickFormat, tickValues]);
  return <g ref={ref} transform={`translate(${tx},${ty})`} />;
}

export interface Col {
  key: string;
  label: string;
  numeric?: boolean;
  fmt?: (v: any) => string;
}

/** Accessible <details> table fallback — every chart ships one. */
export function TableFallback({
  caption, columns, rows, label = "Show data table",
}: {
  caption: string;
  columns: Col[];
  rows: Record<string, any>[];
  label?: string;
}) {
  return (
    <details className="table-fallback">
      <summary>{label}</summary>
      <div className="scroll-y">
        <table className="tbl">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>{columns.map((c) => <th key={c.key} scope="col">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.fmt ? c.fmt(r[c.key]) : r[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export { d3, useMemo };
