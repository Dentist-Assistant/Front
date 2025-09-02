"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import useSignedUrl from "../../../../../../hooks/useSignedUrl";

type Severity = "low" | "medium" | "high";
type Point = { x: number; y: number; norm?: boolean };
type Circle = { cx: number; cy: number; r: number; norm?: boolean };
type Line = { x1: number; y1: number; x2: number; y2: number; norm?: boolean };
type Polygon = { points: Point[]; norm?: boolean };
type Box = { x: number; y: number; w: number; h: number; norm?: boolean };
type Geometry = { circles?: Circle[]; lines?: Line[]; polygons?: Polygon[]; boxes?: Box[] };

type Overlay = {
  id: string | number;
  label?: string;
  severity?: Severity;
  color?: string;
  geometry: Geometry;
  tooltip?: string;
  selected?: boolean;
};

type ExportOptions = { format?: "png" | "webp"; quality?: number; width?: number };

export type ImageViewerHandle = {
  export: (opts?: ExportOptions) => Promise<Blob | null>;
};

type Props = {
  path?: string;
  alt?: string;
  caption?: string;
  maxHeight?: number;
  overlays?: Overlay[];
  showOverlays?: boolean;
  showLabels?: boolean;
  highlightIds?: Array<string | number>;
  onToggleOverlays?: (val: boolean) => void;
  onHoverOverlay?: (id: string | number | null) => void;
  onClickOverlay?: (id: string | number) => void;
};

function sevColor(s?: Severity) {
  if (s === "high") return "#EF4444";
  if (s === "medium") return "#F59E0B";
  return "#34D399";
}

function toPx(n: number, size: number, norm?: boolean) {
  if (norm || (n >= 0 && n <= 1)) return n * size;
  return n;
}

function centroid(points: { x: number; y: number }[]) {
  if (!points.length) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function midpoint(x1: number, y1: number, x2: number, y2: number) {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

const ImageViewer = forwardRef<ImageViewerHandle, Props>(function ImageViewer(
  {
    path,
    alt = "Dental image",
    caption,
    maxHeight = 520,
    overlays = [],
    showOverlays: showOverlaysProp,
    showLabels: showLabelsProp = true,
    highlightIds = [],
    onToggleOverlays,
    onHoverOverlay,
    onClickOverlay,
  },
  ref
) {
  const { url, isLoading, error } = useSignedUrl(path);
  const [mode, setMode] = useState<"fit" | "actual">("fit");
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string | number | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [showOverlays, setShowOverlays] = useState<boolean>(showOverlaysProp ?? true);
  const [showLabels, setShowLabels] = useState<boolean>(showLabelsProp);

  useEffect(() => setShowOverlays(showOverlaysProp ?? true), [showOverlaysProp]);
  useEffect(() => setShowLabels(showLabelsProp), [showLabelsProp]);

  const canShow = !!url && !isLoading && !error;
  const combinedRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const zoomIn = () => setZoom((z) => Math.min(4, parseFloat((z + 0.25).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))));
  const reset = () => {
    setMode("fit");
    setZoom(1);
  };

  const baseW = natural?.w || 0;
  const baseH = natural?.h || 0;

  const hvSet = (id: string | number | null) => {
    setHoverId(id);
    onHoverOverlay?.(id);
  };

  const highlighted = useMemo(() => new Set(highlightIds.map(String)), [highlightIds]);

  useImperativeHandle(ref, () => ({
    export: async (opts?: ExportOptions) => {
      if (!url || !baseW || !baseH) return null;
      const format = opts?.format || "png";
      const width = opts?.width && opts.width > 0 ? opts.width : baseW;
      const scale = width / baseW;
      const height = Math.round(baseH * scale);
      const cnv = document.createElement("canvas");
      cnv.width = width;
      cnv.height = height;
      const ctx = cnv.getContext("2d");
      if (!ctx) return null;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url as string;
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("image load failed"));
      });
      ctx.drawImage(img, 0, 0, width, height);
      const paint = (stroke: string, thick = 3, fill?: string, dash?: number[]) => {
        ctx.lineWidth = thick;
        ctx.strokeStyle = stroke;
        ctx.setLineDash(dash || []);
        if (fill) ctx.fillStyle = fill;
      };
      if (showOverlays && overlays.length) {
        overlays.forEach((ov) => {
          const color = ov.color || sevColor(ov.severity);
          const thick = ov.selected || highlighted.has(String(ov.id)) || hoverId === ov.id ? 4 : 2.5;
          const g = ov.geometry || {};
          if (Array.isArray(g.circles)) {
            g.circles.forEach((c) => {
              paint(color, thick);
              const cx = toPx(c.cx, width, c.norm);
              const cy = toPx(c.cy, height, c.norm);
              const r = toPx(c.r, width, c.norm);
              ctx.beginPath();
              ctx.arc(cx, cy, r, 0, Math.PI * 2);
              ctx.stroke();
            });
          }
          if (Array.isArray(g.lines)) {
            g.lines.forEach((l) => {
              paint(color, thick);
              const x1 = toPx(l.x1, width, l.norm);
              const y1 = toPx(l.y1, height, l.norm);
              const x2 = toPx(l.x2, width, l.norm);
              const y2 = toPx(l.y2, height, l.norm);
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            });
          }
          if (Array.isArray(g.boxes)) {
            g.boxes.forEach((b) => {
              paint(color, thick);
              const x = toPx(b.x, width, b.norm);
              const y = toPx(b.y, height, b.norm);
              const w = toPx(b.w, width, b.norm);
              const h = toPx(b.h, height, b.norm);
              ctx.strokeRect(x, y, w, h);
            });
          }
          if (Array.isArray(g.polygons)) {
            g.polygons.forEach((p) => {
              if (!Array.isArray(p.points) || p.points.length < 2) return;
              paint(color, thick);
              const pts = p.points.map((pt) => ({
                x: toPx(pt.x, width, p.norm || pt.norm),
                y: toPx(pt.y, height, p.norm || pt.norm),
              }));
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
              ctx.closePath();
              ctx.stroke();
            });
          }
          if (showLabels) {
            let lx = 0;
            let ly = 0;
            if (ov.geometry.circles && ov.geometry.circles[0]) {
              lx = toPx(ov.geometry.circles[0].cx, width, ov.geometry.circles[0].norm);
              ly = toPx(ov.geometry.circles[0].cy, height, ov.geometry.circles[0].norm);
            } else if (ov.geometry.boxes && ov.geometry.boxes[0]) {
              const b = ov.geometry.boxes[0];
              lx = toPx(b.x + (b.norm ? b.w : b.w) / 2, width, b.norm);
              ly = toPx(b.y + (b.norm ? b.h : b.h) / 2, height, b.norm);
            } else if (ov.geometry.lines && ov.geometry.lines[0]) {
              const l = ov.geometry.lines[0];
              const m = midpoint(
                toPx(l.x1, width, l.norm),
                toPx(l.y1, height, l.norm),
                toPx(l.x2, width, l.norm),
                toPx(l.y2, height, l.norm)
              );
              lx = m.x;
              ly = m.y;
            } else if (ov.geometry.polygons && ov.geometry.polygons[0]) {
              const pts = ov.geometry.polygons[0].points.map((pt) => ({
                x: toPx(pt.x, width, ov.geometry.polygons![0].norm || pt.norm),
                y: toPx(pt.y, height, ov.geometry.polygons![0].norm || pt.norm),
              }));
              const c = centroid(pts);
              lx = c.x;
              ly = c.y;
            }
            const bg = "rgba(0,0,0,0.75)";
            const txt = ov.label || String(ov.id);
            ctx.font = "600 12px Inter, system-ui, sans-serif";
            const metrics = ctx.measureText(txt);
            const tw = metrics.width + 10;
            const th = 18;
            ctx.fillStyle = bg;
            ctx.fillRect(lx - tw / 2, ly - th / 2, tw, th);
            ctx.fillStyle = "#fff";
            ctx.textBaseline = "middle";
            ctx.textAlign = "center";
            ctx.fillText(txt, lx, ly);
          }
        });
      }
      const type = format === "webp" ? "image/webp" : "image/png";
      const quality = opts?.quality ?? 0.95;
      return await new Promise<Blob | null>((resolve) => {
        cnv.toBlob((blob) => resolve(blob), type, quality);
      });
    },
  }));

  const overlaySvg = useMemo(() => {
    if (!showOverlays || !overlays.length || !baseW || !baseH) return null;
    const items = overlays.map((ov) => {
      const color = ov.color || sevColor(ov.severity);
      const active = ov.selected || highlighted.has(String(ov.id)) || hoverId === ov.id;
      const stroke = color;
      const glow = active ? 2.4 : 1.8;
      const thick = active ? 2.5 : 1.6;
      const g = ov.geometry || {};
      const circles = (g.circles || []).map((c, i) => {
        const cx = toPx(c.cx, baseW, c.norm);
        const cy = toPx(c.cy, baseH, c.norm);
        const r = toPx(c.r, baseW, c.norm);
        return (
          <circle key={`c-${i}`} cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={thick} opacity={0.95} />
        );
      });
      const lines = (g.lines || []).map((l, i) => {
        const x1 = toPx(l.x1, baseW, l.norm);
        const y1 = toPx(l.y1, baseH, l.norm);
        const x2 = toPx(l.x2, baseW, l.norm);
        const y2 = toPx(l.y2, baseH, l.norm);
        return <line key={`l-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={thick} opacity={0.95} />;
      });
      const boxes = (g.boxes || []).map((b, i) => {
        const x = toPx(b.x, baseW, b.norm);
        const y = toPx(b.y, baseH, b.norm);
        const w = toPx(b.w, baseW, b.norm);
        const h = toPx(b.h, baseH, b.norm);
        return <rect key={`b-${i}`} x={x} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={thick} opacity={0.95} />;
      });
      const polygons = (g.polygons || []).map((p, i) => {
        if (!p.points?.length) return null;
        const pts = p.points
          .map((pt) => `${toPx(pt.x, baseW, p.norm || pt.norm)},${toPx(pt.y, baseH, p.norm || pt.norm)}`)
          .join(" ");
        return <polygon key={`p-${i}`} points={pts} fill="none" stroke={stroke} strokeWidth={thick} opacity={0.95} />;
      });
      let lx = 0;
      let ly = 0;
      if (showLabels) {
        if (g.circles && g.circles[0]) {
          lx = toPx(g.circles[0].cx, baseW, g.circles[0].norm);
          ly = toPx(g.circles[0].cy, baseH, g.circles[0].norm);
        } else if (g.boxes && g.boxes[0]) {
          const b = g.boxes[0];
          lx = toPx(b.x + (b.norm ? b.w : b.w) / 2, baseW, b.norm);
          ly = toPx(b.y + (b.norm ? b.h : b.h) / 2, baseH, b.norm);
        } else if (g.lines && g.lines[0]) {
          const l = g.lines[0];
          const m = midpoint(
            toPx(l.x1, baseW, l.norm),
            toPx(l.y1, baseH, l.norm),
            toPx(l.x2, baseW, l.norm),
            toPx(l.y2, baseH, l.norm)
          );
          lx = m.x;
          ly = m.y;
        } else if (g.polygons && g.polygons[0]) {
          const pts = g.polygons[0].points.map((pt) => ({
            x: toPx(pt.x, baseW, g.polygons![0].norm || pt.norm),
            y: toPx(pt.y, baseH, g.polygons![0].norm || pt.norm),
          }));
          const c = centroid(pts);
          lx = c.x;
          ly = c.y;
        }
      }
      return (
        <g
          key={String(ov.id)}
          onMouseEnter={() => hvSet(ov.id)}
          onMouseLeave={() => hvSet(null)}
          onClick={() => onClickOverlay?.(ov.id)}
          cursor="pointer"
        >
          <g filter={`drop-shadow(0 0 ${glow}px ${stroke})`}>{circles}{lines}{boxes}{polygons}</g>
          {showLabels && (
            <g>
              <rect x={lx - 14} y={ly - 10} width={28} height={20} rx={6} ry={6} fill="rgba(0,0,0,0.75)" />
              <text x={lx} y={ly + 1} textAnchor="middle" fontSize="12" fontWeight={700} fill="#fff">
                {ov.label || String(ov.id)}
              </text>
              {ov.tooltip ? <title>{ov.tooltip}</title> : null}
            </g>
          )}
        </g>
      );
    });
    return (
      <svg
        aria-label="overlay"
        width={baseW}
        height={baseH}
        viewBox={`0 0 ${baseW} ${baseH}`}
        style={{ position: "absolute", inset: 0 }}
      >
        {items}
      </svg>
    );
  }, [showOverlays, overlays, baseW, baseH, highlighted, hoverId, onClickOverlay, showLabels]);

  const innerStyle = useMemo(() => {
    if (!baseW || !baseH) return {};
    if (mode === "fit") {
      return {
        width: "100%",
        aspectRatio: `${baseW} / ${baseH}`,
        transformOrigin: "top left" as const,
      };
    }
    return {
      width: `${baseW}px`,
      height: `${baseH}px`,
      transform: `scale(${zoom})`,
      transformOrigin: "top left" as const,
    };
  }, [baseW, baseH, mode, zoom]);

  const imgStyle = useMemo(() => {
    if (!baseW || !baseH) return {};
    if (mode === "fit") return { width: "100%", height: "100%", objectFit: "contain" as const, display: "block" };
    return { width: `${baseW}px`, height: `${baseH}px`, objectFit: "contain" as const, display: "block" };
  }, [baseW, baseH, mode]);

  return (
    <section className="card-lg">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Image</h3>
          <p className="text-xs muted">{path || "No path provided"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border p-1">
            <button className={`btn btn-ghost px-3 py-1.5 ${mode === "fit" ? "bg-white/5" : ""}`} onClick={() => setMode("fit")} aria-pressed={mode === "fit"}>
              Fit
            </button>
            <button className={`btn btn-ghost px-3 py-1.5 ${mode === "actual" ? "bg-white/5" : ""}`} onClick={() => setMode("actual")} aria-pressed={mode === "actual"}>
              100%
            </button>
          </div>
          <div className="rounded-xl border p-1">
            <button className="btn btn-ghost px-3 py-1.5" onClick={zoomOut} aria-label="Zoom out">
              −
            </button>
            <span className="px-2 text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
            <button className="btn btn-ghost px-3 py-1.5" onClick={zoomIn} aria-label="Zoom in">
              +
            </button>
          </div>
          <button className="btn btn-outline" onClick={reset} aria-label="Reset view">
            Reset
          </button>
          {canShow && (
            <a href={url as string} target="_blank" rel="noreferrer" className="btn btn-primary" aria-label="Open original">
              Open
            </a>
          )}
          {overlays.length > 0 && (
            <>
              <label className="inline-flex items-center gap-2 text-sm rounded-xl border px-3 py-1.5">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={showOverlays}
                  onChange={(e) => {
                    setShowOverlays(e.target.checked);
                    onToggleOverlays?.(e.target.checked);
                  }}
                />
                Overlays
              </label>
              <label className="inline-flex items-center gap-2 text-sm rounded-xl border px-3 py-1.5">
                <input type="checkbox" className="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                Labels
              </label>
            </>
          )}
        </div>
      </div>

      {isLoading && <div className="skeleton w-full" style={{ height: maxHeight }} aria-busy="true" aria-live="polite" />}

      {error && (
        <div
          role="alert"
          className="rounded-xl border px-3 py-2 text-sm"
          style={{ background: "color-mix(in oklab, var(--color-danger) 14%, transparent)", borderColor: "color-mix(in oklab, var(--color-danger) 55%, var(--border-alpha))" }}
        >
          Failed to load image
        </div>
      )}

      {!isLoading && !error && !url && (
        <div className="empty" style={{ height: maxHeight }}>
          <div className="h-8 w-8 rounded-xl bg-white/5" />
          <p>No image available</p>
          <p className="text-sm muted">Upload an image or select a different case.</p>
        </div>
      )}

      {canShow && (
        <div className="relative overflow-auto rounded-xl border bg-black/20" style={{ maxHeight }}>
          <div ref={combinedRef} className="relative" style={innerStyle} onMouseLeave={() => hvSet(null)}>
            <img
              ref={imgRef}
              src={url as string}
              alt={alt}
              draggable={false}
              onDoubleClick={reset}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={imgStyle}
            />
            {overlaySvg}
          </div>
        </div>
      )}

      {caption && <figcaption className="mt-2 text-xs muted">{caption}</figcaption>}
    </section>
  );
});

export default ImageViewer;
