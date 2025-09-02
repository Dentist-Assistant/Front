// app/api/reports/pdf/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import puppeteer, { type Browser } from "puppeteer";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "cases";
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL || "600");

const Body = z.object({
  caseId: z.string().uuid(),
  draftVersion: z.number().int().positive().optional(),
  rebuttalVersion: z.union([z.literal("latest"), z.number().int().positive()]).optional(),
  images: z.array(z.string()).optional(),
  dryRun: z.boolean().optional(),
});

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function toSev(s?: string) {
  const v = String(s || "").toLowerCase();
  if (v.includes("high") || v.includes("severe")) return "high";
  if (v.includes("moder")) return "moderate";
  if (v.includes("med")) return "moderate";
  return "low";
}

function esc(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pct(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  const v = x <= 1 ? x * 100 : x;
  return `${Math.round(Math.max(0, Math.min(100, v)))}%`;
}

function sevBadge(s?: string) {
  const sev = toSev(s);
  if (sev === "high") return `<span class="sev sev-high">high</span>`;
  if (sev === "moderate") return `<span class="sev sev-med">moderate</span>`;
  return `<span class="sev sev-low">low</span>`;
}

type Overlay =
  | { type: "circle"; center: [number, number]; radius: number; label?: string | null }
  | { type: "line"; points: [number, number][]; label?: string | null }
  | { type: "polyline"; points: [number, number][]; label?: string | null }
  | { type: "polygon"; points: [number, number][]; label?: string | null }
  | { type: "bbox"; bbox: [number, number, number, number]; label?: string | null };

function normOverlayType(t: any) {
  const v = String(t || "").toLowerCase().trim();
  if (v === "circle" || v === "ellipse") return "circle";
  if (v === "line") return "line";
  if (v === "polyline") return "polyline";
  if (v === "polygon") return "polygon";
  if (v === "bbox" || v === "rect" || v === "rectangle" || v === "box") return "bbox";
  return null;
}

function clamp01(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(1, x));
}

function pair01(p: any): [number, number] | null {
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = clamp01(p[0]);
  const y = clamp01(p[1]);
  if (x === null || y === null) return null;
  return [x, y];
}

function bbox01(b: any): [number, number, number, number] | null {
  if (!Array.isArray(b) || b.length < 4) return null;
  const x = clamp01(b[0]);
  const y = clamp01(b[1]);
  const w = clamp01(b[2]);
  const h = clamp01(b[3]);
  if (x === null || y === null || w === null || h === null) return null;
  return [x, y, w, h];
}

function coerceOverlays(raw: any): Overlay[] {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.overlays) ? raw.overlays : Array.isArray(raw?.geometry) ? raw.geometry : [];
  const out: Overlay[] = [];
  for (const o of arr) {
    const t = normOverlayType(o?.type);
    if (!t) continue;
    if (t === "circle") {
      const c = pair01(o?.center);
      const r = clamp01(o?.radius);
      if (c && r && r > 0) out.push({ type: "circle", center: c, radius: r, label: o?.label ?? null });
      continue;
    }
    if (t === "bbox") {
      const b = bbox01(o?.bbox ?? o?.box ?? o?.rect);
      if (b) out.push({ type: "bbox", bbox: b, label: o?.label ?? null });
      continue;
    }
    const pts: [number, number][] = [];
    for (const p of Array.isArray(o?.points) ? o.points : []) {
      const pp = pair01(p);
      if (pp) pts.push(pp);
    }
    if (t === "line" && pts.length === 2) out.push({ type: "line", points: pts, label: o?.label ?? null });
    else if (t === "polyline" && pts.length >= 2) out.push({ type: "polyline", points: pts, label: o?.label ?? null });
    else if (t === "polygon" && pts.length >= 3) out.push({ type: "polygon", points: pts, label: o?.label ?? null });
  }
  return out.slice(0, 24);
}

function anchorForOverlay(o: Overlay): [number, number] {
  if (o.type === "circle") return o.center;
  if (o.type === "bbox") return [o.bbox[0], o.bbox[1]];
  const p = (o as any).points?.[0] ?? [0.5, 0.5];
  return [p[0], p[1]];
}

function labelSVG(idx: number, x: number, y: number) {
  const r = 10;
  return `<g class="lbl" transform="translate(${x},${y})">
    <circle r="${r}" class="lbl-bg"/>
    <text dominant-baseline="middle" text-anchor="middle" class="lbl-t">${idx}</text>
  </g>`;
}

function svgForImage(
  url: string,
  width: number,
  findings: Array<{
    index: number;
    tooth_fdi: number;
    text: string;
    severity: string;
    overlays: Overlay[];
  }>
) {
  const W = 1000;
  const H = 750;
  const shapes: string[] = [];
  const labels: string[] = [];
  let n = 1;
  for (const f of findings) {
    for (const o of f.overlays) {
      const idx = n++;
      if (o.type === "circle") {
        const cx = Math.round(o.center[0] * W);
        const cy = Math.round(o.center[1] * H);
        const r = Math.max(2, Math.round(o.radius * Math.min(W, H)));
        shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" class="ov stroke-${toSev(f.severity)} fill-none"/>`);
        labels.push(labelSVG(idx, cx, cy));
        continue;
      }
      if (o.type === "bbox") {
        const x = Math.round(o.bbox[0] * W);
        const y = Math.round(o.bbox[1] * H);
        const w = Math.max(2, Math.round(o.bbox[2] * W));
        const h = Math.max(2, Math.round(o.bbox[3] * H));
        shapes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" class="ov stroke-${toSev(f.severity)} fill-none"/>`);
        labels.push(labelSVG(idx, x, y));
        continue;
      }
      if (o.type === "line") {
        const [p1, p2] = o.points;
        const x1 = Math.round(p1[0] * W);
        const y1 = Math.round(p1[1] * H);
        const x2 = Math.round(p2[0] * W);
        const y2 = Math.round(p2[1] * H);
        shapes.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ov stroke-${toSev(f.severity)}"/>`);
        labels.push(labelSVG(idx, x1, y1));
        continue;
      }
      if (o.type === "polyline" || o.type === "polygon") {
        const pts = o.points.map(([x, y]) => `${Math.round(x * W)},${Math.round(y * H)}`).join(" ");
        if (o.type === "polyline") {
          shapes.push(`<polyline points="${pts}" class="ov stroke-${toSev(f.severity)} fill-none"/>`);
        } else {
          shapes.push(`<polygon points="${pts}" class="ov stroke-${toSev(f.severity)} fill-translucent"/>`);
        }
        const [ax, ay] = anchorForOverlay(o);
        labels.push(labelSVG(idx, Math.round(ax * W), Math.round(ay * H)));
        continue;
      }
    }
  }
  const svg = `
    <div class="img-wrap" style="max-width:${width}px">
      <img src="${url}" alt="Image" class="img"/>
      <svg class="ov-wrap" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${shapes.join("\n")}
        ${labels.join("\n")}
      </svg>
    </div>
  `;
  const legendItems: string[] = [];
  n = 1;
  for (const f of findings) {
    for (const _ of f.overlays) {
      legendItems.push(
        `<li><span class="marker">${n}</span><span class="legend-text"><b>FDI ${f.tooth_fdi}</b> — ${esc(
          f.text
        )} ${sevBadge(f.severity)}</span></li>`
      );
      n++;
    }
    if (!f.overlays || f.overlays.length === 0) {
      legendItems.push(
        `<li><span class="marker">•</span><span class="legend-text"><b>FDI ${f.tooth_fdi}</b> — ${esc(
          f.text
        )} ${sevBadge(f.severity)}</span></li>`
      );
    }
  }
  const legend = `<ol class="legend">${legendItems.join("")}</ol>`;
  return `<div class="page image-page">${svg}${legend}</div>`;
}

function sectionTemplate(title: string, content: string) {
  return `<section class="card"><h2>${esc(title)}</h2>${content}</section>`;
}

function tableTemplate(headers: string[], rows: string[][]) {
  const th = headers.map((h) => `<th>${esc(h)}</th>`).join("");
  const tr = rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
  return `<table class="table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

async function loadCss() {
  const fallback = `
:root { --text:#0b0c0e; --muted:#5a6472; --bg:#ffffff; --border:#e5e7eb; --accent:#2563eb; --danger:#dc2626; --ok:#16a34a; }
*{box-sizing:border-box}
body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif; color:var(--text); background:var(--bg); margin:0; padding:24px}
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
.img-wrap{position:relative; width:100%; background:#000; border-radius:12px; overflow:hidden; border:1px solid var(--border)}
.img{display:block; width:100%; height:auto; object-fit:contain; background:#000}
.ov-wrap{position:absolute; inset:0; width:100%; height:100%}
.ov{stroke-width:3; vector-effect:non-scaling-stroke}
.stroke-low{stroke:#10b981}
.stroke-moderate{stroke:#f59e0b}
.stroke-high{stroke:#ef4444}
.fill-none{fill:transparent}
.fill-translucent{fill:rgba(239,68,68,.18)}
.lbl-bg{fill:#111827; stroke:#fff; stroke-width:2}
.lbl-t{fill:#fff; font-size:12px; font-weight:700}
.legend{margin:10px 0 0 0; padding-left:16px; font-size:12px}
.legend li{margin:3px 0; display:flex; align-items:center; gap:8px}
.marker{display:inline-flex; width:18px; height:18px; align-items:center; justify-content:center; border-radius:50%; background:#111827; color:#fff; font-size:11px; font-weight:700}
.page{page-break-after:always; padding:8px 0}
.image-page .legend{break-inside:avoid}
.hr{height:1px; background:var(--border); margin:10px 0}
.final-goal{border:2px solid #111827; border-radius:12px; padding:12px; margin-top:8px; background:#f9fafb}
`;
  try {
    const p = path.join(process.cwd(), "styles", "pdf.css");
    const css = await fs.readFile(p, "utf8");
    return css || fallback;
  } catch {
    return fallback;
  }
}

function htmlDocument(body: string, title: string, css: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
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

export async function POST(req: Request) {
  let browser: Browser | null = null;
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const { caseId, draftVersion, rebuttalVersion, images, dryRun } = parsed.data;
    const sb = admin();

    const { data: caseRow, error: caseErr } = await sb
      .from("cases")
      .select("title")
      .eq("id", caseId)
      .maybeSingle();
    if (caseErr) {
      return NextResponse.json({ error: "db_error", details: caseErr.message }, { status: 500 });
    }

    const fetchReportByVersion = async (v: number) => {
      const { data, error } = await sb
        .from("reports")
        .select("version, narrative, payload")
        .eq("case_id", caseId)
        .eq("version", v)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as any) || null;
    };

    const fetchLatestReport = async () => {
      const { data, error } = await sb
        .from("reports")
        .select("version, narrative, payload")
        .eq("case_id", caseId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as any) || null;
    };

    let latest: any = null;
    if (typeof rebuttalVersion === "number") {
      latest = await fetchReportByVersion(rebuttalVersion);
      if (!latest) return NextResponse.json({ error: "rebuttal_not_found" }, { status: 404 });
    } else {
      latest = await fetchLatestReport();
      if (!latest) return NextResponse.json({ error: "no_report_found" }, { status: 404 });
    }
    const latestVersion: number = latest.version;

    let draft: any = null;
    if (typeof draftVersion === "number") {
      draft = await fetchReportByVersion(draftVersion);
      if (!draft) return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
    } else {
      const { data: prev, error: prevErr } = await sb
        .from("reports")
        .select("version, narrative, payload")
        .eq("case_id", caseId)
        .lt("version", latestVersion)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prevErr) {
        return NextResponse.json({ error: "db_error", details: prevErr.message }, { status: 500 });
      }
      draft = prev || latest;
    }

    let paths: string[] = Array.isArray(images) && images.length > 0 ? images : [];
    if (paths.length === 0) {
      const { data: imgs, error: imgsErr } = await sb
        .from("case_images")
        .select("storage_path, is_original, created_at")
        .eq("case_id", caseId)
        .order("is_original", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(12);
      if (imgsErr) {
        return NextResponse.json({ error: "db_error", details: imgsErr.message }, { status: 500 });
      }
      paths = (imgs || []).map((r) => r.storage_path as string);
    }

    const signed: string[] = [];
    for (const p of paths) {
      const { data, error } = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(p, SIGNED_URL_TTL);
      if (!error && data?.signedUrl && /^https:\/\//i.test(data.signedUrl)) {
        signed.push(data.signedUrl);
      }
    }

    const latestPayload = latest?.payload || {};
    const draftPayload = draft?.payload || {};

    const overlayCoords: string = String(latestPayload?.overlay_coords || "normalized_0_1");

    const latestSummary: string =
      latestPayload?.rebuttal?.narrative ?? latestPayload?.summary ?? latest?.narrative ?? "";
    const draftSummary: string = draftPayload?.summary ?? draft?.narrative ?? "";

    const latestMeasurements = latestPayload?.measurements || {};
    const latestOcclusion = latestPayload?.occlusion || {};
    const latestHygiene = latestPayload?.hygiene || {};
    const latestRecs: string[] = Array.isArray(latestPayload?.recommendations) ? latestPayload.recommendations : [];

    const tgfRaw =
      latestPayload?.treatment_goal_final ??
      latestPayload?.final_treatment_goal ??
      latestPayload?.treatment_goal;
    const finalGoal = coerceFinalGoal(tgfRaw);

    const draftFindingsSrc: any[] = Array.isArray(draftPayload?.findings) ? draftPayload.findings : [];
    const latestFindingsSrc: any[] = Array.isArray(latestPayload?.findings) ? latestPayload.findings : draftFindingsSrc;

    const latestFindings = latestFindingsSrc.map((r, idx) => {
      const overlays = coerceOverlays(r?.overlays ?? r?.geometry ?? []);
      const conf = r?.confidence;
      return {
        tooth_fdi: Number(r?.tooth_fdi ?? r?.tooth ?? idx + 1),
        text: Array.isArray(r?.findings) ? r.findings.join(", ") : String(r?.note || ""),
        severity: toSev(r?.severity),
        confidence: Number.isFinite(conf) ? conf : null,
        image_index: Number.isInteger(r?.image_index) ? r.image_index : 0,
        image_id: String(r?.image_id || paths[Number.isInteger(r?.image_index) ? r.image_index : 0] || ""),
        overlays,
      };
    });

    const draftFindings = draftFindingsSrc.map((r, idx) => ({
      tooth_fdi: Number(r?.tooth_fdi ?? r?.tooth ?? idx + 1),
      text: Array.isArray(r?.findings) ? r.findings.join(", ") : String(r?.note || ""),
      severity: toSev(r?.severity),
      confidence: Number(r?.confidence ?? 0),
      image_index: Number.isInteger(r?.image_index) ? r.image_index : 0,
      image_id: String(r?.image_id || paths[Number.isInteger(r?.image_index) ? r.image_index : 0] || ""),
    }));

    const byImageLatest = new Map<number, typeof latestFindings>();
    latestFindings.forEach((f) => {
      const i = Number.isInteger(f.image_index) ? f.image_index : 0;
      if (!byImageLatest.has(i)) byImageLatest.set(i, []);
      byImageLatest.get(i)!.push(f);
    });

    if (dryRun) {
      const warnings: string[] = [];
      if (!latestSummary && !draftSummary) warnings.push("Missing summary");
      if (!finalGoal) warnings.push("Missing final treatment goal");
      const hasAnyMeasurement =
        latestMeasurements?.overjet_mm != null ||
        latestMeasurements?.overbite_percent != null ||
        latestMeasurements?.midline_deviation_mm != null ||
        latestMeasurements?.crowding_upper_mm != null ||
        latestMeasurements?.crowding_lower_mm != null;
      if (!hasAnyMeasurement) warnings.push("Measurements are empty");
      if (!latestOcclusion || (!latestOcclusion.class_left && !latestOcclusion.class_right && latestOcclusion.open_bite == null && latestOcclusion.crossbite == null)) {
        warnings.push("Occlusion is empty");
      }
      if (!latestHygiene || (!latestHygiene.plaque && !latestHygiene.calculus && !latestHygiene.gingival_inflammation)) {
        warnings.push("Hygiene is empty");
      }
      if (!Array.isArray(latestRecs) || latestRecs.length === 0) warnings.push("Recommendations are empty");
      if (!Array.isArray(latestFindings) || latestFindings.length === 0) warnings.push("Findings are empty");
      if (overlayCoords !== "normalized_0_1") warnings.push(`Overlay coordinates expected "normalized_0_1" but got "${overlayCoords}"`);
      if (signed.length !== paths.length) warnings.push("Some images could not be signed");
      return NextResponse.json({
        ok: true,
        caseId,
        draftVersion: draft?.version ?? null,
        rebuttalVersion: latestVersion,
        imageCount: paths.length,
        warnings,
      });
    }

    const css = await loadCss();

    const header = `
      <div class="header">
        <div>
          <h1>Review Packet</h1>
          <small>Case ${esc(caseId)}</small>
        </div>
        <div class="badges">
          <span class="badge">v${draft?.version ?? latestVersion} draft</span>
          <span class="badge">${latest?.payload?.rebuttal ? "rebuttal" : "latest"} v${latestVersion}</span>
          <span class="badge">${new Date().toLocaleString()}</span>
        </div>
      </div>
      <div class="card">
        <div class="kv">
          <div>Patient</div><div>${esc(caseRow?.title || "Patient")}</div>
          <div>Overlay coordinates</div><div>${esc(overlayCoords || "normalized_0_1")}</div>
          <div>Images used</div><div>${paths.length}</div>
        </div>
      </div>
    `;

    const sum = sectionTemplate(
      "Summary",
      `<p>${esc(latestSummary || draftSummary || "No summary")}</p>`
    );

    const tmplMeasurements = tableTemplate(
      ["Metric", "Value"],
      [
        ["Overjet (mm)", esc(latestMeasurements?.overjet_mm ?? "—")],
        ["Overbite (%)", esc(latestMeasurements?.overbite_percent ?? "—")],
        ["Midline deviation (mm)", esc(latestMeasurements?.midline_deviation_mm ?? "—")],
        ["Crowding upper (mm)", esc(latestMeasurements?.crowding_upper_mm ?? "—")],
        ["Crowding lower (mm)", esc(latestMeasurements?.crowding_lower_mm ?? "—")],
      ]
    );

    const tmplOcclusion = tableTemplate(
      ["Aspect", "Value"],
      [
        ["Class right", esc(latestOcclusion?.class_right ?? "—")],
        ["Class left", esc(latestOcclusion?.class_left ?? "—")],
        ["Open bite", esc(String(latestOcclusion?.open_bite ?? "—"))],
        ["Crossbite", esc(String(latestOcclusion?.crossbite ?? "—"))],
      ]
    );

    const tmplHygiene = tableTemplate(
      ["Aspect", "Value"],
      [
        ["Plaque", esc(latestHygiene?.plaque ?? "—")],
        ["Calculus", esc(latestHygiene?.calculus ?? "—")],
        ["Gingival inflammation", esc(latestHygiene?.gingival_inflammation ?? "—")],
      ]
    );

    const tmplRecs =
      Array.isArray(latestRecs) && latestRecs.length > 0
        ? `<ul>${latestRecs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>`
        : `<p>—</p>`;

    const templateSection =
      sectionTemplate("Measurements", tmplMeasurements) +
      sectionTemplate("Occlusion", tmplOcclusion) +
      sectionTemplate("Hygiene", tmplHygiene) +
      sectionTemplate("Recommendations", tmplRecs);

    const latestTable = tableTemplate(
      ["FDI", "Finding", "Severity", "Confidence", "Image"],
      latestFindings.map((f) => [
        esc(f.tooth_fdi),
        esc(f.text || "—"),
        sevBadge(f.severity),
        pct(f.confidence),
        esc(paths[f.image_index] || f.image_id || "—"),
      ])
    );

    const draftTable =
      draft?.version !== latest?.version || draftFindings.length !== latestFindings.length
        ? tableTemplate(
            ["FDI", "Finding", "Severity", "Confidence", "Image"],
            draftFindings.map((f) => [
              esc(f.tooth_fdi),
              esc(f.text || "—"),
              sevBadge(f.severity),
              pct(f.confidence),
              esc(paths[f.image_index] || f.image_id || "—"),
            ])
          )
        : "";

    const rebuttalSection = latest?.payload?.rebuttal
      ? sectionTemplate(
          "Rebuttal",
          `<p>${esc(latest.payload.rebuttal.narrative || "")}</p>` +
            (Array.isArray(latest.payload.rebuttal.updates) && latest.payload.rebuttal.updates.length
              ? tableTemplate(
                  ["Topic", "Action", "Text", "Rationale"],
                  latest.payload.rebuttal.updates.map((u: any) => [
                    esc(u.topic || ""),
                    esc(u.action || ""),
                    esc(u.text || ""),
                    esc(u.rationale || ""),
                  ])
                )
              : "")
        )
      : "";

    const finalGoalBox = finalGoal
      ? `<section class="card"><h2>Final treatment goal</h2><div class="final-goal">${esc(finalGoal)}</div></section>`
      : "";

    const latestFindingsSection = sectionTemplate("Findings (Latest)", latestTable);
    const draftFindingsSection = draftTable ? sectionTemplate("Findings (Draft)", draftTable) : "";

    const imagePages: string[] = [];
    for (let i = 0; i < signed.length; i++) {
      const list = (byImageLatest.get(i) || []).map((f, k) => ({
        index: k + 1,
        tooth_fdi: f.tooth_fdi,
        text: f.text,
        severity: f.severity,
        overlays: f.overlays || [],
      }));
      const page = svgForImage(signed[i], 980, list);
      const headerPage = `<div class="page card"><h2>Image ${i + 1} / ${signed.length}</h2><small>${esc(paths[i])}</small></div>`;
      imagePages.push(headerPage + page);
    }

    const doc = htmlDocument(
      header + sum + templateSection + latestFindingsSection + draftFindingsSection + rebuttalSection + finalGoalBox + imagePages.join(""),
      `Case ${caseId} packet`,
      css
    );

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: "networkidle0" });
    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", right: "8mm", bottom: "10mm", left: "8mm" },
    });

    await page.close();
    await browser.close();
    browser = null;

    const nameDraft = typeof draftVersion === "number" ? draftVersion : draft?.version ?? latestVersion;
    const nameReb =
      typeof rebuttalVersion === "number"
        ? rebuttalVersion
        : rebuttalVersion === "latest" || rebuttalVersion === undefined
        ? latestVersion
        : latestVersion;

const copy = new Uint8Array(pdf.byteLength);
copy.set(pdf); 

const blob = new Blob([copy.buffer], { type: "application/pdf" });

return new Response(blob, {
  status: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="case-${caseId}-packet-v${nameDraft}-v${nameReb}.pdf"`,
    "Cache-Control": "no-store",
  },
});



  } catch (e: any) {
    return NextResponse.json({ error: "pdf_failed", details: e?.message || "Unexpected error" }, { status: 500 });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}
