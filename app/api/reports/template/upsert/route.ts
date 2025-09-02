// app/api/reports/template/upsert/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  TemplatePatchSchema,
  DraftReportPayloadSchema,
} from "@/lib/schemas/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  caseId: z.string().uuid(),
  targetVersion: z.number().int().positive().optional(),
  authorType: z.enum(["user", "doctor"]).default("user"),
  patch: TemplatePatchSchema,
  recalcConfidence: z.boolean().optional(),
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

function strArray(val: any): string[] {
  if (Array.isArray(val)) return val.map((x) => String(x)).filter(Boolean);
  if (typeof val === "string" && val.trim()) return [val.trim()];
  return [];
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

function coerceTreatmentGoalFinal(input: unknown): string {
  if (typeof input === "string") return input.trim();
  if (input && typeof input === "object") {
    const any = input as any;
    const parts: string[] = [];
    if (typeof any.summary === "string" && any.summary.trim()) parts.push(any.summary.trim());
    const goals = strArray(any.goals);
    if (goals.length) parts.push(goals.map((g: string) => `• ${g}`).join(" "));
    if (Number.isFinite(any.duration_months)) parts.push(`Estimated duration: ${any.duration_months} months`);
    if (typeof any.notes === "string" && any.notes.trim()) parts.push(any.notes.trim());
    return parts.join(" ").trim();
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }
    const { caseId, targetVersion, authorType, patch, recalcConfidence } = parsed.data;
    const sb = admin();

    const fetchByVersion = async (v: number) => {
      const { data, error } = await sb
        .from("reports")
        .select("version, narrative, payload")
        .eq("case_id", caseId)
        .eq("version", v)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    };
    const fetchLatest = async () => {
      const { data, error } = await sb
        .from("reports")
        .select("version, narrative, payload")
        .eq("case_id", caseId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    };

    const base = typeof targetVersion === "number" ? await fetchByVersion(targetVersion) : await fetchLatest();
    const lastVer = Number(base?.version ?? 0) || 0;
    const nextVersion = lastVer + 1;

    const basePayload = base?.payload || {};
    const baseValidated = DraftReportPayloadSchema.partial().parse(basePayload);

    const summary = typeof patch.summary === "string" ? patch.summary : baseValidated.summary || "";
    const measurements = withDefaultMeasurements({ ...(baseValidated.measurements || {}), ...(patch.measurements || {}) });
    const occlusion = withDefaultOcclusion({ ...(baseValidated.occlusion || {}), ...(patch.occlusion || {}) });
    const hygiene = withDefaultHygiene({ ...(baseValidated.hygiene || {}), ...(patch.hygiene || {}) });
    const recommendations = (Array.isArray(patch.recommendations) ? patch.recommendations : baseValidated.recommendations || []).map(String);
    const tgf = coerceTreatmentGoalFinal(
      patch.treatment_goal_final !== undefined ? patch.treatment_goal_final : baseValidated.treatment_goal_final
    );

    let confidence_overall =
      patch.confidence_overall !== undefined
        ? clamp01(patch.confidence_overall)
        : clamp01(baseValidated.confidence_overall);

    if ((confidence_overall === null || recalcConfidence) && Array.isArray(baseValidated.findings) && baseValidated.findings.length) {
      const mean =
        baseValidated.findings.reduce((s: number, r: any) => s + (Number(r?.confidence) || 0), 0) /
        baseValidated.findings.length;
      confidence_overall = clamp01(mean);
    }

    const newPayload = {
      ...baseValidated,
      summary,
      measurements,
      occlusion,
      hygiene,
      recommendations,
      treatment_goal_final: tgf,
      confidence_overall,
    };

    const narrative = summary || base?.narrative || "Manual update";

    const { error: insErr, data: insData } = await sb
      .from("reports")
      .insert({
        case_id: caseId,
        version: nextVersion,
        parent_version: lastVer || null,
        author_type: authorType,
        narrative,
        payload: newPayload,
      })
      .select("id, version")
      .single();

    if (insErr) {
      const fallback = await sb
        .from("reports")
        .insert({
          case_id: caseId,
          version: nextVersion,
          author_type: authorType,
          narrative,
          payload: newPayload,
        })
        .select("id, version")
        .single();
      if (fallback.error) {
        return NextResponse.json({ error: "db_insert_failed", details: fallback.error.message }, { status: 500 });
      }
      return NextResponse.json(
        { ok: true, id: fallback.data.id, version: fallback.data.version, narrative, payload: newPayload },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      { ok: true, id: insData?.id, version: insData?.version, narrative, payload: newPayload },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "internal_error", details: e?.message || "Unexpected error" }, { status: 500 });
  }
}
