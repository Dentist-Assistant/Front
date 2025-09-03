// lib/pdfServer.ts
export type Severity = "low" | "medium" | "high";

export type ReviewPacketUpdate = {
  topic: string;
  action: "add" | "modify" | "remove";
  text?: string;
  rationale?: string;
};

export type ReviewPacketImageFinding = {
  tooth: string;
  note: string;
  severity: Severity;
  index?: number;
};

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

export type ReviewPacketImage = {
  url: string;
  caption?: string;
  index?: number;
  width?: number;
  height?: number;
  findings?: ReviewPacketImageFinding[];
  overlays?: ImageOverlay[];
};

export type ReviewPacketData = {
  caseId: string;
  patientName: string;
  doctorName?: string;
  technicianName?: string;
  createdAt?: string | Date;
  summary?: string;
  findings?: { tooth: string; note: string; severity: Severity }[];
  images?: ReviewPacketImage[];
  footerNote?: string;
  rebuttal?: {
    narrative?: string;
    updates?: ReviewPacketUpdate[];
    feedbackAlignment?: {
      itemNumber: number;
      itemText: string;
      decision: "accept" | "partial" | "reject" | string;
      reason: string;
      linkedUpdates: number[];
    }[];
    finding_changes?: any[];
  };
  treatmentGoalFinal?: any;
};

export type ReviewCompareData = {
  caseId: string;
  patientName: string;
  doctorName?: string;
  technicianName?: string;
  createdAt?: string | Date;
  versions: {
    draft: { version: number; summary: string };
    latest: { version: number; summary: string; isRebuttal?: boolean };
  };
  findings: {
    draft: { tooth: string; note: string; severity: Severity }[];
    latest: { tooth: string; note: string; severity: Severity }[];
  };
  rebuttal?: {
    narrative?: string;
    updates?: ReviewPacketUpdate[];
    feedbackAlignment?: { itemNumber: number; itemText: string; decision: string; reason: string; linkedUpdates: number[] }[];
  };
  images?: ReviewPacketImage[];
  footerNote?: string;
};

function formatDate(d?: string | Date) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function severityLabel(s: Severity) {
  return s === "high" ? "High" : s === "medium" ? "Moderate" : "Low";
}

function normSeverity(s?: string): Severity {
  const v = String(s || "").toLowerCase();
  if (v.includes("high") || v.includes("severe")) return "high";
  if (v.includes("moder") || v.includes("med")) return "medium";
  return "low";
}

function severityColor(s: Severity) {
  return s === "high" ? "#EF4444" : s === "medium" ? "#F59E0B" : "#34D399";
}

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(s?: string) {
  return escapeHtml(s || "").replace(/\r?\n/g, "<br/>");
}

function coerceFinalGoal(val: any): string {
  if (typeof val === "string") return val.trim();
  if (val && typeof val === "object") {
    const parts: string[] = [];
    if (typeof val.summary === "string" && val.summary.trim()) parts.push(val.summary.trim());
    if (Array.isArray(val.goals) && val.goals.length) parts.push(val.goals.map((g: any) => `• ${String(g)}`).join(" "));
    if (Number.isFinite(val.duration_months)) parts.push(`Estimated duration: ${val.duration_months} months`);
    if (typeof val.notes === "string" && val.notes.trim()) parts.push(val.notes.trim());
    return parts.join(" ").trim();
  }
  return "";
}

function tableRows(rows: { tooth: string; note: string; severity: Severity }[]) {
  if (!rows?.length) {
    return `<tr><td colspan="4" class="muted" style="text-align:center">No findings</td></tr>`;
  }
  return rows
    .map(
      (f, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(f.tooth)}</td>
            <td>${escapeHtml(f.note || "")}</td>
            <td><span class="sev ${f.severity === "high" ? "sev-high" : f.severity === "medium" ? "sev-med" : "sev-low"}">${severityLabel(f.severity)}</span></td>
        </tr>`
    )
    .join("");
}

function findingKey(f: { tooth: string; note: string }) {
  return `${String(f.tooth).trim()}||${String(f.note || "").trim().toLowerCase()}`;
}

function diffFindings(
  draft: { tooth: string; note: string; severity: Severity }[],
  latest: { tooth: string; note: string; severity: Severity }[]
) {
  const a = draft || [];
  const b = latest || [];
  const mapA = new Map<string, { tooth: string; note: string; severity: Severity }>();
  const mapB = new Map<string, { tooth: string; note: string; severity: Severity }>();
  a.forEach((f) => mapA.set(findingKey(f), f));
  b.forEach((f) => mapB.set(findingKey(f), f));

  const added: typeof b = [];
  const removed: typeof a = [];
  const modified: Array<{ tooth: string; from: { note: string; severity: Severity }; to: { note: string; severity: Severity } }> = [];
  const usedInB = new Set<string>();

  a.forEach((fa) => {
    const k = findingKey(fa);
    if (mapB.has(k)) {
      usedInB.add(k);
      return;
    }
    const candidates = b.filter((fb) => String(fb.tooth) === String(fa.tooth));
    const sameToothDifferent = candidates.find((fb) => fb.note !== fa.note || fb.severity !== fa.severity) || null;
    if (sameToothDifferent) {
      modified.push({ tooth: String(fa.tooth), from: { note: fa.note, severity: fa.severity }, to: { note: sameToothDifferent.note, severity: sameToothDifferent.severity } });
      usedInB.add(findingKey(sameToothDifferent));
    } else {
      removed.push(fa);
    }
  });

  b.forEach((fb) => {
    const k = findingKey(fb);
    if (!usedInB.has(k) && !mapA.has(k)) added.push(fb);
  });

  return { added, removed, modified };
}

function baseStyles() {
  return `
  :root { --text:#0b0c0e; --muted:#5a6472; --bg:#ffffff; --border:#e5e7eb; --accent:#2563eb; }
  *{box-sizing:border-box}
  body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif; color:var(--text); background:#fff; margin:0; padding:24px}
  h1{font-size:22px;margin:0 0 8px}
  h2{font-size:16px;margin:0 0 10px}
  h3{font-size:14px;margin:0 0 8px}
  p{margin:6px 0}
  small{color:var(--muted)}
  .card{border:1px solid var(--border); border-radius:12px; padding:14px; margin:10px 0; background:#fff}
  .grid{display:grid; gap:10px}
  .grid-2{grid-template-columns:1fr 1fr}
  .grid-3{grid-template-columns:1fr 1fr 1fr}
  .table{width:100%; border-collapse:collapse; font-size:12px}
  .table th,.table td{border-top:1px solid var(--border); padding:8px; text-align:left; vertical-align:top}
  .badges{display:flex; gap:6px; flex-wrap:wrap}
  .badge{display:inline-block; border:1px solid var(--border); border-radius:999px; padding:2px 8px; font-size:11px; color:var(--muted)}
  .sev{display:inline-block; border-radius:8px; padding:1px 6px; font-size:11px; margin-left:6px; border:1px solid}
  .sev-low{color:#066e2e; border-color:#a7f3d0; background:#ecfdf5}
  .sev-med{color:#8a4b00; border-color:#fde68a; background:#fffbeb}
  .sev-high{color:#991b1b; border-color:#fecaca; background:#fef2f2}
  .header{display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:12px}
  .kv{display:grid; grid-template-columns:180px 1fr; gap:6px; font-size:12px}
  .img-wrap{position:relative; width:100%; background:transparent; border-radius:12px; overflow:hidden; border:1px solid var(--border)}
  .img-wrap img{display:block; width:100%; height:auto; object-fit:contain; background:transparent}
  .img-wrap svg{position:absolute; inset:0; width:100%; height:100%}
  .legend{margin:10px 0 0 0; padding-left:16px; font-size:12px}
  .legend table{width:100%; border-collapse:collapse}
  .legend th,.legend td{border-top:1px solid var(--border); padding:8px; text-align:left; vertical-align:top; font-size:12px}
  .page{page-break-after:auto; padding:8px 0}
  .image-page .legend{break-inside:avoid}
  .final-goal{border:2px solid #111827; border-radius:12px; padding:12px; margin-top:8px; background:#f9fafb}
  `;
}

function hexOrDefault(c?: string, d = "#2563eb") {
  return c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : d;
}

function denorm(n: number, dim: number, isNorm?: boolean) {
  return isNorm ? n * dim : n;
}

function svgOverlay(width: number, height: number, overlays?: ImageOverlay[]) {
  if (!overlays?.length) return "";
  const parts: string[] = [];
  parts.push(`<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">`);
  overlays.forEach((o, idx) => {
    const color = hexOrDefault(o.color, "#EF4444");
    const g = o.geometry || {};
    const label = o.label || (o.findingIndex ? String(o.findingIndex) : String(idx + 1));
    const texts: Array<{ x: number; y: number }> = [];
    (g.circles || []).forEach((c) => {
      const cx = denorm(c.cx, width, c.norm);
      const cy = denorm(c.cy, height, c.norm);
      const r = denorm(c.r, Math.min(width, height), c.norm);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${color}" stroke-width="3" fill="none"/>`);
      texts.push({ x: cx, y: cy - r - 6 });
    });
    (g.lines || []).forEach((l) => {
      const x1 = denorm(l.x1, width, l.norm);
      const y1 = denorm(l.y1, height, l.norm);
      const x2 = denorm(l.x2, width, l.norm);
      const y2 = denorm(l.y2, height, l.norm);
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" />`);
      texts.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6 });
    });
    (g.boxes || []).forEach((b) => {
      const x = denorm(b.x, width, b.norm);
      const y = denorm(b.y, height, b.norm);
      const w = denorm(b.w, width, b.norm);
      const h = denorm(b.h, height, b.norm);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${color}" stroke-width="3" fill="${color}" fill-opacity="0.14"/>`);
      texts.push({ x: x + w / 2, y: y - 6 });
    });
    (g.polygons || []).forEach((p) => {
      const pts = p.points.map((pt) => `${denorm(pt.x, width, p.norm)},${denorm(pt.y, height, p.norm)}`).join(" ");
      parts.push(`<polygon points="${pts}" stroke="${color}" stroke-width="3" fill="${color}" fill-opacity="0.14"/>`);
      const f = p.points[0];
      texts.push({ x: denorm(f.x, width, p.norm), y: denorm(f.y, height, p.norm) - 6 });
    });
    if (texts.length) {
      const t0 = texts[0];
      const tx = Math.max(6, Math.min(width - 6, t0.x));
      const ty = Math.max(14, Math.min(height - 6, t0.y));
      parts.push(
        `<g font-family="Inter,system-ui,sans-serif" font-size="${Math.max(12, Math.round(width * 0.016))}" font-weight="700">` +
          `<circle cx="${tx}" cy="${ty - 4}" r="10" fill="#111827" stroke="#ffffff" stroke-width="2"/>` +
          `<text x="${tx}" y="${ty - 4}" fill="#ffffff" dominant-baseline="middle" text-anchor="middle">${escapeHtml(label)}</text>` +
        `</g>`
      );
    }
  });
  parts.push(`</svg>`);
  return parts.join("");
}

function imageFigure(img: ReviewPacketImage, idx: number, perImagePage = false) {
  const w = img.width && img.width > 0 ? img.width : 1000;
  const h = img.height && img.height > 0 ? img.height : 750;
  const ratio = `${w}/${h}`;
  const overlaySvg = svgOverlay(w, h, img.overlays);
  const legendRows = (img.findings || [])
    .map((f, i) => {
      const num = typeof f.index === "number" ? f.index : i + 1;
      return `
        <tr>
            <td>${num}</td>
            <td>${escapeHtml(String(f.tooth))}</td>
            <td>${escapeHtml(f.note || "")}</td>
            <td><span class="sev ${f.severity === "high" ? "sev-high" : f.severity === "medium" ? "sev-med" : "sev-low"}">${severityLabel(f.severity)}</span></td>
        </tr>
        `;
    })
    .join("");
  return `
        <figure class="${perImagePage ? "page" : ""}">
        <div class="img-wrap" style="aspect-ratio:${ratio}">
            <img src="${img.url}" alt="${escapeHtml(img.caption || `Image ${img.index ?? idx + 1}`)}"/>
            ${overlaySvg}
        </div>
        ${img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : "<figcaption></figcaption>"}
        ${
          legendRows
            ? `<div class="legend" role="region" aria-label="Legend for image ${img.index ?? idx + 1}">
                <table class="table">
                    <thead><tr><th>#</th><th>Tooth (FDI)</th><th>Finding</th><th>Severity</th></tr></thead>
                    <tbody>${legendRows}</tbody>
                </table>
              </div>`
            : ""
        }
        </figure>
    `;
}

function groupToothMap(rows: { tooth: string; note: string; severity: Severity }[]) {
  const byTooth = new Map<string, { tooth: string; notes: string[]; severity: Severity }>();
  const sevRank = { low: 0, medium: 1, high: 2 } as const;
  rows.forEach((r) => {
    const k = String(r.tooth);
    const prev = byTooth.get(k);
    if (!prev) {
      byTooth.set(k, { tooth: k, notes: [r.note], severity: r.severity });
    } else {
      if (!prev.notes.includes(r.note)) prev.notes.push(r.note);
      if (sevRank[r.severity] > sevRank[prev.severity]) prev.severity = r.severity;
    }
  });
  const list = Array.from(byTooth.values()).sort((a, b) => String(a.tooth).localeCompare(String(b.tooth)));
  if (!list.length) return `<tr><td colspan="3" class="muted" style="text-align:center">No tooth-level findings</td></tr>`;
  return list
    .map(
      (t, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(t.tooth)}</td>
            <td>
            <div>${escapeHtml(t.notes.join("; "))}</div>
            <div style="margin-top:2px" class="sev ${t.severity === "high" ? "sev-high" : t.severity === "medium" ? "sev-med" : "sev-low"}">${severityLabel(t.severity)}</div>
            </td>
        </tr>`
    )
    .join("");
}

function coerceGeometryFromOverlays(overlays: any): Geometry {
  const arr = Array.isArray(overlays) ? overlays : Array.isArray(overlays?.geometry) ? overlays.geometry : [];
  const g: Geometry = {};
  for (const o of arr) {
    const t = String(o?.type || "").toLowerCase();
    if (t === "circle" || t === "ellipse") {
      const cx = Number(o?.center?.[0]);
      const cy = Number(o?.center?.[1]);
      const r = Number(o?.radius);
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r)) {
        g.circles = g.circles || [];
        g.circles.push({ cx, cy, r, norm: true });
      }
      continue;
    }
    if (t === "bbox" || t === "rect" || t === "rectangle" || t === "box") {
      const b = Array.isArray(o?.bbox) ? o.bbox : Array.isArray(o?.box) ? o.box : Array.isArray(o?.rect) ? o.rect : null;
      if (b && b.length >= 4) {
        g.boxes = g.boxes || [];
        g.boxes.push({ x: Number(b[0]), y: Number(b[1]), w: Number(b[2]), h: Number(b[3]), norm: true });
      }
      continue;
    }
    if (t === "line") {
      const pts = Array.isArray(o?.points) ? o.points : [];
      if (pts.length >= 2) {
        const [p1, p2] = pts;
        g.lines = g.lines || [];
        g.lines.push({ x1: Number(p1[0]), y1: Number(p1[1]), x2: Number(p2[0]), y2: Number(p2[1]), norm: true });
      }
      continue;
    }
    if (t === "polyline" || t === "polygon") {
      const pts = Array.isArray(o?.points) ? o.points : [];
      if (pts.length >= 2) {
        g.polygons = g.polygons || [];
        g.polygons.push({ points: pts.map((p: any) => ({ x: Number(p[0]), y: Number(p[1]), norm: true })), norm: true });
      }
      continue;
    }
  }
  return g;
}

function applyFindingChanges(findings: { tooth: string; note: string; severity: Severity }[], images: ReviewPacketImage[] | undefined, changes: any[]) {
  if (!Array.isArray(changes) || changes.length === 0) return { findings, images: images || [] };
  const outFindings = [...(findings || [])];
  const outImages = (images || []).map((im) => ({ ...im, overlays: [...(im.overlays || [])], findings: [...(im.findings || [])] }));

  for (const ch of changes) {
    const action = String(ch?.action || ch?.op || "modify").toLowerCase();
    const tooth = ch?.tooth_fdi ?? ch?.tooth ?? ch?.toothNumber ?? null;
    const note = ch?.text ?? ch?.note ?? null;
    const sev = ch?.severity ? normSeverity(ch.severity) : undefined;
    const imgIndex =
      Number.isInteger(ch?.image_index) ? Number(ch.image_index) :
      Number.isInteger(ch?.image) ? Number(ch.image) :
      undefined;

    if (action === "remove") {
      const idx = outFindings.findIndex((f) => (tooth == null || String(f.tooth) === String(tooth)) && (note == null || String(f.note).toLowerCase() === String(note).toLowerCase()));
      if (idx >= 0) outFindings.splice(idx, 1);
      continue;
    }

    if (action === "add") {
      outFindings.push({
        tooth: tooth != null ? String(tooth) : "",
        note: note != null ? String(note) : "",
        severity: sev || "low",
      });
    }

    if (action === "modify") {
      const idx = outFindings.findIndex((f) => (tooth != null ? String(f.tooth) === String(tooth) : true) && (note != null ? String(f.note).toLowerCase() === String(note).toLowerCase() : true));
      if (idx >= 0) {
        const prev = outFindings[idx];
        outFindings[idx] = {
          tooth: tooth != null ? String(tooth) : prev.tooth,
          note: note != null ? String(note) : prev.note,
          severity: sev || prev.severity,
        };
      } else if (tooth != null || note != null || sev) {
        outFindings.push({
          tooth: tooth != null ? String(tooth) : "",
          note: note != null ? String(note) : "",
          severity: sev || "low",
        });
      }
    }

    if (ch?.overlays || ch?.geometry) {
      const g = coerceGeometryFromOverlays(ch?.overlays ?? ch?.geometry);
      const color = sev ? severityColor(sev) : "#EF4444";
      const targetIdx = typeof imgIndex === "number" && imgIndex >= 0 && imgIndex < outImages.length ? imgIndex : 0;
      if (outImages[targetIdx]) {
        const nextIndex = (outImages[targetIdx].findings?.length || 0) + (outImages[targetIdx].overlays?.length || 0) + 1;
        outImages[targetIdx].overlays = outImages[targetIdx].overlays || [];
        outImages[targetIdx].overlays.push({
          findingIndex: nextIndex,
          label: String(tooth ?? nextIndex),
          color,
          geometry: g,
        });
        if (tooth != null || note != null || sev) {
          outImages[targetIdx].findings = outImages[targetIdx].findings || [];
          outImages[targetIdx].findings.push({
            tooth: String(tooth ?? ""),
            note: String(note ?? ""),
            severity: sev || "low",
            index: nextIndex,
          });
        }
      }
    }
  }

  return { findings: outFindings, images: outImages };
}

export function buildReviewPacketHTML(data: ReviewPacketData) {
  const created = formatDate(data.createdAt || new Date());
  const withChanges = data.rebuttal?.finding_changes ? applyFindingChanges(data.findings || [], data.images || [], data.rebuttal.finding_changes) : { findings: data.findings || [], images: data.images || [] };
  const rows = tableRows(withChanges.findings);
  const updatesList = (data.rebuttal?.updates || [])
    .map(
      (u, idx) => `
        <li>
            <div class="upd-head">
            <span class="badge">${u.action}</span>
            <strong>${escapeHtml(u.topic || "Untitled")}</strong>
            <span class="muted">#${idx + 1}</span>
            </div>
            ${u.text ? `<div class="upd-text">${nl2br(u.text)}</div>` : ""}
            ${u.rationale ? `<div class="upd-rationale"><em>Reason:</em> ${nl2br(u.rationale)}</div>` : ""}
        </li>`
    )
    .join("");

  const alignmentTable = (data.rebuttal?.feedbackAlignment || [])
    .map(
      (a) => `
        <tr>
            <td>${a.itemNumber || ""}</td>
            <td>${nl2br(a.itemText || "")}</td>
            <td>${escapeHtml(a.decision || "")}</td>
            <td>${nl2br(a.reason || "")}</td>
            <td>${Array.isArray(a.linkedUpdates) ? a.linkedUpdates.join(", ") : ""}</td>
        </tr>`
    )
    .join("");

  const imagesGrid = (withChanges.images || []).map((img, i) => imageFigure(img, i, false)).join("");

  const toothMap = groupToothMap(withChanges.findings);

  const finalGoal = coerceFinalGoal(data.treatmentGoalFinal);

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charSet="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Case ${escapeHtml(data.caseId)}</title>
      <style>${baseStyles()}</style>
  </head>
  <body>
      <main class="page">
      <section class="card">
          <div class="header">
            <div>
              <h1>Review Packet</h1>
              <small>Case ${escapeHtml(data.caseId)}</small>
            </div>
            <div class="badges">
              <span class="badge">${created}</span>
            </div>
          </div>

          <section class="card">
            <h2>Summary</h2>
            <p>${nl2br(data.summary || "No summary provided")}</p>
          </section>

          ${finalGoal ? `<section class="card"><h2>Final treatment goal</h2><div class="final-goal">${escapeHtml(finalGoal)}</div></section>` : ""}

          <section class="card">
            <h2>Findings</h2>
            <table class="table" role="table" aria-label="Findings">
              <thead><tr><th>#</th><th>Tooth</th><th>Note</th><th>Severity</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </section>

          <section class="card">
            <h2>Tooth → Findings Map</h2>
            <table class="table" role="table" aria-label="Tooth map">
              <thead><tr><th>#</th><th>Tooth (FDI)</th><th>Findings</th></tr></thead>
              <tbody>${toothMap}</tbody>
            </table>
          </section>

          ${
            data.rebuttal
              ? `
          <section class="card">
            <h2>Rebuttal</h2>
            ${data.rebuttal?.narrative ? `<p>${nl2br(data.rebuttal.narrative)}</p>` : ""}
            ${updatesList ? `<ol class="legend">${updatesList}</ol>` : `<p class="muted">No updates provided.</p>`}
            ${
              alignmentTable
                ? `<div style="margin-top:12px">
                    <table class="table" role="table" aria-label="Feedback addressed">
                        <thead><tr><th>#</th><th>Feedback</th><th>Decision</th><th>Reason</th><th>Updates</th></tr></thead>
                        <tbody>${alignmentTable}</tbody>
                    </table>
                  </div>`
                : ""
            }
          </section>
          `
              : ""
          }

          <section class="card">
            <h2>Images</h2>
            <div class="grid">${imagesGrid || `<div class="muted">No images</div>`}</div>
          </section>

          <div class="card" style="display:flex;justify-content:space-between;align-items:center">
            <span class="muted">Confidential clinical document</span>
            <span class="badge">DentistFront</span>
          </div>
      </section>
      </main>
  </body>
  </html>
  `;
}

export function buildReviewPacketHTMLCompare(data: ReviewCompareData) {
  const created = formatDate(data.createdAt || new Date());
  const draftRows = tableRows(data.findings.draft);
  const latestRows = tableRows(data.findings.latest);
  const diff = diffFindings(data.findings.draft || [], data.findings.latest || []);
  const changesHtml =
    !diff.added.length && !diff.removed.length && !diff.modified.length
      ? `<p class="muted">No changes detected between Draft and Latest.</p>`
      : `
        <ul class="legend">
            ${
              diff.added.length
                ? `<li><strong>Added:</strong> ${diff.added
                    .map((f) => `${escapeHtml(f.tooth)} — ${escapeHtml(f.note)} (${severityLabel(f.severity)})`)
                    .join("; ")}</li>`
                : ""
            }
            ${
              diff.removed.length
                ? `<li><strong>Removed:</strong> ${diff.removed
                    .map((f) => `${escapeHtml(f.tooth)} — ${escapeHtml(f.note)} (${severityLabel(f.severity)})`)
                    .join("; ")}</li>`
                : ""
            }
            ${
              diff.modified.length
                ? `<li><strong>Modified:</strong> ${diff.modified
                    .map(
                      (m) =>
                        `${escapeHtml(m.tooth)} — ${escapeHtml(m.from.note)} (${severityLabel(
                          m.from.severity
                        )}) → ${escapeHtml(m.to.note)} (${severityLabel(m.to.severity)})`
                    )
                    .join("; ")}</li>`
                : ""
            }
        </ul>
        `;

  const updatesList = (data.rebuttal?.updates || [])
    .map(
      (u, idx) => `
        <li>
            <div class="upd-head">
            <span class="badge">${u.action}</span>
            <strong>${escapeHtml(u.topic || "Untitled")}</strong>
            <span class="muted">#${idx + 1}</span>
            </div>
            ${u.text ? `<div class="upd-text">${nl2br(u.text)}</div>` : ""}
            ${u.rationale ? `<div class="upd-rationale"><em>Reason:</em> ${nl2br(u.rationale)}</div>` : ""}
        </li>`
    )
    .join("");

  const alignmentTable = (data.rebuttal?.feedbackAlignment || [])
    .map(
      (a) => `
        <tr>
            <td>${a.itemNumber || ""}</td>
            <td>${nl2br(a.itemText || "")}</td>
            <td>${escapeHtml(a.decision || "")}</td>
            <td>${nl2br(a.reason || "")}</td>
            <td>${Array.isArray(a.linkedUpdates) ? a.linkedUpdates.join(", ") : ""}</td>
        </tr>`
    )
    .join("");

  const imagesGrid = (data.images || []).map((img, i) => imageFigure(img, i, false)).join("");

  const toothMapLatest = groupToothMap(data.findings.latest || []);

  const perImagePages = (data.images || []).map((img, i) => imageFigure(img, i, true)).join("");

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charSet="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Case ${escapeHtml(data.caseId)}</title>
      <style>${baseStyles()}</style>
  </head>
  <body>
      <main class="page">
      <section class="card">
          <div class="header">
            <div>
              <h1>${data.versions.latest.isRebuttal ? "Rebuttal Packet" : "Review Packet"}</h1>
              <small>Case ${escapeHtml(data.caseId)}</small>
            </div>
            <div class="badges">
              <span class="badge">${created}</span>
            </div>
          </div>

          <section class="card">
            <h2>Summary — Draft vs ${data.versions.latest.isRebuttal ? "Rebuttal" : "Latest"}</h2>
            <div class="grid grid-2">
              <div>
                <h3>Draft v${data.versions.draft.version}</h3>
                <p>${nl2br(data.versions.draft.summary || "—")}</p>
              </div>
              <div>
                <h3>${data.versions.latest.isRebuttal ? "Rebuttal" : "Latest"} v${data.versions.latest.version}</h3>
                <p>${nl2br(data.versions.latest.summary || "—")}</p>
              </div>
            </div>
          </section>

          <section class="card">
            <h2>What Changed</h2>
            ${changesHtml}
          </section>

          <section class="card">
            <h2>Findings — Side by Side</h2>
            <div class="grid grid-2">
              <div>
                <h3>Draft v${data.versions.draft.version}</h3>
                <table class="table" role="table" aria-label="Draft findings">
                  <thead><tr><th>#</th><th>Tooth</th><th>Note</th><th>Severity</th></tr></thead>
                  <tbody>${draftRows}</tbody>
                </table>
              </div>
              <div>
                <h3>${data.versions.latest.isRebuttal ? "Rebuttal" : "Latest"} v${data.versions.latest.version}</h3>
                <table class="table" role="table" aria-label="Latest findings">
                  <thead><tr><th>#</th><th>Tooth</th><th>Note</th><th>Severity</th></tr></thead>
                  <tbody>${latestRows}</tbody>
                </table>
              </div>
            </div>
          </section>

          <section class="card">
            <h2>Tooth → Findings Map (Latest)</h2>
            <table class="table" role="table" aria-label="Tooth map latest">
              <thead><tr><th>#</th><th>Tooth (FDI)</th><th>Findings</th></tr></thead>
              <tbody>${toothMapLatest}</tbody>
            </table>
          </section>

          ${
            data.rebuttal
              ? `
          <section class="card">
            <h2>Rebuttal</h2>
            ${data.rebuttal?.narrative ? `<p>${nl2br(data.rebuttal.narrative)}</p>` : ""}
            ${updatesList ? `<ol class="legend">${updatesList}</ol>` : `<p class="muted">No updates provided.</p>`}
          </section>

          <section class="card">
            <h2>Feedback Addressed</h2>
            ${
              alignmentTable
                ? `<div>
                    <table class="table" role="table" aria-label="Feedback alignment">
                        <thead>
                        <tr><th>#</th><th>Feedback</th><th>Decision</th><th>Reason</th><th>Updates</th></tr>
                        </thead>
                        <tbody>${alignmentTable}</tbody>
                    </table>
                  </div>`
                : `<p class="muted">No explicit clinician feedback was provided.</p>`
            }
          </section>
          `
              : ""
          }

          <section class="card">
            <h2>Images (Overview)</h2>
            <div class="grid">${imagesGrid || `<div class="muted">No images</div>`}</div>
          </section>

          ${perImagePages ? `<section class="card"><h2>Per-Image Pages</h2>${perImagePages}</section>` : ""}

          <div class="card" style="display:flex;justify-content:space-between;align-items:center">
            <span class="muted">Confidential clinical document</span>
            <span class="badge">DentistFront</span>
          </div>
      </section>
      </main>
  </body>
  </html>
  `;
}
