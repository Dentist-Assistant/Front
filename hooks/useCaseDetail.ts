// hooks/useCaseDetail.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

export type CaseImage = { storage_path: string; is_original: boolean | null; created_at: string | null };
export type LatestReport = { version: number; payload: any; narrative: string | null };
export type CaseDetail = {
  case: { id: string; title: string | null; status: string | null; assigned_tech?: string | null } | null;
  images: CaseImage[];
  latestReport: LatestReport | null;
};

type State = {
  data: CaseDetail | null;
  isLoading: boolean;
  error: string | null;
};

type TreatmentGoal =
  | {
      summary?: string;
      goals?: string[];
      duration_months?: number | null;
      notes?: string;
    }
  | null;

type CaseRow = { id: string; title: string | null; status: string | null; assigned_tech: string | null };
type ImageRow = { storage_path: string; is_original: boolean | null; created_at: string | null };
type ReportRow = { version: number | null; payload: any | null; narrative: string | null };

function toNumber(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function normalizeGeometry(g: any) {
  if (!g || typeof g !== "object") return null;
  const out: any = {};
  if (Array.isArray(g?.circles)) {
    out.circles = g.circles
      .map((c: any) => ({
        cx: toNumber(c?.cx),
        cy: toNumber(c?.cy),
        r: toNumber(c?.r),
        norm: Boolean(c?.norm),
      }))
      .filter((c: any) => Number.isFinite(c.cx) && Number.isFinite(c.cy) && Number.isFinite(c.r));
  }
  if (Array.isArray(g?.lines)) {
    out.lines = g.lines
      .map((l: any) => ({
        x1: toNumber(l?.x1),
        y1: toNumber(l?.y1),
        x2: toNumber(l?.x2),
        y2: toNumber(l?.y2),
        norm: Boolean(l?.norm),
      }))
      .filter((l: any) => Number.isFinite(l.x1) && Number.isFinite(l.y1) && Number.isFinite(l.x2) && Number.isFinite(l.y2));
  }
  if (Array.isArray(g?.polygons)) {
    out.polygons = g.polygons
      .map((p: any) => ({
        points: Array.isArray(p?.points)
          ? p.points
              .map((pt: any) => ({ x: toNumber(pt?.x), y: toNumber(pt?.y), norm: Boolean(pt?.norm) }))
              .filter((pt: any) => Number.isFinite(pt.x) && Number.isFinite(pt.y))
          : [],
        norm: Boolean(p?.norm),
      }))
      .filter((p: any) => p.points.length >= 2);
  }
  if (Array.isArray(g?.boxes)) {
    out.boxes = g.boxes
      .map((b: any) => ({
        x: toNumber(b?.x),
        y: toNumber(b?.y),
        w: toNumber(b?.w),
        h: toNumber(b?.h),
        norm: Boolean(b?.norm),
      }))
      .filter((b: any) => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h));
  }
  return Object.keys(out).length ? out : null;
}
function coerceTreatmentGoal(raw: any): TreatmentGoal {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    return { summary: s };
  }
  if (typeof raw === "object") {
    const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : undefined;
    const goals = Array.isArray(raw.goals) ? raw.goals.map((g: any) => String(g || "").trim()).filter(Boolean) : undefined;
    const duration_months =
      raw.duration_months === null
        ? null
        : Number.isFinite(Number(raw.duration_months))
        ? Number(raw.duration_months)
        : undefined;
    const notes = typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : undefined;
    if (!summary && (!goals || goals.length === 0) && duration_months === undefined && !notes) return null;
    return { summary, goals, duration_months, notes };
  }
  return null;
}

export default function useCaseDetail(caseId?: string | null, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled ?? true;
  const [state, setState] = useState<State>({ data: null, isLoading: true, error: null });

  const fetchDetail = useCallback(async () => {
    if (!enabled) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    if (!caseId) {
      setState({ data: null, isLoading: false, error: "Missing case id" });
      return;
    }

    setState((s) => ({ ...s, isLoading: true, error: null }));

    try {
      const supabase = getSupabaseBrowser();

      const { data: caseData, error: caseErr } = await supabase
        .from("cases")
        .select("id,title,status,assigned_tech")
        .eq("id", caseId)
        .single();

      if (caseErr || !caseData) throw new Error(caseErr?.message ?? "Case not found");
      const caseRow = caseData as CaseRow;

      const { data: imagesData, error: imgErr } = await supabase
        .from("case_images")
        .select("storage_path,is_original,created_at")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });

      if (imgErr) throw new Error(imgErr.message);
      const imagesRows = (imagesData ?? []) as ImageRow[];
      const imagesSorted: CaseImage[] = imagesRows
        .slice()
        .sort(
          (a, b) =>
            Number(b.is_original) - Number(a.is_original) ||
            new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        );

      const { data: repData, error: repErr } = await supabase
        .from("reports")
        .select("version,payload,narrative")
        .eq("case_id", caseId)
        .order("version", { ascending: false })
        .limit(1);

      if (repErr) throw new Error(repErr.message);
      const reportRows = (repData ?? []) as ReportRow[];
      const latest: ReportRow | null = reportRows.length ? reportRows[0] : null;

      const manifest = imagesSorted.map((row, i) => ({ index: i, id: row.storage_path, path: row.storage_path }));
      const indexById = new Map<string, number>();
      manifest.forEach((m) => indexById.set(m.id, m.index));

      const p: any = (latest?.payload ?? {}) as any;
      const summary = typeof p.summary === "string" && p.summary.trim() ? p.summary : latest?.narrative ?? null;
      const measurements = typeof p.measurements === "object" && p.measurements ? p.measurements : {};
      const occlusion = typeof p.occlusion === "object" && p.occlusion ? p.occlusion : {};
      const hygiene = typeof p.hygiene === "object" && p.hygiene ? p.hygiene : {};
      const recommendations = Array.isArray(p.recommendations)
        ? p.recommendations.map((x: any) => asString(x)).filter(Boolean)
        : [];
      const treatment_goal_final = coerceTreatmentGoal(
        p.treatment_goal_final ?? p.final_treatment_goal ?? p.treatment_goal
      );

      const findingsRaw: any[] = Array.isArray(p.findings) ? p.findings : [];
      const findings = findingsRaw.map((f) => {
        const tooth_fdi = toNumber(f?.tooth_fdi ?? f?.tooth ?? 0);
        const texts = Array.isArray(f?.findings)
          ? f.findings.map((t: any) => asString(t)).filter(Boolean)
          : asString(f?.note)
          ? [asString(f?.note)]
          : [];
        const image_index =
          Number.isInteger(f?.image_index) && f?.image_index >= 0
            ? Number(f.image_index)
            : typeof f?.image_id === "string" && f.image_id
            ? indexById.get(f.image_id) ?? null
            : null;
        const image_id =
          typeof f?.image_id === "string" && f.image_id
            ? f.image_id
            : Number.isInteger(image_index) && image_index! >= 0 && image_index! < imagesSorted.length
            ? imagesSorted[image_index!].storage_path
            : null;
        return {
          tooth_fdi,
          findings: texts,
          severity: p?.severity_map ? p.severity_map[tooth_fdi] ?? f?.severity ?? null : f?.severity ?? null,
          confidence: typeof f?.confidence === "number" ? f.confidence : null,
          image_index,
          image_id,
          geometry: normalizeGeometry(f?.geometry),
        };
      });

      const rebuttal = p?.rebuttal && typeof p.rebuttal === "object" ? p.rebuttal : undefined;

      const normalizedPayload = {
        summary,
        measurements,
        occlusion,
        hygiene,
        recommendations,
        treatment_goal_final,
        findings,
        images: manifest,
        rebuttal,
        _meta: { ...(p?._meta || {}) },
      };

      setState({
        data: {
          case: {
            id: String(caseRow.id),
            title: caseRow.title ?? null,
            status: caseRow.status ?? null,
            assigned_tech: caseRow.assigned_tech ?? null,
          },
          images: imagesSorted,
          latestReport: latest
            ? {
                version: Number(latest.version ?? 0),
                payload: normalizedPayload,
                narrative: latest.narrative ?? null,
              }
            : null,
        },
        isLoading: false,
        error: null,
      });
    } catch (e: any) {
      console.error("[useCaseDetail] load failed:", e);
      setState({ data: null, isLoading: false, error: e?.message ?? "Failed to load" });
    }
  }, [enabled, caseId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await fetchDetail();
  }, [enabled, fetchDetail]);

  const updateTreatmentGoalFinal = useCallback(
    async (val: TreatmentGoal | string | null) => {
      if (!caseId) throw new Error("Missing case id");
      const supabase = getSupabaseBrowser();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthorized");

      let next: TreatmentGoal = null;
      if (typeof val === "string") {
        const s = val.trim();
        next = s ? { summary: s } : null;
      } else if (val && typeof val === "object") {
        const summary = typeof val.summary === "string" && val.summary.trim() ? val.summary.trim() : undefined;
        const goals = Array.isArray(val.goals) ? val.goals.map((g) => String(g || "").trim()).filter(Boolean) : undefined;
        const duration_months =
          val.duration_months === null
            ? null
            : Number.isFinite(Number(val.duration_months))
            ? Number(val.duration_months)
            : undefined;
        const notes = typeof val.notes === "string" && val.notes.trim() ? val.notes.trim() : undefined;
        next =
          !summary && (!goals || goals.length === 0) && duration_months === undefined && !notes
            ? null
            : { summary, goals, duration_months, notes };
      } else {
        next = null;
      }

      const patch: Record<string, any> = {};
      if (next) patch.treatment_goal_final = next;

      const res = await fetch("/api/reports/template/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ caseId, patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed to update");

      setState((s) => {
        if (!s?.data?.latestReport) return s;
        const curr = s.data.latestReport!;
        const updated = { ...curr, payload: { ...curr.payload, treatment_goal_final: next } };
        return { ...s, data: { ...s.data, latestReport: updated } };
      });

      await fetchDetail();
      return { ok: true as const };
    },
    [caseId, fetchDetail]
  );

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
    refetch: refresh,
    updateTreatmentGoalFinal,
  };
}
