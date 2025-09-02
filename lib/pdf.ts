// lib/pdf.ts
"use client";

import { buildReviewPacketHTMLCompare, type ReviewCompareData } from "./pdfServer";

export type Severity = "low" | "medium" | "high";

export type ReviewPacketData = {
  caseId: string;
  patientName: string;
  createdAt: Date | string;
  summary?: string;
  images: Array<{ url: string; caption?: string }>;
  findings: Array<{
    tooth: string;
    note: string;
    severity?: Severity;
    confidence?: number; // 0..1 or 0..100, optional
    imageIndex?: number | null;
  }>;
  measurements?: {
    overjet_mm?: number;
    overbite_percent?: number;
    midline_deviation_mm?: number;
    crowding_upper_mm?: number;
    crowding_lower_mm?: number;
    arch_length_upper_mm?: number;
    arch_length_lower_mm?: number;
  };
  occlusion?: {
    class_right?: string;
    class_left?: string;
    open_bite?: boolean;
    crossbite?: boolean;
    overjet_tendency?: string;
    overbite_tendency?: string;
  };
  hygiene?: {
    plaque?: string;
    calculus?: string;
    gingival_inflammation?: string;
    bleeding_on_probing?: string;
  };
  recommendations?: string[];
  treatmentGoalFinal?: string | null; // preferred
  treatment_goal_final?: string | null; // backward compat
  footerNote?: string;
};

type Role = "dentist" | "technician" | "admin";

function assertDentist(role: Role = "dentist") {
  if (role !== "dentist" && role !== "admin") {
    throw new Error("Preview/print is restricted to dentists.");
  }
}

function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function htmlToObjectUrl(html: string) {
  const blob = new Blob([html], { type: "text/html" });
  return URL.createObjectURL(blob);
}

export function revokePreviewUrl(url: string) {
  try {
    URL.revokeObjectURL(url);
  } catch {}
}

export function previewUrl(data: ReviewPacketData, opts?: { role?: Role }) {
  assertDentist(opts?.role ?? "dentist");
  const html = buildReviewPacketHTML(data);
  return htmlToObjectUrl(html);
}

export function printReviewPacket(data: ReviewPacketData, opts?: { role?: Role }) {
  assertDentist(opts?.role ?? "dentist");
  const html = buildReviewPacketHTML(data);
  openPrintWindow(html);
}

export function previewUrlCompare(data: ReviewCompareData, opts?: { role?: Role }) {
  assertDentist(opts?.role ?? "dentist");
  const html = buildReviewPacketHTMLCompare(data);
  return htmlToObjectUrl(html);
}

export function printReviewPacketCompare(data: ReviewCompareData, opts?: { role?: Role }) {
  assertDentist(opts?.role ?? "dentist");
  const html = buildReviewPacketHTMLCompare(data);
  openPrintWindow(html);
}

/* ---------------------------- HTML Builder ---------------------------- */

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return esc(String(d));
  return date.toLocaleString();
}

function sevLabel(s?: Severity | null) {
  if (s === "high") return "High";
  if (s === "medium") return "Moderate";
  if (s === "low") return "Low";
  return "—";
}

function sevColor(s?: Severity | null) {
  if (s === "high") return "#EF4444";
  if (s === "medium") return "#F59E0B";
  return "#34D399";
}

function confPct(val?: number) {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  if (val <= 1) return Math.round(val * 100);
  if (val <= 100) return Math.round(val);
  if (val <= 10000) return Math.round(val / 100);
  return Math.round(Math.min(100, Math.max(0, val / 100)));
}

function mm(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)} mm` : "—";
}
function pct(n?: number) {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(2)} %` : "—";
}
function yesno(v?: boolean) {
  return v === true ? "Yes" : v === false ? "No" : "—";
}

function styles() {
  return `
  <style>
    :root{
      --bg:#0B1220;
      --surface:#0E1628;
      --text:#E2E8F0;
      --muted:#94A3B8;
      --border:rgba(226,232,240,.16);
      --primary:#7C9CFF;
      --success:#34D399;
      --warning:#F59E0B;
      --danger:#EF4444;
    }
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#111827;color:var(--text);font:14px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
    .page{padding:24px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
    h1{font-size:20px;margin:0 0 4px 0}
    .badges{display:flex;gap:8px;flex-wrap:wrap}
    .badge{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border);border-radius:999px;padding:3px 8px;font-size:12px;color:var(--text);background:rgba(255,255,255,.02)}
    .grid{display:grid;gap:12px}
    .grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}
    .grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}
    .card{border:1px solid var(--border);border-radius:14px;background:var(--surface)}
    .card .title{font-weight:600;font-size:12px;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--border)}
    .card .content{padding:12px}
    .muted{color:var(--muted)}
    ul.clean{margin:0;padding-left:16px}
    .table{width:100%;border-collapse:separate;border-spacing:0}
    .table th,.table td{border-bottom:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top}
    .table th{font-size:12px;color:var(--muted);font-weight:600}
    .pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;border:1px solid var(--border);padding:2px 8px;font-size:12px}
    .pill.sev-low{background:color-mix(in oklab, var(--success) 18%, transparent);border-color:color-mix(in oklab, var(--success) 55%, var(--border))}
    .pill.sev-med{background:color-mix(in oklab, var(--warning) 18%, transparent);border-color:color-mix(in oklab, var(--warning) 55%, var(--border))}
    .pill.sev-high{background:color-mix(in oklab, var(--danger) 18%, transparent);border-color:color-mix(in oklab, var(--danger) 55%, var(--border))}
    .progress{height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}
    .progress > span{display:block;height:100%}
    .img-grid{display:grid;gap:10px;grid-template-columns:repeat(3,minmax(0,1fr))}
    .img{border:1px solid var(--border);border-radius:12px;background:#000;overflow:hidden}
    .img figure{margin:0}
    .img img{width:100%;height:220px;object-fit:contain;background:#000}
    .img figcaption{padding:6px 8px;border-top:1px solid var(--border);font-size:12px;color:var(--muted)}
    .footer{margin-top:16px;font-size:12px;color:var(--muted)}
    @media print{
      body{background:white;color:black}
      .card{background:white;border-color:#ddd}
      .badge,.pill{border-color:#ddd}
      .img img{background:#fff}
    }
  </style>
  `;
}

function buildSections(data: ReviewPacketData) {
  const m = data.measurements || {};
  const o = data.occlusion || {};
  const h = data.hygiene || {};
  const recs = Array.isArray(data.recommendations) ? data.recommendations.filter(Boolean) : [];
  const tgoal = (data.treatmentGoalFinal ?? data.treatment_goal_final) || "";

  return `
  <div class="grid grid-3">
    <div class="card">
      <div class="title">Measurements</div>
      <div class="content">
        <table class="table">
          <tbody>
            <tr><th>Overjet</th><td>${mm(m.overjet_mm)}</td></tr>
            <tr><th>Overbite</th><td>${pct(m.overbite_percent)}</td></tr>
            <tr><th>Midline deviation</th><td>${mm(m.midline_deviation_mm)}</td></tr>
            <tr><th>Crowding (U)</th><td>${mm(m.crowding_upper_mm)}</td></tr>
            <tr><th>Crowding (L)</th><td>${mm(m.crowding_lower_mm)}</td></tr>
            <tr><th>Arch length (U)</th><td>${mm(m.arch_length_upper_mm)}</td></tr>
            <tr><th>Arch length (L)</th><td>${mm(m.arch_length_lower_mm)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="title">Occlusion</div>
      <div class="content">
        <table class="table">
          <tbody>
            <tr><th>Class (R)</th><td>${esc(o.class_right ?? "—")}</td></tr>
            <tr><th>Class (L)</th><td>${esc(o.class_left ?? "—")}</td></tr>
            <tr><th>Open bite</th><td>${yesno(o.open_bite)}</td></tr>
            <tr><th>Crossbite</th><td>${yesno(o.crossbite)}</td></tr>
            <tr><th>Overjet tendency</th><td>${esc(o.overjet_tendency ?? "—")}</td></tr>
            <tr><th>Overbite tendency</th><td>${esc(o.overbite_tendency ?? "—")}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="title">Hygiene & Recommendations</div>
      <div class="content">
        <table class="table">
          <tbody>
            <tr><th>Plaque</th><td>${esc(h.plaque ?? "—")}</td></tr>
            <tr><th>Calculus</th><td>${esc(h.calculus ?? "—")}</td></tr>
            <tr><th>Gingival inflammation</th><td>${esc(h.gingival_inflammation ?? "—")}</td></tr>
            <tr><th>Bleeding on probing</th><td>${esc(h.bleeding_on_probing ?? "—")}</td></tr>
          </tbody>
        </table>
        <div style="margin-top:10px">
          <div class="muted" style="font-weight:600;margin-bottom:6px">Recommendations</div>
          ${
            recs.length
              ? `<ul class="clean">${recs.map((r) => `<li>• ${esc(r)}</li>`).join("")}</ul>`
              : `<div class="muted">—</div>`
          }
        </div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:12px">
    <div class="title">Final treatment goal</div>
    <div class="content">
      ${tgoal ? esc(tgoal) : '<span class="muted">—</span>'}
    </div>
  </div>
  `;
}

function buildImages(data: ReviewPacketData) {
  if (!data.images?.length) return "";
  const cards = data.images
    .map(
      (im, i) => `
      <div class="img">
        <figure>
          <img src="${esc(im.url)}" alt="${esc(im.caption ?? `Image ${i + 1}`)}" />
          <figcaption>#${i + 1} — ${esc(im.caption ?? "Image")}</figcaption>
        </figure>
      </div>
    `
    )
    .join("");
  return `
    <div class="card" style="margin-top:12px">
      <div class="title">Images</div>
      <div class="content">
        <div class="img-grid">
          ${cards}
        </div>
      </div>
    </div>
  `;
}

function buildFindings(data: ReviewPacketData) {
  const rows = (data.findings ?? []).map((f, i) => {
    const sev = f.severity ?? "low";
    const cp = confPct(f.confidence);
    const pillClass = sev === "high" ? "sev-high" : sev === "medium" ? "sev-med" : "sev-low";
    return `
      <tr>
        <td style="font-weight:600">${esc(f.tooth)}</td>
        <td>${esc(f.note || "")}</td>
        <td>
          <span class="pill ${pillClass}">
            ${sevLabel(sev)}
          </span>
        </td>
        <td>
          ${
            typeof cp === "number"
              ? `<div class="progress"><span style="width:${cp}%;background:color-mix(in oklab, var(--primary) 70%, transparent)"></span></div>
                 <div class="muted" style="font-size:12px;margin-top:4px;text-align:right">${cp}%</div>`
              : `<span class="muted">—</span>`
          }
        </td>
      </tr>
    `;
  });

  const legend = (data.findings ?? [])
    .map((f, i) => {
      const sev = f.severity ?? "low";
      return `<li> <span class="pill" style="border-color:${sevColor(sev)}"><strong>${i + 1}</strong></span> Tooth ${esc(
        f.tooth
      )} — ${esc(f.note || "")}</li>`;
    })
    .join("");

  return `
    <div class="card" style="margin-top:12px">
      <div class="title">Findings</div>
      <div class="content">
        ${
          rows.length
            ? `<table class="table">
                 <thead>
                   <tr>
                     <th>Tooth</th>
                     <th>Notes</th>
                     <th>Severity</th>
                     <th>Confidence</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${rows.join("")}
                 </tbody>
               </table>`
            : `<div class="muted">No findings</div>`
        }
        <div style="margin-top:12px">
          <div class="muted" style="font-weight:600;margin-bottom:6px">Legend</div>
          ${legend ? `<ul class="clean">${legend}</ul>` : `<div class="muted">—</div>`}
        </div>
      </div>
    </div>
  `;
}

function buildHeader(data: ReviewPacketData) {
  return `
    <div class="header">
      <div>
        <h1>Case Review Packet</h1>
        <div class="muted">Case ${esc(data.caseId)} · ${esc(data.patientName)}</div>
        <div class="muted">${fmtDate(data.createdAt)}</div>
      </div>
      <div class="badges">
        <span class="badge">Generated</span>
        <span class="badge">PDF Preview</span>
      </div>
    </div>
  `;
}

function buildSummary(summary?: string) {
  return `
    <div class="card" style="margin-top:12px">
      <div class="title">Summary</div>
      <div class="content">${summary ? esc(summary) : '<span class="muted">—</span>'}</div>
    </div>
  `;
}

function buildFooter(note?: string) {
  return `
    <div class="footer">
      ${note ? esc(note) : "Generated by Dentist Assistant"}
    </div>
  `;
}

function buildReviewPacketHTML(data: ReviewPacketData) {
  const html = `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Case ${esc(data.caseId)} – Review Packet</title>
      ${styles()}
    </head>
    <body>
      <div class="page">
        ${buildHeader(data)}
        ${buildSummary(data.summary)}
        ${buildSections(data)}
        ${buildFindings(data)}
        ${buildImages(data)}
        ${buildFooter(data.footerNote)}
      </div>
    </body>
  </html>
  `;
  return html;
}

export type { ReviewCompareData } from "./pdfServer";
