// app/api/ai/draft/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "cases";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL || "600");

const Body = z.object({
  caseId: z.string().uuid(),
  selectedPaths: z.array(z.string()).optional(),
  feedback: z.string().optional(),
});

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function clamp01(n: unknown): number | null {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(1, Math.round(x * 100) / 100));
}
function normSeverity(s?: unknown): "low" | "moderate" | "high" | undefined {
  const v = String(s ?? "").toLowerCase();
  if (!v) return undefined;
  if (/(^|[^a-z])low/.test(v) || /minor/.test(v)) return "low";
  if (/mod/.test(v) || /medium/.test(v)) return "moderate";
  if (/high|severe/.test(v)) return "high";
  return undefined;
}
function firstNum(...cands: any[]): number | undefined {
  for (const c of cands) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const n = Number(String(c).replace(/[^\d.-]/g, ""));
      if (Number.isFinite(n)) return n;
    }
  }
}
function firstStr(...cands: any[]): string | undefined {
  for (const c of cands) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
}
function strArray(val: any): string[] {
  if (Array.isArray(val)) return val.map((x) => String(x)).filter(Boolean);
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return [];
}

function isFDI(n: number) {
  return (
    (n >= 11 && n <= 18) || (n >= 21 && n <= 28) ||
    (n >= 31 && n <= 38) || (n >= 41 && n <= 48) ||
    (n >= 51 && n <= 55) || (n >= 61 && n <= 65) ||
    (n >= 71 && n <= 75) || (n >= 81 && n <= 85)
  );
}
function universalToFDI(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  if (n >= 1 && n <= 8) return 19 - n;
  if (n >= 9 && n <= 16) return 12 + (n - 8);
  if (n >= 17 && n <= 24) return 55 - n;
  if (n >= 25 && n <= 32) return 16 + (n - 24);
  return null;
}
function quadrantTextToFDI(s: string): number | null {
  const m = s.trim().toUpperCase().match(/(UR|UL|LL|LR)\s*([1-8])/);
  if (!m) return null;
  const quad = { UR: 1, UL: 2, LL: 3, LR: 4 }[m[1] as "UR" | "UL" | "LL" | "LR"];
  const t = Number(m[2]);
  return quad * 10 + t;
}
function dottedToFDI(s: string): number | null {
  const m = s.trim().match(/^([1-4])\s*[\.\-]\s*([1-8])$/);
  if (!m) return null;
  return Number(m[1]) * 10 + Number(m[2]);
}
function toFDI(anyTooth: any): number | null {
  if (typeof anyTooth === "number") {
    if (isFDI(anyTooth)) return anyTooth;
    const uni = universalToFDI(anyTooth);
    if (uni) return uni;
  }
  if (typeof anyTooth === "string") {
    const s = anyTooth.trim();
    const digits = Number(s.replace(/[^\d]/g, ""));
    if (Number.isFinite(digits)) {
      if (isFDI(digits)) return digits;
      const uni = universalToFDI(digits);
      if (uni) return uni;
    }
    const q = quadrantTextToFDI(s);
    if (q) return q;
    const d = dottedToFDI(s);
    if (d) return d;
  }
  return null;
}

type Overlay =
  | { type: "circle"; center: [number, number]; radius: number; points: null; bbox: null; label: string | null }
  | { type: "line"; center: null; radius: null; points: [number, number][]; bbox: null; label: string | null }
  | { type: "polyline"; center: null; radius: null; points: [number, number][]; bbox: null; label: string | null }
  | { type: "polygon"; center: null; radius: null; points: [number, number][]; bbox: null; label: string | null }
  | { type: "bbox"; center: null; radius: null; points: null; bbox: [number, number, number, number]; label: string | null };

function clampPair(p: any): [number, number] | null {
  if (!Array.isArray(p) || p.length < 2) return null;
  const x = clamp01(p[0]);
  const y = clamp01(p[1]);
  if (x === null || y === null) return null;
  return [x, y];
}
function clampBBox(b: any): [number, number, number, number] | null {
  if (!Array.isArray(b) || b.length < 4) return null;
  const x = clamp01(b[0]);
  const y = clamp01(b[1]);
  const w = clamp01(b[2]);
  const h = clamp01(b[3]);
  if (x === null || y === null || w === null || h === null) return null;
  return [x, y, w, h];
}
function normOverlayType(s: any): Overlay["type"] | null {
  const v = String(s || "").toLowerCase().trim();
  if (v === "circle" || v === "ellipse") return "circle";
  if (v === "line") return "line";
  if (v === "polyline") return "polyline";
  if (v === "polygon") return "polygon";
  if (v === "bbox" || v === "box" || v === "rectangle" || v === "rect") return "bbox";
  return null;
}
function coerceOverlay(o: any): Overlay | null {
  const t = normOverlayType(o?.type);
  if (!t) return null;
  const label = firstStr(o?.label) ?? null;
  if (t === "circle") {
    const c = clampPair(o?.center);
    const r = clamp01(firstNum(o?.radius));
    if (!c || r === null || r <= 0) return null;
    return { type: "circle", center: c, radius: r, points: null, bbox: null, label };
  }
  if (t === "bbox") {
    const b = clampBBox(o?.bbox ?? o?.box ?? o?.rect);
    if (!b) return null;
    return { type: "bbox", center: null, radius: null, points: null, bbox: b, label };
  }
  const arr = Array.isArray(o?.points) ? o.points : [];
  const pts: [number, number][] = [];
  for (const p of arr) {
    const pair = clampPair(p);
    if (pair) pts.push(pair);
  }
  if (t === "line") {
    if (pts.length !== 2) return null;
    return { type: "line", center: null, radius: null, points: pts, bbox: null, label };
  }
  if (t === "polyline") {
    if (pts.length < 2) return null;
    return { type: "polyline", center: null, radius: null, points: pts, bbox: null, label };
  }
  if (t === "polygon") {
    if (pts.length < 3) return null;
    return { type: "polygon", center: null, radius: null, points: pts, bbox: null, label };
  }
  return null;
}
function coerceOverlays(raw: any): Overlay[] {
  const input = Array.isArray(raw) ? raw : Array.isArray(raw?.overlays) ? raw.overlays : Array.isArray(raw?.geometry) ? raw.geometry : [];
  const out: Overlay[] = [];
  for (const o of input) {
    const v = coerceOverlay(o);
    if (v) out.push(v);
  }
  return out.slice(0, 12);
}

type RawFinding = Record<string, any>;
function coerceFindings(
  raw: any,
  images: { index: number; id: string; url: string; width?: number; height?: number }[]
) {
  const src: RawFinding[] =
    Array.isArray(raw?.findings) ? raw.findings :
    Array.isArray(raw?.teeth) ? raw.teeth : [];

  const out: Array<{
    tooth_fdi: number;
    findings: string[];
    severity: "low" | "moderate" | "high";
    confidence: number;
    image_index: number;
    image_id: string;
    overlays: Overlay[];
  }> = [];

  for (const f of src) {
    const toothCand =
      f?.tooth_fdi ?? f?.toothFDI ?? f?.FDI ?? f?.tooth ?? f?.toothNumber ?? f?.number ?? f?.id;
    const toothFDI = toFDI(toothCand);
    if (!toothFDI) continue;

    let image_index = firstNum(f?.image_index, f?.imageIndex, f?.img_index, f?.image) ?? 0;
    if (!Number.isInteger(image_index) || image_index < 0 || image_index >= images.length) image_index = 0;

    let image_id = firstStr(f?.image_id, f?.imageId, f?.image_path, f?.path) ?? images[image_index].id;
    if (image_id !== images[image_index].id) image_id = images[image_index].id;

    const sev = normSeverity(firstStr(f?.severity, f?.grade, f?.risk)) ?? "low";
    const conf = clamp01(firstNum(f?.confidence, f?.confidence_score, f?.probability, f?.score)) ?? 0.5;

    const notes = strArray(f?.findings).concat(strArray(f?.note)).concat(strArray(f?.notes)).filter(Boolean);
    const overlays = coerceOverlays(f?.overlays ?? f?.geometry ?? f?.shapes);

    out.push({
      tooth_fdi: toothFDI,
      findings: [...new Set(notes)],
      severity: sev,
      confidence: conf,
      image_index,
      image_id,
      overlays,
    });
  }

  const merged = new Map<number, typeof out[number]>();
  for (const r of out) {
    const prev = merged.get(r.tooth_fdi);
    if (!prev) merged.set(r.tooth_fdi, r);
    else {
      prev.findings = [...new Set([...prev.findings, ...r.findings])];
      prev.overlays = [...prev.overlays, ...r.overlays].slice(0, 12);
      if (r.confidence > prev.confidence) {
        prev.confidence = r.confidence;
        prev.image_index = r.image_index;
        prev.image_id = r.image_id;
      }
      const order = { low: 0, moderate: 1, high: 2 } as const;
      if (order[r.severity] > order[prev.severity]) prev.severity = r.severity;
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.tooth_fdi - b.tooth_fdi).slice(0, 40);
}

const OUTPUT_SCHEMA = `
Return ONLY a JSON object with EXACTLY these keys and types:
{
  "summary": string,
  "treatment_goal_final": string,
  "measurements": {
    "overjet_mm": number|null,
    "overbite_percent": number|null,
    "midline_deviation_mm": number|null,
    "crowding_upper_mm": number|null,
    "crowding_lower_mm": number|null
  },
  "occlusion": {
    "class_right": "I"|"II"|"III"|null,
    "class_left": "I"|"II"|"III"|null,
    "open_bite": boolean|null,
    "crossbite": boolean|null
  },
  "hygiene": {
    "plaque": "low"|"moderate"|"high"|null,
    "calculus": "none"|"mild"|"moderate"|"severe"|null,
    "gingival_inflammation": "none"|"mild"|"moderate"|"severe"|null
  },
  "recommendations": string[],
  "findings": [
    {
      "tooth_fdi": number,
      "findings": string[],
      "severity": "low"|"moderate"|"high",
      "confidence": number,
      "image_index": number,
      "image_id": string,
      "overlays": [
        {
          "type": "circle"|"line"|"polyline"|"polygon"|"bbox",
          "center": [number, number]|null,
          "radius": number|null,
          "points": [[number, number], ...]|null,
          "bbox": [number, number, number, number]|null,
          "label": string|null
        }
      ]
    }
  ],
  "confidence_overall": number|null
}
`.trim();

function isMissingColumnError(msg: string, col: string) {
  const m = (msg || "").toLowerCase();
  return m.includes(col.toLowerCase()) &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("unknown column") || m.includes("not found"));
}

type InsertResp = { data: { id: string; version: number } | null; error: { message: string } | null };
async function tryInsert(sb: ReturnType<typeof admin>, row: Record<string, any>): Promise<InsertResp> {
  const r = await sb.from("reports").insert(row).select("id, version").single();
  return { data: (r as any).data ?? null, error: (r as any).error ?? null };
}

function withDefaultMeasurements(m: any) {
  return {
    overjet_mm: Number.isFinite(m?.overjet_mm) ? m.overjet_mm : null,
    overbite_percent: Number.isFinite(m?.overbite_percent) ? m.overbite_percent : null,
    midline_deviation_mm: Number.isFinite(m?.midline_deviation_mm) ? m.midline_deviation_mm : null,
    crowding_upper_mm: Number.isFinite(m?.crowding_upper_mm) ? m.crowding_upper_mm : null,
    crowding_lower_mm: Number.isFinite(m?.crowding_lower_mm) ? m.crowding_lower_mm : null,
  };
}
function withDefaultOcclusion(o: any) {
  const v = (x: any) => (x === "I" || x === "II" || x === "III" ? x : null);
  return {
    class_right: v(o?.class_right),
    class_left: v(o?.class_left),
    open_bite: typeof o?.open_bite === "boolean" ? o.open_bite : null,
    crossbite: typeof o?.crossbite === "boolean" ? o.crossbite : null,
  };
}
function withDefaultHygiene(h: any) {
  const plaque = ["low", "moderate", "high"].includes(String(h?.plaque)) ? String(h?.plaque) : null;
  const calculus = ["none", "mild", "moderate", "severe"].includes(String(h?.calculus)) ? String(h?.calculus) : null;
  const ging = ["none", "mild", "moderate", "severe"].includes(String(h?.gingival_inflammation)) ? String(h?.gingival_inflammation) : null;
  return { plaque, calculus, gingival_inflammation: ging };
}

export async function POST(req: Request) {
  try {
    const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: "env_missing", details: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    const { caseId, selectedPaths, feedback } = parsed.data;

    const sb = admin();

    let paths: string[] = [];
    if (Array.isArray(selectedPaths) && selectedPaths.length) {
      paths = selectedPaths;
    } else {
      const { data: imgs, error } = await sb
        .from("case_images")
        .select("storage_path, width, height, is_original, created_at")
        .eq("case_id", caseId)
        .order("is_original", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(12);
      if (error) return NextResponse.json({ error: "db_fetch_failed", details: error.message }, { status: 500 });
      paths = (imgs ?? []).map((r) => r.storage_path as string);
    }
    if (!paths.length) return NextResponse.json({ error: "no_images" }, { status: 400 });

    const dimsByPath = new Map<string, { width?: number | null; height?: number | null }>();
    const { data: meta } = await sb
      .from("case_images")
      .select("storage_path, width, height")
      .in("storage_path", paths);
    (meta ?? []).forEach((r: any) => {
      dimsByPath.set(r.storage_path, { width: r.width ?? null, height: r.height ?? null });
    });

    const signedUrls: string[] = [];
    for (const p of paths) {
      const { data, error } = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(p, SIGNED_URL_TTL);
      if (!error && data?.signedUrl) signedUrls.push(data.signedUrl);
    }
    if (!signedUrls.length) return NextResponse.json({ error: "sign_failed" }, { status: 500 });
    if (signedUrls.some((u) => !/^https:\/\//i.test(u) || /localhost|127\.0\.0\.1/i.test(u))) {
      return NextResponse.json({ error: "invalid_image_url" }, { status: 400 });
    }

    const manifestLines = signedUrls.map((_, i) => `${i}: ${paths[i]}`).join("\n");

    const system = `
You are a senior dental clinician generating a cautious screening draft strictly from the provided intra-oral photos.

Output must be valid JSON matching exactly this schema (no extra keys, no comments, no markdown fences):
${OUTPUT_SCHEMA}

Authoring rules:
1) Base every statement strictly on visible image evidence.
2) Use FDI numbering (permanent 11–48; use 51–85 only if clearly primary).
3) Write in concise, professional English.
4) If a field is not assessable, use null (or [] for arrays). Never invent measurements.
5) Numbers must be numeric and rounded to 2 decimals when applicable.
6) The "treatment_goal_final" must be a single-sentence clinical objective, based on the visible findings.
7) Justify each finding within its observation text: specify what is seen, where (surface/region), reference image_index and clinical cues supporting the severity level.
8) Recommendations must be evidence-linked: each recommendation string should state the action, the indication(s), and reference the specific tooth numbers (FDI) and image indices that support it; include expected benefit and prerequisites when relevant.
9) All overlay geometry must be normalized to [0..1] with two decimals; never output pixel coordinates.

Coverage:
• Iterate over each image in order (0..n-1) and inspect thoroughly.
• Aim for 3–8 tooth-level findings per image when anatomy is visible and in focus.
• If multiple images show the same finding, keep a single entry linked to the clearest image only.
• Each tooth-level finding must include: tooth_fdi, precise observation string (include surface/location if visible), severity, confidence, image_index, image_id, and overlays.

Recommendations formatting:
• Use concise strings like "Clear aligner therapy — moderate anterior crowding (FDI 12–23), evidence on image 2; expected to improve alignment and overjet."
• For hygiene or periodontal recommendations, include the observed sign and where it appears (e.g., "Hygiene reinforcement — plaque accumulation buccal (FDI 26–27), images 1–2").

Overlays (mandatory when the finding is visible):
• Coordinate system is normalized [0..1] in image space.
• Allowed types: "circle", "line", "polyline", "polygon", "bbox".
• For "circle": provide center [x,y] and radius.
• For "line": provide exactly 2 points in "points".
• For "polyline": provide ≥2 points in "points".
• For "polygon": provide ≥3 points in "points".
• For "bbox": provide [x,y,w,h].
• Use as few shapes as necessary to point to the anatomy; include a short label when helpful.

Validation rules:
• image_index must be a 0-based index from the manifest.
• image_id must equal the storage path at that index.
• De-duplicate by tooth_fdi (merge notes/overlays), sort ascending, cap to 40 items.
• confidence_overall is the mean of finding confidences (2 decimals) or null if no findings.
`.trim();

    const userPrompt = `
Generate JSON only, following the schema, authoring rules, coverage, overlays, and validation.

Clinician feedback:
${feedback ? feedback : "(none)"}

Images manifest (0-based index → storage path):
${manifestLines}

Scanning protocol:
- Review every image and enumerate all defensible tooth-level observations.
- Link each finding to the single best supporting image (image_index and matching image_id).
- Provide overlays that precisely indicate the observed area using the normalized coordinate spec.
- Use precise dental terminology (e.g., "visible plaque accumulation—buccal", "mild gingival inflammation—papillary", "wear facets—incisal").
- If an area is not visible or quality is insufficient, leave related fields null and prefer lower confidence.

Return JSON only. Do not include prose outside the JSON.
`.trim();

    const userContent: any[] = [
      { type: "text", text: userPrompt },
      ...signedUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json({ error: "openai_request_failed", statusCode: resp.status, details: text }, { status: 500 });
    }

    const parsedAI = await resp.json();
    const jsonText = parsedAI?.choices?.[0]?.message?.content || "{}";

    let raw: any = {};
    try { raw = JSON.parse(jsonText); } catch {}

    const images = signedUrls.map((url, index) => {
      const p = paths[index];
      const dims = dimsByPath.get(p) || {};
      const w = typeof dims.width === "number" && dims.width > 0 ? Number(dims.width) : undefined;
      const h = typeof dims.height === "number" && dims.height > 0 ? Number(dims.height) : undefined;
      return { index, id: p, url, width: w, height: h };
    });

    const cleanedFindings = coerceFindings(raw, images);

    let overall = clamp01(raw?.confidence_overall ?? undefined);
    if (overall === null && cleanedFindings.length) {
      const mean = cleanedFindings.reduce((s, r) => s + (Number(r.confidence) || 0), 0) / cleanedFindings.length;
      overall = Math.round(mean * 100) / 100;
    }

    const payload = {
      summary: typeof raw?.summary === "string" ? raw.summary : "",
      treatment_goal_final: typeof raw?.treatment_goal_final === "string" ? raw.treatment_goal_final : "",
      measurements: withDefaultMeasurements(raw?.measurements || {}),
      occlusion: withDefaultOcclusion(raw?.occlusion || {}),
      hygiene: withDefaultHygiene(raw?.hygiene || {}),
      recommendations: Array.isArray(raw?.recommendations) ? raw.recommendations.map(String) : [],
      confidence_overall: overall,
      findings: cleanedFindings,
      images,
      _meta: { type: "ai_draft", model: OPENAI_MODEL, overlay_coords: "normalized_0_1" },
    };

    const narrative = payload.summary || "AI summary";

    const { data: latest, error: latestErr } = await sb
      .from("reports")
      .select("version")
      .eq("case_id", caseId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) return NextResponse.json({ error: "db_latest_failed", details: latestErr.message }, { status: 500 });

    const lastVer = Number(latest?.version ?? 0) || 0;
    const nextVersion = lastVer + 1;

    const baseRow: Record<string, any> = { case_id: caseId, version: nextVersion, narrative, payload };

    let wantParent = true;
    let allowAuthor = true;
    const authors: (string | undefined)[] = ["ai", "model", "system", undefined];

    let ins: InsertResp = { data: null, error: { message: "not attempted" } };

    outer: for (const author of authors) {
      if (!allowAuthor && typeof author === "string") continue;
      for (let attempt = 0; attempt < 2; attempt++) {
        const row: Record<string, any> = { ...baseRow };
        if (wantParent) row.parent_version = lastVer || null;
        if (allowAuthor && typeof author === "string") row.author_type = author;

        ins = await tryInsert(sb, row);
        if (!ins.error) break outer;

        const msg = (ins.error?.message || "").toLowerCase();

        if (wantParent && isMissingColumnError(msg, "parent_version")) {
          wantParent = false;
          continue;
        }
        if (allowAuthor && isMissingColumnError(msg, "author_type")) {
          allowAuthor = false;
          continue;
        }
        if (msg.includes("invalid input value for enum") || msg.includes("enum")) {
          break;
        }
        break;
      }
    }

    if (ins.error) {
      ins = await tryInsert(sb, baseRow);
      if (ins.error && wantParent) {
        const row = { ...baseRow, parent_version: lastVer || null };
        ins = await tryInsert(sb, row);
      }
    }

    if (ins.error) {
      return NextResponse.json(
        { error: "db_insert_failed", details: ins.error?.message || "unknown insert error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, id: ins.data!.id, version: ins.data!.version, narrative, payload },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "internal_error", details: e?.message || "Unexpected error" }, { status: 500 });
  }
}
