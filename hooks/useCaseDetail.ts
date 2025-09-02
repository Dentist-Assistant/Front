// hooks/useCaseDetail.ts
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "../lib/supabaseBrowser";

export type CaseImage = { storage_path: string; is_original: boolean | null; created_at: string | null };
export type LatestReport = { version: number; payload: any; narrative: string | null };
export type CaseDetail = {
  case: { id: string; title: string | null; status: string | null } | null;
  images: CaseImage[];
  latestReport: LatestReport | null;
};

type State = {
  data: CaseDetail | null;
  isLoading: boolean;
  error: string | null;
};

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
  if (Array.isArray(g.circles)) {
    out.circles = g.circles
      .map((c: any) => ({
        cx: toNumber(c?.cx),
        cy: toNumber(c?.cy),
        r: toNumber(c?.r),
        norm: Boolean(c?.norm),
      }))
      .filter((c: any) => Number.isFinite(c.cx) && Number.isFinite(c.cy) && Number.isFinite(c.r));
  }
  if (Array.isArray(g.lines)) {
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
  if (Array.isArray(g.polygons)) {
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
  if (Array.isArray(g.boxes)) {
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

export default function useCaseDetail(caseId?: string | null) {
  const supabase = useMemo(() => getSupabaseBrowser(), []);
  const [state, setState] = useState<State>({ data: null, isLoading: true, error: null });

  const fetchDetail = useCallback(async () => {
    if (!caseId) {
      setState({ data: null, isLoading: false, error: "Missing case id" });
      return;
    }
    setState((s) => ({ ...s, isLoading: true, error: null }));

    const { data, error } = await supabase
      .from("cases")
      .select(
        `
        id,
        title,
        status,
        images:case_images(storage_path, is_original, created_at),
        latestReport:reports(version, payload, narrative)
      `
      )
      .eq("id", caseId)
      .order("version", { ascending: false, foreignTable: "reports" })
      .limit(1, { foreignTable: "reports" })
      .single();

    if (error || !data) {
      setState({ data: null, isLoading: false, error: error?.message ?? "Not found" });
      return;
    }

    const imgs: CaseImage[] = Array.isArray((data as any).images) ? (data as any).images : [];
    const imagesSorted = imgs
      .slice()
      .sort(
        (a, b) =>
          Number(b.is_original) - Number(a.is_original) ||
          new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );

    const latest = Array.isArray((data as any).latestReport) && (data as any).latestReport.length
      ? (data as any).latestReport[0]
      : null;

    const manifest = imagesSorted.map((row, i) => ({
      index: i,
      id: row.storage_path,
      path: row.storage_path,
    }));
    const indexById = new Map<string, number>();
    manifest.forEach((m) => indexById.set(m.id, m.index));

    const p = latest?.payload ?? {};
    const summary = typeof p.summary === "string" && p.summary.trim() ? p.summary : latest?.narrative ?? null;
    const measurements = typeof p.measurements === "object" && p.measurements ? p.measurements : {};
    const occlusion = typeof p.occlusion === "object" && p.occlusion ? p.occlusion : {};
    const hygiene = typeof p.hygiene === "object" && p.hygiene ? p.hygiene : {};
    const recommendations = Array.isArray(p.recommendations)
      ? p.recommendations.map((x: any) => asString(x)).filter(Boolean)
      : [];
    const treatment_goal_final = asString(p.treatment_goal_final);

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
      treatment_goal_final: treatment_goal_final || null,
      findings,
      images: manifest,
      rebuttal,
      _meta: { ...(p?._meta || {}) },
    };

    setState({
      data: {
        case: { id: String((data as any).id), title: (data as any).title ?? null, status: (data as any).status ?? null },
        images: imagesSorted,
        latestReport: latest
          ? {
              version: Number(latest.version),
              payload: normalizedPayload,
              narrative: latest.narrative ?? null,
            }
          : null,
      },
      isLoading: false,
      error: null,
    });
  }, [caseId, supabase]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const refresh = useCallback(async () => {
    await fetchDetail();
  }, [fetchDetail]);

  return {
    data: state.data,
    isLoading: state.isLoading,
    error: state.error,
    refresh,
  };
}
