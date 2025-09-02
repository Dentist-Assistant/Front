export type Severity = "low" | "medium" | "high";

export type Point = { x: number; y: number; norm?: boolean };
export type Circle = { cx: number; cy: number; r: number; norm?: boolean };
export type Line = { x1: number; y1: number; x2: number; y2: number; norm?: boolean };
export type Polygon = { points: Point[]; norm?: boolean };
export type Box = { x: number; y: number; w: number; h: number; norm?: boolean };

export type Geometry = {
  circles?: Circle[];
  lines?: Line[];
  polygons?: Polygon[];
  boxes?: Box[];
};

export type ImageOverlay = {
  findingIndex?: number;
  label?: string;
  color?: string;
  geometry: Geometry;
};

export type Style = {
  stroke: string;
  strokeWidth?: number;
  fill?: string;
  fillAlpha?: number;
  lineDash?: number[];
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  calloutBg?: string;
  calloutPaddingX?: number;
  calloutPaddingY?: number;
  calloutRadius?: number;
};

export type DrawOptions = {
  width: number;
  height: number;
  startIndex?: number;
  severity?: Severity;
  paletteIndex?: number;
  clampLabels?: boolean;
};

type Ctx = any;

export const palette = [
  "#22D3EE",
  "#60A5FA",
  "#A78BFA",
  "#F472B6",
  "#FB7185",
  "#F59E0B",
  "#10B981",
  "#34D399",
  "#F97316",
  "#38BDF8",
];

export const severityPalette: Record<Severity, string> = {
  low: "#34D399",
  medium: "#F59E0B",
  high: "#EF4444",
};

export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function pickColor(i = 0, desired?: string, sev?: Severity) {
  if (desired && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(desired)) return desired;
  if (sev && severityPalette[sev]) return severityPalette[sev];
  return palette[i % palette.length];
}

export function defaultStyle(color: string): Style {
  return {
    stroke: color,
    strokeWidth: 3,
    fill: "#FFFFFF",
    fillAlpha: 0.06,
    lineDash: [],
    fontFamily: "Inter,system-ui,sans-serif",
    fontSize: 16,
    fontColor: "#FFFFFF",
    calloutBg: "rgba(0,0,0,0.55)",
    calloutPaddingX: 8,
    calloutPaddingY: 6,
    calloutRadius: 6,
  };
}

export function denorm(n: number, dim: number, isNorm?: boolean) {
  return isNorm ? n * dim : n;
}

export function normalizePoint(p: Point, w: number, h: number) {
  return { x: denorm(p.x, w, p.norm), y: denorm(p.y, h, p.norm) };
}

export function normalizeCircle(c: Circle, w: number, h: number) {
  return {
    cx: denorm(c.cx, w, c.norm),
    cy: denorm(c.cy, h, c.norm),
    r: denorm(c.r, Math.min(w, h), c.norm),
  };
}

export function normalizeLine(l: Line, w: number, h: number) {
  return {
    x1: denorm(l.x1, w, l.norm),
    y1: denorm(l.y1, h, l.norm),
    x2: denorm(l.x2, w, l.norm),
    y2: denorm(l.y2, h, l.norm),
  };
}

export function normalizeBox(b: Box, w: number, h: number) {
  return {
    x: denorm(b.x, w, b.norm),
    y: denorm(b.y, h, b.norm),
    w: denorm(b.w, w, b.norm),
    h: denorm(b.h, h, b.norm),
  };
}

export function normalizePolygon(pg: Polygon, w: number, h: number) {
  return {
    points: (pg.points || []).map((pt) => normalizePoint(pt, w, h)),
  };
}

export function normalizeGeometry(g: Geometry, w: number, h: number) {
  return {
    circles: (g.circles || []).map((c) => normalizeCircle(c, w, h)),
    lines: (g.lines || []).map((l) => normalizeLine(l, w, h)),
    boxes: (g.boxes || []).map((b) => normalizeBox(b, w, h)),
    polygons: (g.polygons || []).map((p) => normalizePolygon(p, w, h)),
  };
}

export function geometryBounds(g: Geometry, w: number, h: number) {
  const gg = normalizeGeometry(g, w, h);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  (gg.circles || []).forEach((c) => {
    minX = Math.min(minX, c.cx - c.r);
    minY = Math.min(minY, c.cy - c.r);
    maxX = Math.max(maxX, c.cx + c.r);
    maxY = Math.max(maxY, c.cy + c.r);
  });
  (gg.lines || []).forEach((l) => {
    minX = Math.min(minX, l.x1, l.x2);
    minY = Math.min(minY, l.y1, l.y2);
    maxX = Math.max(maxX, l.x1, l.x2);
    maxY = Math.max(maxY, l.y1, l.y2);
  });
  (gg.boxes || []).forEach((b) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  (gg.polygons || []).forEach((p) => {
    p.points.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
  });
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    minX = 0;
    minY = 0;
    maxX = w;
    maxY = h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function centroidForCallout(g: Geometry, w: number, h: number) {
  const gg = normalizeGeometry(g, w, h);
  if (gg.circles && gg.circles.length) {
    const c = gg.circles[0];
    return { x: c.cx, y: c.cy - c.r - 8, anchor: { x: c.cx, y: c.cy } };
  }
  if (gg.boxes && gg.boxes.length) {
    const b = gg.boxes[0];
    return { x: b.x + b.w / 2, y: b.y - 8, anchor: { x: b.x + b.w / 2, y: b.y } };
  }
  if (gg.lines && gg.lines.length) {
    const l = gg.lines[0];
    const mx = (l.x1 + l.x2) / 2;
    const my = (l.y1 + l.y2) / 2;
    return { x: mx, y: my - 8, anchor: { x: mx, y: my } };
  }
  if (gg.polygons && gg.polygons.length && gg.polygons[0].points.length) {
    const pts = gg.polygons[0].points;
    const sum = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
    const cx = sum.x / pts.length;
    const cy = sum.y / pts.length;
    return { x: cx, y: cy - 8, anchor: { x: cx, y: cy } };
  }
  const bb = geometryBounds(g, w, h);
  return { x: bb.x + bb.w / 2, y: bb.y - 8, anchor: { x: bb.x + bb.w / 2, y: bb.y } };
}

export function assignCalloutNumbers(overlays: ImageOverlay[], startIndex = 1) {
  const out = overlays.map((o, i) => ({
    ...o,
    label: o.label || String(typeof o.findingIndex === "number" ? o.findingIndex : startIndex + i),
  }));
  return out;
}

export function ensureLabelsInBounds(x: number, y: number, w: number, h: number, pad = 6) {
  return { x: clamp(x, pad, w - pad), y: clamp(y, pad + 12, h - pad) };
}

export function setCtxStyle(ctx: Ctx, style: Style) {
  ctx.lineWidth = style.strokeWidth ?? 3;
  ctx.strokeStyle = style.stroke;
  ctx.fillStyle = style.fill ?? "#FFFFFF";
  if (style.lineDash && typeof ctx.setLineDash === "function") ctx.setLineDash(style.lineDash);
  ctx.font = `${style.fontSize ?? 16}px ${style.fontFamily ?? "Inter,system-ui,sans-serif"}`;
}

export function drawGeometry(ctx: Ctx, g: Geometry, w: number, h: number, style: Style) {
  const gg = normalizeGeometry(g, w, h);
  setCtxStyle(ctx, style);
  (gg.circles || []).forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.cx, c.cy, c.r, 0, Math.PI * 2);
    if (style.fill && (style.fillAlpha ?? 0) > 0) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = style.fillAlpha ?? 0.06;
      ctx.fill();
      ctx.globalAlpha = prev;
    }
    ctx.stroke();
  });
  (gg.lines || []).forEach((l) => {
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  });
  (gg.boxes || []).forEach((b) => {
    if (style.fill && (style.fillAlpha ?? 0) > 0) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = style.fillAlpha ?? 0.06;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = prev;
    }
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  });
  (gg.polygons || []).forEach((p) => {
    if (!p.points.length) return;
    ctx.beginPath();
    ctx.moveTo(p.points[0].x, p.points[0].y);
    for (let i = 1; i < p.points.length; i++) ctx.lineTo(p.points[i].x, p.points[i].y);
    ctx.closePath();
    if (style.fill && (style.fillAlpha ?? 0) > 0) {
      const prev = ctx.globalAlpha;
      ctx.globalAlpha = style.fillAlpha ?? 0.06;
      ctx.fill();
      ctx.globalAlpha = prev;
    }
    ctx.stroke();
  });
}

export function drawRoundedRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export function drawCallout(ctx: Ctx, label: string, x: number, y: number, style: Style, w: number, h: number, clampToBounds = true) {
  const px = style.calloutPaddingX ?? 8;
  const py = style.calloutPaddingY ?? 6;
  const r = style.calloutRadius ?? 6;
  const color = style.fontColor ?? "#FFFFFF";
  const bg = style.calloutBg ?? "rgba(0,0,0,0.55)";
  ctx.font = `${style.fontSize ?? 16}px ${style.fontFamily ?? "Inter,system-ui,sans-serif"}`;
  const metrics = ctx.measureText(label);
  const tw = Math.ceil(metrics.width);
  const th = Math.ceil((style.fontSize ?? 16) + 4);
  let bx = Math.round(x - px);
  let by = Math.round(y - th - py);
  const bw = tw + px * 2;
  const bh = th + py * 2;
  if (clampToBounds) {
    bx = clamp(bx, 2, w - bw - 2);
    by = clamp(by, 2, h - bh - 2);
  }
  ctx.fillStyle = bg;
  drawRoundedRect(ctx, bx, by, bw, bh, r);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(label, bx + px, by + py + (style.fontSize ?? 16));
}

export function drawOverlay(ctx: Ctx, overlay: ImageOverlay, opts: DrawOptions, style?: Style) {
  const color = pickColor(opts.paletteIndex, overlay.color, opts.severity);
  const st = style || defaultStyle(color);
  drawGeometry(ctx, overlay.geometry, opts.width, opts.height, st);
  const centroid = centroidForCallout(overlay.geometry, opts.width, opts.height);
  const label = overlay.label || String(typeof overlay.findingIndex === "number" ? overlay.findingIndex : (opts.startIndex ?? 1));
  drawCallout(ctx, label, centroid.x, centroid.y, st, opts.width, opts.height, opts.clampLabels ?? true);
}

export function drawOverlays(ctx: Ctx, overlays: ImageOverlay[], opts: DrawOptions, style?: Style) {
  const labeled = assignCalloutNumbers(overlays, opts.startIndex ?? 1);
  labeled.forEach((ov, i) => drawOverlay(ctx, ov, { ...opts, paletteIndex: i }, style));
  return labeled;
}
