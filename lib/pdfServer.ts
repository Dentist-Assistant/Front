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

export type Point = { x: number; y: number };
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
  };
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
  return s === "high" ? "High" : s === "medium" ? "Medium" : "Low";
}

function severityColor(s: Severity) {
  return s === "high" ? "var(--color-danger)" : s === "medium" ? "var(--color-warning)" : "var(--color-success)";
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
        <td><span style="color:${severityColor(f.severity)};font-weight:600">${severityLabel(f.severity)}</span></td>
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
  :root{
    --color-bg:#0B1220; --color-surface:#0F172A; --color-primary:#22D3EE;
    --color-success:#34D399; --color-warning:#F59E0B; --color-danger:#EF4444;
    --color-text:#E2E8F0; --color-muted:#94A3B8; --radius-xl:1rem; --radius-2xl:1.25rem;
  }
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  .page{max-width:980px;margin:0 auto;padding:32px}
  .card{background:var(--color-surface);border:1px solid rgba(226,232,240,.08);box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:var(--radius-2xl);overflow:hidden}
  .header{padding:28px 28px 16px;border-bottom:1px solid rgba(226,232,240,.06)}
  .title{font-size:22px;font-weight:700;margin:0 0 6px}
  .meta{display:flex;flex-wrap:wrap;gap:12px;color:var(--color-muted);font-size:13px}
  .chip{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;background:rgba(34,211,238,.12);color:var(--color-primary);font-weight:600;font-size:12px}
  .section{padding:22px 28px}
  .section h3{margin:0 0 12px;font-size:16px;opacity:.95;letter-spacing:.2px}
  .muted{color:var(--color-muted)}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .panel{border:1px solid rgba(226,232,240,.06);border-radius:14px;padding:14px}
  .panel h4{margin:0 0 8px;font-size:14px;color:var(--color-text)}
  table{width:100%;border-collapse:collapse}
  th,td{padding:12px 10px;border-bottom:1px solid rgba(226,232,240,.06);vertical-align:top;font-size:13px}
  thead th{text-align:left;color:var(--color-muted);font-weight:600}
  tbody tr:hover{background:rgba(34,211,238,.06)}
  .grid-img{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:8px}
  figure{margin:0;background:rgba(226,232,240,.03);border:1px solid rgba(226,232,240,.06);border-radius:14px;overflow:hidden}
  .img-wrap{position:relative;width:100%;background:#000}
  .img-wrap img{display:block;width:100%;height:100%;object-fit:contain;background:#000}
  .img-wrap svg{position:absolute;inset:0;width:100%;height:100%}
  figcaption{padding:8px 10px;color:var(--color-muted);font-size:12px;border-top:1px solid rgba(226,232,240,.06)}
  .updates{margin:10px 0 0 18px}
  .updates li{margin:8px 0 14px}
  .upd-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}
  .pill{padding:2px 8px;border-radius:999px;font-size:11px;border:1px solid rgba(226,232,240,.14)}
  .action-add{background:color-mix(in oklab, var(--color-success) 18%, transparent)}
  .action-modify{background:color-mix(in oklab, var(--color-warning) 18%, transparent)}
  .action-remove{background:color-mix(in oklab, var(--color-danger) 18%, transparent)}
  .delta-add{color:var(--color-success)}
  .delta-rem{color:var(--color-danger)}
  .delta-mod{color:var(--color-warning)}
  .footer{padding:18px 28px;border-top:1px solid rgba(226,232,240,.06);color:var(--color-muted);font-size:12px;display:flex;justify-content:space-between;gap:12px}
  .brand{font-weight:700;color:var(--color-primary)}
  .legend{margin-top:10px;border:1px solid rgba(226,232,240,.06);border-radius:12px;overflow:hidden}
  .legend table{width:100%}
  .legend th,.legend td{padding:8px 10px;font-size:12px}
  .page-break{page-break-before:always}
  @media print {.page{max-width:100%;padding:0} .card{border:none;box-shadow:none;border-radius:0} .section{padding:16px} .grid-img{grid-template-columns:1fr} .page-break{page-break-before:always}}
  `;
}

function hexOrDefault(c?: string, d = "#22D3EE") {
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
    const color = hexOrDefault(o.color);
    const g = o.geometry || {};
    const label = o.label || (o.findingIndex ? `#${o.findingIndex}` : `#${idx + 1}`);
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
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3"/>`);
      texts.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6 });
    });
    (g.boxes || []).forEach((b) => {
      const x = denorm(b.x, width, b.norm);
      const y = denorm(b.y, height, b.norm);
      const w = denorm(b.w, width, b.norm);
      const h = denorm(b.h, height, b.norm);
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${color}" stroke-width="3" fill="rgba(255,255,255,0.06)"/>`);
      texts.push({ x: x + w / 2, y: y - 6 });
    });
    (g.polygons || []).forEach((p) => {
      const pts = p.points.map((pt) => `${denorm(pt.x, width, p.norm)},${denorm(pt.y, height, p.norm)}`).join(" ");
      parts.push(`<polygon points="${pts}" stroke="${color}" stroke-width="3" fill="rgba(255,255,255,0.06)"/>`);
      const f = p.points[0];
      texts.push({ x: denorm(f.x, width, p.norm), y: denorm(f.y, height, p.norm) - 6 });
    });
    texts.slice(0, 1).forEach((t) => {
      const tx = Math.max(6, Math.min(width - 6, t.x));
      const ty = Math.max(14, Math.min(height - 6, t.y));
      parts.push(
        `<g font-family="Inter,system-ui,sans-serif" font-size="${Math.max(12, Math.round(width * 0.016))}" font-weight="700">` +
          `<rect x="${tx - 8}" y="${ty - 16}" width="${label.length * 8 + 16}" height="20" rx="4" ry="4" fill="rgba(0,0,0,0.55)"/>` +
          `<text x="${tx}" y="${ty}" fill="#ffffff">${escapeHtml(label)}</text>` +
        `</g>`
      );
    });
  });
  parts.push(`</svg>`);
  return parts.join("");
}

function imageFigure(img: ReviewPacketImage, idx: number, perImagePage = false) {
  const w = img.width && img.width > 0 ? img.width : 1200;
  const h = img.height && img.height > 0 ? img.height : 900;
  const ratio = `${w}/${h}`;
  const overlaySvg = svgOverlay(w, h, img.overlays);
  const legendRows = (img.findings || []).map((f, i) => {
    const num = typeof f.index === "number" ? f.index : i + 1;
    return `
      <tr>
        <td>${num}</td>
        <td>${escapeHtml(String(f.tooth))}</td>
        <td>${escapeHtml(f.note || "")}</td>
        <td><span style="color:${severityColor(f.severity)};font-weight:600">${severityLabel(f.severity)}</span></td>
      </tr>
    `;
  }).join("");
  return `
    <figure class="${perImagePage ? "page-break" : ""}">
      <div class="img-wrap" style="aspect-ratio:${ratio}">
        <img src="${img.url}" alt="${escapeHtml(img.caption || `Image ${img.index ?? idx + 1}`)}"/>
        ${overlaySvg}
      </div>
      ${img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : "<figcaption></figcaption>"}
      ${
        legendRows
          ? `<div class="legend" role="region" aria-label="Legend for image ${img.index ?? idx + 1}">
              <table>
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
          <div style="margin-top:2px;color:${severityColor(t.severity)};font-weight:600">${severityLabel(t.severity)}</div>
        </td>
      </tr>`
    )
    .join("");
}

export function buildReviewPacketHTML(data: ReviewPacketData) {
  const created = formatDate(data.createdAt || new Date());
  const rows = tableRows(data.findings || []);
  const updatesList = (data.rebuttal?.updates || [])
    .map(
      (u, idx) => `
      <li>
        <div class="upd-head">
          <span class="pill action-${u.action}">${u.action}</span>
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

  const toothMap = groupToothMap(data.findings || []);

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
        <header class="header">
          <div class="chip">Standard Report</div>
          <h1 class="title">Case ${escapeHtml(data.caseId)}</h1>
          <div class="meta">
            <span>Patient: <strong>${escapeHtml(data.patientName)}</strong></span>
            ${data.doctorName ? `<span>Doctor: <strong>${escapeHtml(data.doctorName)}</strong></span>` : ""}
            ${data.technicianName ? `<span>Technician: <strong>${escapeHtml(data.technicianName)}</strong></span>` : ""}
            <span>Date: ${created}</span>
          </div>
        </header>

        <section class="section">
          <h3>Summary</h3>
          <p>${nl2br(data.summary || "No summary provided")}</p>
        </section>

        <section class="section">
          <h3>Findings</h3>
          <div style="overflow:auto;border:1px solid rgba(226,232,240,.06);border-radius:12px">
            <table role="table" aria-label="Findings">
              <thead><tr><th>#</th><th>Tooth</th><th>Note</th><th>Severity</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <h3>Tooth → Findings Map</h3>
          <div style="overflow:auto;border:1px solid rgba(226,232,240,.06);border-radius:12px">
            <table role="table" aria-label="Tooth map">
              <thead><tr><th>#</th><th>Tooth (FDI)</th><th>Findings</th></tr></thead>
              <tbody>${toothMap}</tbody>
            </table>
          </div>
        </section>

        ${
          data.rebuttal
            ? `
        <section class="section">
          <h3>Rebuttal</h3>
          ${data.rebuttal?.narrative ? `<p>${nl2br(data.rebuttal.narrative)}</p>` : ""}
          ${updatesList ? `<ol class="updates">${updatesList}</ol>` : `<p class="muted">No updates provided.</p>`}
          ${
            alignmentTable
              ? `<div style="margin-top:12px;border:1px solid rgba(226,232,240,.06);border-radius:12px;overflow:auto">
                  <table role="table" aria-label="Feedback addressed">
                    <thead><tr><th>#</th><th>Feedback</th><th>Decision</th><th>Reason</th><th>Updates</th></thead>
                    <tbody>${alignmentTable}</tbody>
                  </table>
                </div>`
              : ""
          }
        </section>
        `
            : ""
        }

        <section class="section">
          <h3>Images</h3>
          <div class="grid-img">${imagesGrid || `<div class="muted">No images</div>`}</div>
        </section>

        <footer class="footer">
          <span class="brand">DentistFront</span>
          <span>${escapeHtml(data.footerNote || "Confidential clinical document")}</span>
        </footer>
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
      <ul style="margin:0;padding-left:18px">
        ${
          diff.added.length
            ? `<li class="delta-add"><strong>Added:</strong> ${diff.added
                .map((f) => `${escapeHtml(f.tooth)} — ${escapeHtml(f.note)} (${severityLabel(f.severity)})`)
                .join("; ")}</li>`
            : ""
        }
        ${
          diff.removed.length
            ? `<li class="delta-rem"><strong>Removed:</strong> ${diff.removed
                .map((f) => `${escapeHtml(f.tooth)} — ${escapeHtml(f.note)} (${severityLabel(f.severity)})`)
                .join("; ")}</li>`
            : ""
        }
        ${
          diff.modified.length
            ? `<li class="delta-mod"><strong>Modified:</strong> ${diff.modified
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
          <span class="pill action-${u.action}">${u.action}</span>
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
        <header class="header">
          <div class="chip">${data.versions.latest.isRebuttal ? "Rebuttal Packet" : "Review Packet"}</div>
          <h1 class="title">Case ${escapeHtml(data.caseId)}</h1>
          <div class="meta">
            <span>Patient: <strong>${escapeHtml(data.patientName)}</strong></span>
            ${data.doctorName ? `<span>Doctor: <strong>${escapeHtml(data.doctorName)}</strong></span>` : ""}
            ${data.technicianName ? `<span>Technician: <strong>${escapeHtml(data.technicianName)}</strong></span>` : ""}
            <span>Date: ${created}</span>
          </div>
        </header>

        <section class="section">
          <h3>Summary — Draft vs ${data.versions.latest.isRebuttal ? "Rebuttal" : "Latest"}</h3>
          <div class="grid-2">
            <div class="panel">
              <h4>Draft v${data.versions.draft.version}</h4>
              <p>${nl2br(data.versions.draft.summary || "—")}</p>
            </div>
            <div class="panel">
              <h4>${data.versions.latest.isRebuttal ? "Rebuttal" : "Latest"} v${data.versions.latest.version}</h4>
              <p>${nl2br(data.versions.latest.summary || "—")}</p>
            </div>
          </div>
        </section>

        <section class="section">
          <h3>What Changed</h3>
          ${changesHtml}
        </section>

        <section class="section">
          <h3>Findings — Side by Side</h3>
          <div class="grid-2">
            <div class="panel">
              <h4>Draft v${data.versions.draft.version}</h4>
              <div style="overflow:auto;border:1px solid rgba(226,232,240,.06);border-radius:12px">
                <table role="table" aria-label="Draft findings">
                  <thead><tr><th>#</th><th>Tooth</th><th>Note</th><th>Severity</th></tr></thead>
                  <tbody>${draftRows}</tbody>
                </table>
              </div>
            </div>
            <div class="panel">
              <h4>${data.versions.latest.isRebuttal ? "Rebuttal" : "Latest"} v${data.versions.latest.version}</h4>
              <div style="overflow:auto;border:1px solid rgba(226,232,240,.06);border-radius:12px">
                <table role="table" aria-label="Latest findings">
                  <thead><tr><th>#</th><th>Tooth</th><th>Note</th><th>Severity</th></tr></thead>
                  <tbody>${latestRows}</tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section class="section">
          <h3>Tooth → Findings Map (Latest)</h3>
          <div style="overflow:auto;border:1px solid rgba(226,232,240,.06);border-radius:12px">
            <table role="table" aria-label="Tooth map latest">
              <thead><tr><th>#</th><th>Tooth (FDI)</th><th>Findings</th></tr></thead>
              <tbody>${toothMapLatest}</tbody>
            </table>
          </div>
        </section>

        ${
          data.rebuttal
            ? `
        <section class="section">
          <h3>Rebuttal</h3>
          ${data.rebuttal?.narrative ? `<p>${nl2br(data.rebuttal.narrative)}</p>` : ""}
          ${updatesList ? `<ol class="updates">${updatesList}</ol>` : `<p class="muted">No updates provided.</p>`}
        </section>

        <section class="section">
          <h3>Feedback Addressed</h3>
          ${
            alignmentTable
              ? `<div style="border:1px solid rgba(226,232,240,.06);border-radius:12px;overflow:auto">
                  <table role="table" aria-label="Feedback alignment">
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

        <section class="section">
          <h3>Images (Overview)</h3>
          <div class="grid-img">${imagesGrid || `<div class="muted">No images</div>`}</div>
        </section>

        ${
          perImagePages
            ? `
        <section class="section">
          <h3>Per-Image Pages</h3>
          ${perImagePages}
        </section>`
            : ""
        }

        <footer class="footer">
          <span class="brand">DentistFront</span>
          <span>${escapeHtml(data.footerNote || "Confidential clinical document")}</span>
        </footer>
      </section>
    </main>
  </body>
</html>
`;
}
