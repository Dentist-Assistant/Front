// lib/schemas/report.ts
import { z } from "zod";

export const SeverityEnum = z.enum(["low", "medium", "high"]);

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
  norm: z.boolean().optional(),
});

export const CircleSchema = z.object({
  cx: z.number(),
  cy: z.number(),
  r: z.number().positive(),
  norm: z.boolean().optional(),
});

export const LineSchema = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  norm: z.boolean().optional(),
});

export const PolygonSchema = z.object({
  points: z.array(PointSchema).min(3),
  norm: z.boolean().optional(),
});

export const BoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  norm: z.boolean().optional(),
});

export const GeometrySchema = z
  .object({
    circles: z.array(CircleSchema).optional(),
    lines: z.array(LineSchema).optional(),
    polygons: z.array(PolygonSchema).optional(),
    boxes: z.array(BoxSchema).optional(),
  })
  .strict();

export const MeasurementSchema = z.object({
  overjet_mm: z.number().optional(),
  overbite_percent: z.number().optional(),
  midline_deviation_mm: z.number().optional(),
  crowding_upper_mm: z.number().optional(),
  crowding_lower_mm: z.number().optional(),
});

export const OcclusionSchema = z.object({
  class_right: z.enum(["I", "II", "III"]).optional(),
  class_left: z.enum(["I", "II", "III"]).optional(),
  open_bite: z.boolean().optional(),
  crossbite: z.boolean().optional(),
});

export const HygieneSchema = z.object({
  plaque: z.string().optional(),
  calculus: z.string().optional(),
  gingival_inflammation: z.string().optional(),
});

export const TreatmentGoalFinalSchema = z.object({
  summary: z.string().optional(),
  goals: z.array(z.string()).default([]),
  duration_months: z.number().int().positive().nullable().optional(),
  notes: z.string().optional(),
});

export const ImageManifestItemSchema = z.object({
  index: z.number().int().min(0).optional(),
  id: z.string().optional(),
  path: z.string().optional(),
  url: z.string().url().optional(),
  caption: z.string().nullable().optional(),
  annotated: z.boolean().optional(),
  annotated_path: z.string().optional(),
  primary: z.boolean().optional(),
});

export const ImageManifestSchema = z.array(ImageManifestItemSchema);

export const FindingBaseSchema = z.object({
  tooth_fdi: z.number().int().positive(),
  findings: z.array(z.string()).min(1),
  severity: SeverityEnum,
  confidence: z.number().min(0).max(1).nullable().optional(),
  image_index: z.number().int().min(0).nullable().optional(),
  image_id: z.string().min(1).nullable().optional(),
  note: z.string().nullable().optional(),
});

export const FindingWithGeometrySchema = FindingBaseSchema.extend({
  geometry: GeometrySchema.nullable().optional(),
});

export const RebuttalUpdateSchema = z.object({
  topic: z.string(),
  action: z.enum(["add", "modify", "remove"]),
  text: z.string(),
  rationale: z.string(),
  source: z.enum(["feedback", "ai"]).optional(),
  feedback_ref: z.number().int().positive().optional(),
  tooth_fdi: z.number().int().positive().optional(),
  image_index: z.number().int().min(0).optional(),
  image_id: z.string().optional(),
  geometry: GeometrySchema.optional(),
});

export const FeedbackAlignmentSchema = z.object({
  item_number: z.number().int().positive(),
  item_text: z.string(),
  decision: z.enum(["accept", "partial", "reject"]),
  reason: z.string(),
  linked_updates: z.array(z.number().int().positive()).default([]),
});

export const RebuttalBlockSchema = z.object({
  narrative: z.string().default(""),
  updates: z.array(RebuttalUpdateSchema).default([]),
  feedback_alignment: z.array(FeedbackAlignmentSchema).default([]),
});

export const ReportTemplateSchema = z.object({
  summary: z.string().optional(),
  measurements: MeasurementSchema.optional(),
  occlusion: OcclusionSchema.optional(),
  hygiene: HygieneSchema.optional(),
  recommendations: z.array(z.string()).default([]),
  confidence_overall: z.number().min(0).max(1).optional(),
  treatment_goal_final: TreatmentGoalFinalSchema.optional(),
});

export const DraftReportPayloadSchema = ReportTemplateSchema.extend({
  images: ImageManifestSchema.optional(),
  findings: z.array(FindingWithGeometrySchema).default([]),
  _meta: z.record(z.string(), z.unknown()).optional(),
});

export const RebuttalReportPayloadSchema = DraftReportPayloadSchema.extend({
  rebuttal: RebuttalBlockSchema.optional(),
});

const CoerceNumberOpt = z
  .preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (typeof v === "number") return v;
    const num = Number(String(v).replace(/[^\d.-]/g, ""));
    return Number.isFinite(num) ? num : undefined;
  }, z.number())
  .optional();

const CoerceNumber01Opt = CoerceNumberOpt.refine((n) => n === undefined || (n >= 0 && n <= 1), {
  message: "must be between 0 and 1",
});

const CoerceIntPosOpt = z
  .preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    return Math.trunc(n);
  }, z.number().int().positive())
  .optional();

const CoerceBoolOpt = z
  .preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(s)) return true;
    if (["false", "0", "no", "n", "off"].includes(s)) return false;
    return undefined;
  }, z.boolean())
  .optional();

const CoerceAngleClassOpt = z
  .preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    const s = String(v).trim().toUpperCase().replace(/^CLASS\s*/i, "");
    return ["I", "II", "III"].includes(s) ? s : undefined;
  }, z.enum(["I", "II", "III"]))
  .optional();

const CoerceStringOpt = z
  .preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    const s = String(v).trim();
    return s.length ? s : undefined;
  }, z.string())
  .optional();

const CoerceStringArrayOpt = z
  .preprocess((v) => {
    if (v === null || v === undefined) return undefined;
    if (Array.isArray(v)) return v.map((x) => String(x)).filter((s) => s.trim().length);
    const s = String(v);
    const parts = s.split(/\r?\n|;|,|•|- |\u2022/g).map((x) => x.trim()).filter(Boolean);
    return parts;
  }, z.array(z.string()))
  .optional();

export const TemplatePatchSchema = z.object({
  summary: CoerceStringOpt,
  measurements: z
    .object({
      overjet_mm: CoerceNumberOpt,
      overbite_percent: CoerceNumberOpt,
      midline_deviation_mm: CoerceNumberOpt,
      crowding_upper_mm: CoerceNumberOpt,
      crowding_lower_mm: CoerceNumberOpt,
    })
    .partial()
    .optional(),
  occlusion: z
    .object({
      class_right: CoerceAngleClassOpt,
      class_left: CoerceAngleClassOpt,
      open_bite: CoerceBoolOpt,
      crossbite: CoerceBoolOpt,
    })
    .partial()
    .optional(),
  hygiene: z
    .object({
      plaque: CoerceStringOpt,
      calculus: CoerceStringOpt,
      gingival_inflammation: CoerceStringOpt,
    })
    .partial()
    .optional(),
  recommendations: CoerceStringArrayOpt,
  confidence_overall: CoerceNumber01Opt,
  treatment_goal_final: z
    .object({
      summary: CoerceStringOpt,
      goals: CoerceStringArrayOpt,
      duration_months: CoerceIntPosOpt.or(z.null()).optional(),
      notes: CoerceStringOpt,
    })
    .partial()
    .optional(),
});

export type Severity = z.infer<typeof SeverityEnum>;
export type Point = z.infer<typeof PointSchema>;
export type Circle = z.infer<typeof CircleSchema>;
export type Line = z.infer<typeof LineSchema>;
export type Polygon = z.infer<typeof PolygonSchema>;
export type Box = z.infer<typeof BoxSchema>;
export type Geometry = z.infer<typeof GeometrySchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;
export type Occlusion = z.infer<typeof OcclusionSchema>;
export type Hygiene = z.infer<typeof HygieneSchema>;
export type TreatmentGoalFinal = z.infer<typeof TreatmentGoalFinalSchema>;
export type ImageManifestItem = z.infer<typeof ImageManifestItemSchema>;
export type Finding = z.infer<typeof FindingBaseSchema>;
export type FindingWithGeometry = z.infer<typeof FindingWithGeometrySchema>;
export type RebuttalUpdate = z.infer<typeof RebuttalUpdateSchema>;
export type FeedbackAlignment = z.infer<typeof FeedbackAlignmentSchema>;
export type RebuttalBlock = z.infer<typeof RebuttalBlockSchema>;
export type DraftReportPayload = z.infer<typeof DraftReportPayloadSchema>;
export type RebuttalReportPayload = z.infer<typeof RebuttalReportPayloadSchema>;
export type TemplatePatch = z.infer<typeof TemplatePatchSchema>;
