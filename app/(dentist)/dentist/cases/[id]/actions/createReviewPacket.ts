// app/(…)/actions/createReviewPacket.ts
"use client";

import { getSupabaseBrowser } from "../../../../../../lib/supabaseBrowser";

type ReviewPacketRow = {
  id: string;
  status: string;
  report_version: number;
  images: string[];
  rebuttal_version?: number | null;
};

export async function createReviewPacket(params: {
  caseId: string;
  sharedReportVersion: number;
  sharedImages: string[];
  rebuttalVersion?: number | null;
  notes?: string; 
}) {
  const { caseId, sharedReportVersion, sharedImages, rebuttalVersion = null } = params;

  if (!caseId) return { ok: false, error: "Missing caseId" };
  if (sharedReportVersion === undefined || sharedReportVersion === null)
    return { ok: false, error: "Missing sharedReportVersion" };
  if (!Array.isArray(sharedImages) || sharedImages.length === 0)
    return { ok: false, error: "Missing sharedImages" };

  const images = Array.from(new Set(sharedImages.map((p) => p.trim()).filter(Boolean)));
  if (images.length === 0) return { ok: false, error: "No valid images" };
  if (images.length > 24) return { ok: false, error: "Too many images (max 24)" };

  const supabase = getSupabaseBrowser();

  const { data: sessRes } = await supabase.auth.getSession();
  const session = sessRes?.session ?? null;
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  const { data: versionExists, error: verErr } = await supabase
    .from("reports")
    .select("id")
    .eq("case_id", caseId)
    .eq("version", sharedReportVersion)
    .maybeSingle();

  if (verErr) return { ok: false, error: verErr.message };
  if (!versionExists) return { ok: false, error: `Report version v${sharedReportVersion} not found` };

  if (rebuttalVersion !== null) {
    const { data: rebExists, error: rebErr } = await supabase
      .from("reports")
      .select("id")
      .eq("case_id", caseId)
      .eq("version", rebuttalVersion)
      .maybeSingle();
    if (rebErr) return { ok: false, error: rebErr.message };
    if (!rebExists) return { ok: false, error: `Rebuttal version v${rebuttalVersion} not found` };
  }

  const { data: imgsInCase, error: imgsErr } = await supabase
    .from("case_images")
    .select("storage_path")
    .eq("case_id", caseId)
    .in("storage_path", images)
    .returns<{ storage_path: string }[]>();

  if (imgsErr) return { ok: false, error: imgsErr.message };

  const found = new Set((imgsInCase || []).map((r) => r.storage_path));
  const missing = images.filter((p) => !found.has(p));
  if (missing.length > 0) {
    return { ok: false, error: "Some images do not belong to this case", missing };
  }

  const insertPayload: {
    case_id: string;
    report_version: number;
    rebuttal_version?: number | null;
    images: string[];
    created_by: string;
    status: string;
  } = {
    case_id: caseId,
    report_version: sharedReportVersion,
    images,
    created_by: session.user.id,
    status: "OPEN",
  };
  if (typeof rebuttalVersion === "number") insertPayload.rebuttal_version = rebuttalVersion;

  const { data, error } = await (supabase as any)
    .from("review_packets")
    .insert(insertPayload)
    .select("id, status, report_version, images, rebuttal_version")
    .single();

  if (error) return { ok: false, error: error.message };

  const row = (data ?? null) as ReviewPacketRow | null;
  if (!row) return { ok: false, error: "Not found" };

  return { ok: true, data: row };
}
