// app/api/ai/rebuttal/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "cases";
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL || "600");

const BodySchema = z.object({
  caseId: z.string().uuid().optional(),
  targetVersion: z.number().int().positive().optional(),
  report: z.string().min(1).optional(),
  critique: z.string().min(1).optional(),
  maxTokens: z.number().int().positive().max(2000).optional(),
  selectedPaths: z.array(z.string()).optional(),
});

const UpdateSchema = z.object({
  topic: z.string(),
  action: z.enum(["add", "modify", "remove"]),
  text: z.string(),
  rationale: z.string(),
  feedback_ref: z.number().int().positive().optional(),
});

const FeedbackAlignmentSchema = z.object({
  item_number: z.number().int().positive(),
  item_text: z.string(),
  decision: z.enum(["accept", "partial", "reject"]),
  reason: z.string(),
  linked_updates: z.array(z.number().int().positive()).default([]),
});

const OverlaySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("circle"),
    center: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    radius: z.number().min(0),
    points: z.null(),
    bbox: z.null(),
    label: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("line"),
    center: z.null(),
    radius: z.null(),
    points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).length(2),
    bbox: z.null(),
    label: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("polyline"),
    center: z.null(),
    radius: z.null(),
    points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2),
    bbox: z.null(),
    label: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("polygon"),
    center: z.null(),
    radius: z.null(),
    points: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(3),
    bbox: z.null(),
    label: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal("bbox"),
    center: z.null(),
    radius: z.null(),
    points: z.null(),
    bbox: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]),
    label: z.string().nullable().optional(),
  }),
]);

const FindingSchema = z.object({
  tooth_fdi: z.number().int(),
  findings: z.array(z.string()),
  severity: z.enum(["low", "moderate", "high"]),
  confidence: z.number().min(0).max(1),
  image_index: z.number().int().nonnegative(),
  image_id: z.string(),
  overlays: z.array(OverlaySchema).default([]),
});

const FindingChangeSchema = z.object({
  op: z.enum(["add", "modify", "remove"]),
  target_tooth_fdi: z.number().int(),
  after: FindingSchema.partial().optional(),
  rationale: z.string().optional(),
  feedback_ref: z.number().int().positive().optional(),
});

const MeasurementsSchema = z.object({
  overjet_mm: z.number().nullable().optional(),
  overbite_percent: z.number().nullable().optional(),
  midline_deviation_mm: z.number().nullable().optional(),
  crowding_upper_mm: z.number().nullable().optional(),
  crowding_lower_mm: z.number().nullable().optional(),
});

const OcclusionSchema = z.object({
  class_right: z.enum(["I", "II", "III"]).nullable().optional(),
  class_left: z.enum(["I", "II", "III"]).nullable().optional(),
  open_bite: z.boolean().nullable().optional(),
  crossbite: z.boolean().nullable().optional(),
});

const HygieneSchema = z.object({
  plaque: z.enum(["low", "moderate", "high"]).nullable().optional(),
  calculus: z.enum(["none", "mild", "moderate", "severe"]).nullable().optional(),
  gingival_inflammation: z.enum(["none", "mild", "moderate", "severe"]).nullable().optional(),
});

const AIResponseSchema = z.object({
  narrative: z.string().default(""),
  payload: z.object({
    summary: z.string().default(""),
    measurements: MeasurementsSchema.default({}),
    occlusion: OcclusionSchema.default({}),
    hygiene: HygieneSchema.default({}),
    recommendations: z.array(z.string()).default([]),
    treatment_goal_final: z.string().default(""),
    confidence_overall: z.number().min(0).max(1).nullable().optional(),
    rebuttal: z.object({
      narrative: z.string().default(""),
      updates: z.array(UpdateSchema).default([]),
      feedback_alignment: z.array(FeedbackAlignmentSchema).default([]),
      finding_changes: z.array(FindingChangeSchema).default([]),
    }).default({ narrative: "", updates: [], feedback_alignment: [], finding_changes: [] }),
    images: z.array(z.object({ index: z.number().int().nonnegative(), id: z.string() })).default([]),
    overlay_coords: z.literal("normalized_0_1").default("normalized_0_1"),
  }).default({
    summary: "",
    measurements: {},
    occlusion: {},
    hygiene: {},
    recommendations: [],
    treatment_goal_final: "",
    confidence_overall: null,
    rebuttal: { narrative: "", updates: [], feedback_alignment: [], finding_changes: [] },
    images: [],
    overlay_coords: "normalized_0_1",
  }),
});

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeCritiqueToList(critique?: string): string[] {
  if (!critique) return [];
  const lines = critique.split(/\r?\n|;/g).map((s) => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return (lines[0] ?? "")
    .split(/\s(?=\d+\.)|(?<=\.)\s+-\s+|·\s+|-\s+/g)
    .map((s) => s.trim())
    .filter(Boolean);
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
  const m = s.trim().match(/^([1-4])[\.\-]([1-8])$/);
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

function mergeFindings(a: z.infer<typeof FindingSchema>[], b: z.infer<typeof FindingSchema>[]) {
  const m = new Map<number, z.infer<typeof FindingSchema>>();
  for (const r of [...a, ...b]) {
    const prev = m.get(r.tooth_fdi);
    if (!prev) {
      m.set(r.tooth_fdi, { ...r, findings: [...new Set(r.findings)], overlays: (r.overlays || []).slice(0, 12) });
    } else {
      const order = { low: 0, moderate: 1, high: 2 } as const;
      prev.findings = [...new Set([...(prev.findings || []), ...(r.findings || [])])];
      prev.overlays = [...(prev.overlays || []), ...(r.overlays || [])].slice(0, 12);
      if (r.confidence > prev.confidence) {
        prev.confidence = r.confidence;
        prev.image_index = r.image_index;
        prev.image_id = r.image_id;
      }
      if (order[r.severity] > order[prev.severity]) prev.severity = r.severity;
    }
  }
  return Array.from(m.values()).sort((x, y) => x.tooth_fdi - y.tooth_fdi).slice(0, 40);
}

function applyFindingChanges(
  base: z.infer<typeof FindingSchema>[],
  changes: z.infer<typeof FindingChangeSchema>[],
  images: { index: number; id: string }[]
) {
  const byTooth = new Map<number, z.infer<typeof FindingSchema>>();
  for (const f of base) byTooth.set(f.tooth_fdi, f);
  for (const c of changes) {
    const t = toFDI(c.target_tooth_fdi) || c.target_tooth_fdi;
    if (c.op === "remove") {
      byTooth.delete(t as number);
      continue;
    }
    if (c.op === "add" || c.op === "modify") {
      const coerced = c.after ? coerceFinding({ ...c.after, tooth_fdi: t }, images) : null;
      if (!coerced) continue;
      if (c.op === "add") {
        const merged = mergeFindings([coerced], byTooth.get(coerced.tooth_fdi) ? [byTooth.get(coerced.tooth_fdi)!] : []);
        byTooth.set(coerced.tooth_fdi, merged[0]);
      } else {
        byTooth.set(coerced.tooth_fdi, coerced);
      }
    }
  }
  return Array.from(byTooth.values()).sort((x, y) => x.tooth_fdi - y.tooth_fdi).slice(0, 40);
}

function coerceFinding(f: any, images: { index: number; id: string }[]): z.infer<typeof FindingSchema> | null {
  const toothCand = f?.tooth_fdi ?? f?.toothFDI ?? f?.FDI ?? f?.tooth ?? f?.toothNumber ?? f?.number ?? f?.id;
  const tooth_fdi = toFDI(toothCand);
  if (!tooth_fdi) return null;
  let image_index = firstNum(f?.image_index, f?.imageIndex, f?.img_index, f?.image) ?? 0;
  if (!Number.isInteger(image_index) || image_index < 0 || image_index >= images.length) image_index = 0;
  const image_id = images[image_index]?.id || images[0]?.id || "";
  const sev = normSeverity(firstStr(f?.severity, f?.grade, f?.risk)) ?? "low";
  const conf = clamp01(firstNum(f?.confidence, f?.confidence_score, f?.probability, f?.score)) ?? 0.5;
  const notes = strArray(f?.findings).concat(strArray(f?.note)).concat(strArray(f?.notes)).filter(Boolean);
  const overlays = coerceOverlays(f?.overlays ?? f?.geometry ?? f?.shapes);
  return { tooth_fdi, findings: [...new Set(notes)], severity: sev, confidence: conf, image_index, image_id, overlays };
}

function buildMessages(
  input: z.infer<typeof BodySchema>,
  originalReportText: string,
  images: { index: number; id: string }[]
) {
  const feedbackList = normalizeCritiqueToList(input.critique);
  const manifest = images.map((x) => `${x.index}: ${x.id}`).join("\n");
  const system = `
You are a senior dental clinician. Produce a rebuttal that yields a complete, ready-to-export report payload.

Requirements:
- Use FDI tooth numbering (11–48; 51–85 only if clearly primary).
- Use normalized [0..1] image coordinates for overlays.
- Do not invent measurements; if uncertain, set the field to null.
- Output VALID JSON ONLY with this exact structure:

{
  "narrative": string,
  "payload": {
    "summary": string,
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
    "treatment_goal_final": string,
    "confidence_overall": number|null,
    "rebuttal": {
      "narrative": string,
      "updates": [
        { "topic": string, "action": "add"|"modify"|"remove", "text": string, "rationale": string, "feedback_ref": number }
      ],
      "feedback_alignment": [
        { "item_number": number, "item_text": string, "decision": "accept"|"partial"|"reject", "reason": string, "linked_updates": number[] }
      ],
      "finding_changes": [
        {
          "op": "add"|"modify"|"remove",
          "target_tooth_fdi": number,
          "after": {
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
        }
      ]
    },
    "images": [{ "index": number, "id": string }],
    "overlay_coords": "normalized_0_1"
  }
}

If a field is unchanged, copy the prior value so the payload is complete.
Keep claims grounded in image evidence and clinician feedback. Use concise, professional English.
`.trim();

  const blocks: Array<{ type: "text"; text: string }> = [];
  blocks.push({ type: "text", text: `Return JSON only. Ensure all template fields are present even if unchanged.` });
  blocks.push({ type: "text", text: `Original report:\n${originalReportText || "(not provided)"}` });
  blocks.push({ type: "text", text: `Images manifest (0-based index → storage path):\n${manifest}` });
  if (feedbackList.length > 0) {
    const numbered = feedbackList.map((s, i) => `${i + 1}. ${s}`).join("\n");
    blocks.push({
      type: "text",
      text:
        `User feedback (numbered):\n${numbered}\n` +
        `Address every item in "feedback_alignment". Link accepted/partial items to "updates" and relevant "finding_changes".`,
    });
  } else {
    blocks.push({ type: "text", text: `No explicit feedback provided. Propose cautious, evidence-based improvements.` });
  }
  if (typeof input.targetVersion === "number") {
    blocks.push({ type: "text", text: `Target report version: v${input.targetVersion}` });
  }
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: blocks },
  ];
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) return NextResponse.json({ error: "missing_api_key" }, { status: 500 });

    const sb = admin();

    let baseReportText = input.report || "";
    let baseSummary = "";
    let baseMeasurements: ReturnType<typeof withDefaultMeasurements> = withDefaultMeasurements({});
    let baseOcclusion: ReturnType<typeof withDefaultOcclusion> = withDefaultOcclusion({});
    let baseHygiene: ReturnType<typeof withDefaultHygiene> = withDefaultHygiene({});
    let baseRecommendations: string[] = [];
    let baseTreatmentGoalFinal = "";
    let baseConfidenceOverall: number | null = null;
    let baseFindings: z.infer<typeof FindingSchema>[] = [];
    let baseVersion = 0;
    let caseIdForImages: string | null = input.caseId ?? null;

    if (!baseReportText) {
      if (!input.caseId) return NextResponse.json({ error: "missing_report_or_caseId" }, { status: 400 });
      const fetchByVersion = async (v: number) => {
        const { data, error } = await sb
          .from("reports")
          .select("version, narrative, payload")
          .eq("case_id", input.caseId!)
          .eq("version", v)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as any;
      };
      const fetchLatest = async () => {
        const { data, error } = await sb
          .from("reports")
          .select("version, narrative, payload")
          .eq("case_id", input.caseId!)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as any;
      };

      const base = typeof input.targetVersion === "number" ? await fetchByVersion(input.targetVersion) : await fetchLatest();
      if (!base) return NextResponse.json({ error: "report_not_found" }, { status: 404 });

      baseVersion = Number(base.version || 0);
      baseSummary = String(base?.payload?.summary ?? base?.narrative ?? "");
      baseMeasurements = withDefaultMeasurements(base?.payload?.measurements || {});
      baseOcclusion = withDefaultOcclusion(base?.payload?.occlusion || {});
      baseHygiene = withDefaultHygiene(base?.payload?.hygiene || {});
      baseRecommendations = Array.isArray(base?.payload?.recommendations) ? base.payload.recommendations.map(String) : [];
      baseTreatmentGoalFinal = typeof base?.payload?.treatment_goal_final === "string" ? base.payload.treatment_goal_final : "";
      baseConfidenceOverall = clamp01(base?.payload?.confidence_overall) ?? null;

      const srcFindings: any[] = Array.isArray(base?.payload?.findings) ? base.payload.findings : [];
      baseFindings = srcFindings
        .map((f) =>
          ({
            tooth_fdi: toFDI(f?.tooth_fdi ?? f?.tooth) ?? null,
            findings: strArray(f?.findings).concat(strArray(f?.note)).filter(Boolean),
            severity: normSeverity(f?.severity) ?? "low",
            confidence: clamp01(firstNum(f?.confidence)) ?? 0.5,
            image_index: Number.isInteger(f?.image_index) ? f.image_index : 0,
            image_id: String(f?.image_id || ""),
            overlays: coerceOverlays(f?.overlays ?? []),
          } as z.infer<typeof FindingSchema>)
        )
        .filter((x) => x.tooth_fdi !== null) as any;

      baseReportText = JSON.stringify(
        {
          version: base.version,
          summary: baseSummary,
          measurements: baseMeasurements,
          occlusion: baseOcclusion,
          hygiene: baseHygiene,
          recommendations: baseRecommendations,
          treatment_goal_final: baseTreatmentGoalFinal,
          findings: baseFindings,
          confidence_overall: baseConfidenceOverall,
        },
        null,
        2
      );
    }

    const imagesPaths: string[] = [];
    if (Array.isArray(input.selectedPaths) && input.selectedPaths.length) {
      imagesPaths.push(...input.selectedPaths);
    } else if (caseIdForImages) {
      const { data: imgs } = await sb
        .from("case_images")
        .select("storage_path, is_original, created_at")
        .eq("case_id", caseIdForImages)
        .order("is_original", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(12);
      (imgs ?? []).forEach((r: any) => imagesPaths.push(String(r.storage_path)));
    }
    const signedUrls: string[] = [];
    for (const p of imagesPaths) {
      const { data, error } = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(p, SIGNED_URL_TTL);
      if (!error && data?.signedUrl) signedUrls.push(data.signedUrl);
    }
    const imagesManifest = imagesPaths.map((id, index) => ({ index, id }));

    const openai = new OpenAI({ apiKey });
    const messages = buildMessages(input, baseReportText, imagesManifest);
    const userContentImages = signedUrls.map((url) => ({ type: "image_url", image_url: { url } }));
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      max_tokens: input.maxTokens ?? 1400,
      response_format: { type: "json_object" },
      messages: [
        messages[0] as any,
        { role: "user", content: [...(messages[1] as any).content, ...userContentImages] },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";
    let ai: z.infer<typeof AIResponseSchema>;
    try {
      ai = AIResponseSchema.parse(JSON.parse(raw));
    } catch {
      ai = AIResponseSchema.parse({
        narrative: "",
        payload: {
          summary: "",
          measurements: withDefaultMeasurements({}),
          occlusion: withDefaultOcclusion({}),
          hygiene: withDefaultHygiene({}),
          recommendations: [],
          treatment_goal_final: "",
          confidence_overall: null,
          rebuttal: { narrative: "", updates: [], feedback_alignment: [], finding_changes: [] },
          images: imagesManifest,
          overlay_coords: "normalized_0_1",
        },
      });
    }

    const reconciledImages = imagesManifest.length ? imagesManifest : ai.payload.images;
    const cleanedBaseFindings = baseFindings.map((f) => {
      const idx = Number.isInteger(f.image_index) && f.image_index >= 0 && f.image_index < reconciledImages.length ? f.image_index : 0;
      const id = reconciledImages[idx]?.id || reconciledImages[0]?.id || f.image_id || "";
      return { ...f, image_index: idx, image_id: id, overlays: coerceOverlays(f.overlays || []) };
    });

    const cleanedChanges = (ai.payload.rebuttal.finding_changes || []).map((c) => {
      const t = toFDI(c.target_tooth_fdi) ?? c.target_tooth_fdi;
      let after: any = c.after || null;
      if (after) {
        const idx = Number.isInteger(after.image_index) && after.image_index >= 0 && after.image_index < reconciledImages.length ? after.image_index : 0;
        after = {
          ...after,
          tooth_fdi: toFDI(after.tooth_fdi ?? t) ?? t,
          severity: normSeverity(after.severity) ?? "low",
          confidence: clamp01(after.confidence) ?? 0.5,
          image_index: idx,
          image_id: reconciledImages[idx]?.id || reconciledImages[0]?.id || "",
          findings: strArray(after.findings),
          overlays: coerceOverlays(after.overlays || []),
        };
      }
      return { op: c.op, target_tooth_fdi: t as number, after, rationale: c.rationale, feedback_ref: c.feedback_ref } as z.infer<typeof FindingChangeSchema>;
    });

    const resultingFindings = applyFindingChanges(cleanedBaseFindings, cleanedChanges, reconciledImages);

    let mergedSummary = ai.payload.summary?.trim() ? ai.payload.summary : baseSummary;
    const mergedMeasurements = withDefaultMeasurements({ ...baseMeasurements, ...(ai.payload.measurements || {}) });
    const mergedOcclusion = withDefaultOcclusion({ ...baseOcclusion, ...(ai.payload.occlusion || {}) });
    const mergedHygiene = withDefaultHygiene({ ...baseHygiene, ...(ai.payload.hygiene || {}) });
    const mergedRecommendations = (Array.isArray(ai.payload.recommendations) && ai.payload.recommendations.length
      ? ai.payload.recommendations
      : baseRecommendations
    ).map(String);
    const mergedTGF = ai.payload.treatment_goal_final?.trim() ? ai.payload.treatment_goal_final : baseTreatmentGoalFinal;

    let mergedConfidence = clamp01(ai.payload.confidence_overall) ?? null;
    if (mergedConfidence === null && resultingFindings.length) {
      const mean = resultingFindings.reduce((s, r) => s + (Number(r.confidence) || 0), 0) / resultingFindings.length;
      mergedConfidence = Math.round(mean * 100) / 100;
    }
    if (mergedConfidence === null) mergedConfidence = baseConfidenceOverall;

    if (!input.caseId) {
      return NextResponse.json({
        ok: true,
        caseId: null,
        saved: false,
        model: MODEL,
        narrative: ai.narrative,
        payload: {
          summary: mergedSummary,
          measurements: mergedMeasurements,
          occlusion: mergedOcclusion,
          hygiene: mergedHygiene,
          recommendations: mergedRecommendations,
          treatment_goal_final: mergedTGF,
          confidence_overall: mergedConfidence,
          findings: resultingFindings,
          rebuttal: { ...ai.payload.rebuttal, finding_changes: cleanedChanges },
          images: reconciledImages,
          overlay_coords: "normalized_0_1",
        },
        usage: completion.usage ?? null,
      });
    }

    const { data: latest, error: latestErr } = await sb
      .from("reports")
      .select("version")
      .eq("case_id", input.caseId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) return NextResponse.json({ error: "db_latest_failed", details: latestErr.message }, { status: 500 });

    const lastVer = Number(latest?.version ?? baseVersion ?? 0) || 0;
    const nextVersion = lastVer + 1;

    const row = {
      case_id: input.caseId,
      version: nextVersion,
      author_type: "ai",
      narrative: ai.narrative || mergedSummary || "AI rebuttal",
      payload: {
        summary: mergedSummary,
        measurements: mergedMeasurements,
        occlusion: mergedOcclusion,
        hygiene: mergedHygiene,
        recommendations: mergedRecommendations,
        treatment_goal_final: mergedTGF,
        confidence_overall: mergedConfidence,
        findings: resultingFindings,
        rebuttal: { ...ai.payload.rebuttal, finding_changes: cleanedChanges },
        images: reconciledImages,
        overlay_coords: "normalized_0_1",
        _meta: { source: "ai_rebuttal", base_version: lastVer || baseVersion || null, model: MODEL },
      },
    };

    const restUrl = `${process.env.SUPABASE_URL}/rest/v1/reports`;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
    const ins = await fetch(restUrl, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!ins.ok) {
      const txt = await ins.text().catch(() => "");
      return NextResponse.json({ error: "db_insert_failed", details: txt || "unknown insert error" }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        saved: true,
        id: null,
        version: nextVersion,
        caseId: input.caseId,
        model: MODEL,
        narrative: row.narrative,
        payload: row.payload,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unexpected_error" }, { status: 500 });
  }
}
