import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_BUCKET = process.env.IMAGE_BUCKET || "cases";
const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL || "600");

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

const Body = z.object({
  caseId: z.string().uuid(),
  reportVersion: z.number().int().positive(),
  imagePaths: z.array(z.string().min(1)).min(1).max(24),
  notes: z.string().max(2000).optional(),
});

function lc(s: unknown) {
  return String(s || "").toLowerCase();
}
function isMissingColumn(msg: string) {
  const m = lc(msg);
  return m.includes("does not exist") || m.includes("unknown column") || (m.includes("column") && m.includes("not found"));
}
function isMissingTable(msg: string) {
  const m = lc(msg);
  return (m.includes("relation") && m.includes("does not exist")) || (m.includes("table") && m.includes("not exist"));
}
function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}
function annotatePath(p: string) {
  const parts = p.split("/");
  if (parts.length >= 2 && (parts[0] === "original" || parts[0] === "normalized")) {
    parts[0] = "annotated";
    return parts.join("/");
  }
  return `annotated/${p}`;
}

type Finding = {
  tooth_fdi?: number;
  findings?: string[];
  severity?: string;
  confidence?: number;
  image_index?: number;
  image_id?: string;
  geometry?: {
    circles?: Array<{ cx: number; cy: number; r: number; norm?: boolean }>;
    lines?: Array<{ x1: number; y1: number; x2: number; y2: number; norm?: boolean }>;
    polygons?: Array<{ points: Array<{ x: number; y: number }>; norm?: boolean }>;
    boxes?: Array<{ x: number; y: number; w: number; h: number; norm?: boolean }>;
  };
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 204 });
}

function getBaseUrl(req: Request) {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || process.env.VERCEL_URL || "";
  if (envUrl) return envUrl.startsWith("http") ? envUrl : `https://${envUrl}`;
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const sb = admin();

  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!jwt) return NextResponse.json({ error: "unauthorized_missing_token" }, { status: 401 });
    const userRes = await sb.auth.getUser(jwt);
    const user = userRes.data.user;
    if (!user) return NextResponse.json({ error: "unauthorized_invalid_token" }, { status: 401 });

    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }
    const { caseId, reportVersion, imagePaths, notes } = parsed.data;
    const uniqueImages = unique(imagePaths.map((p) => p.trim()).filter(Boolean));
    if (!uniqueImages.length) return NextResponse.json({ error: "no_valid_images" }, { status: 400 });

    const { data: repRow, error: repErr } = await sb
      .from("reports")
      .select("id, narrative, payload")
      .eq("case_id", caseId)
      .eq("version", reportVersion)
      .maybeSingle();
    if (repErr) return NextResponse.json({ error: "db_error", details: repErr.message }, { status: 500 });
    if (!repRow) {
      return NextResponse.json(
        { error: "report_version_not_found", details: `v${reportVersion} does not exist for this case` },
        { status: 404 }
      );
    }

    const { data: imgs, error: imgsFetchErr } = await sb
      .from("case_images")
      .select("storage_path")
      .eq("case_id", caseId)
      .in("storage_path", uniqueImages);
    if (imgsFetchErr) return NextResponse.json({ error: "db_error", details: imgsFetchErr.message }, { status: 500 });
    const found = new Set((imgs || []).map((r) => r.storage_path));
    const missing = uniqueImages.filter((p) => !found.has(p));
    if (missing.length) {
      return NextResponse.json({ error: "images_not_in_case", missing }, { status: 400 });
    }

    const payload = (repRow as any).payload || {};
    const findings: Finding[] = Array.isArray(payload?.findings) ? payload.findings : [];
    const summaryText: string = typeof payload?.summary === "string" ? payload.summary : String(repRow.narrative || "");
    const templateMeta = {
      summary: summaryText,
      final_treatment_goal:
        typeof payload?.final_treatment_goal === "string"
          ? payload.final_treatment_goal
          : typeof payload?.treatment_goal_final === "string"
          ? payload.treatment_goal_final
          : null,
      measurements: payload?.measurements ?? null,
      occlusion: payload?.occlusion ?? null,
      hygiene: payload?.hygiene ?? null,
      recommendations: Array.isArray(payload?.recommendations) ? payload.recommendations : [],
      confidence_overall: typeof payload?.confidence_overall === "number" ? payload.confidence_overall : null,
    };

    const overlaysByPath: Record<
      string,
      Array<{
        finding_index: number;
        tooth_fdi: number | null;
        labels: string[];
        severity: string | null;
        confidence: number | null;
        geometry: Required<NonNullable<Finding["geometry"]>>;
      }>
    > = {};
    const ensureGeom = (g: Finding["geometry"]) => ({
      circles: Array.isArray(g?.circles) ? g!.circles! : [],
      lines: Array.isArray(g?.lines) ? g!.lines! : [],
      polygons: Array.isArray(g?.polygons) ? g!.polygons! : [],
      boxes: Array.isArray(g?.boxes) ? g!.boxes! : [],
    });
    findings.forEach((f, idx) => {
      const path = String(f.image_id || "");
      if (!path || !uniqueImages.includes(path)) return;
      const entry = {
        finding_index: idx + 1,
        tooth_fdi: Number.isFinite(f.tooth_fdi) ? (f.tooth_fdi as number) : null,
        labels: Array.isArray(f.findings) ? (f.findings as string[]) : [],
        severity: typeof f.severity === "string" ? f.severity : null,
        confidence: typeof f.confidence === "number" ? f.confidence : null,
        geometry: ensureGeom(f.geometry),
      };
      if (!overlaysByPath[path]) overlaysByPath[path] = [];
      overlaysByPath[path].push(entry);
    });

    const insertPacket: Record<string, unknown> = {
      case_id: caseId,
      report_version: reportVersion,
      created_by: user.id,
      status: "OPEN",
      notes: notes || null,
    };
    const { data: packet, error: pktErr } = await sb
      .from("review_packets")
      .insert(insertPacket)
      .select("id, status, report_version, created_at, created_by")
      .single();
    if (pktErr) return NextResponse.json({ error: "insert_failed", details: pktErr.message }, { status: 500 });

    const rowsFull = uniqueImages.map((p: string, i: number) => ({
      packet_id: packet.id,
      image_path: p,
      annotated_path: annotatePath(p),
      overlays: overlaysByPath[p] || [],
      position: i + 1,
    }));

    let imageInsertOk = true;
    let imageInsertErr: string | null = null;
    {
      const { error } = await sb.from("review_packet_images").insert(rowsFull);
      if (error) {
        if (isMissingColumn(error.message)) {
          const minimal = uniqueImages.map((p: string, i: number) => ({
            packet_id: packet.id,
            image_path: p,
            position: i + 1,
          }));
          const fallback = await sb.from("review_packet_images").insert(minimal);
          if (fallback.error) {
            imageInsertOk = false;
            imageInsertErr = fallback.error.message || error.message;
          }
        } else {
          imageInsertOk = false;
          imageInsertErr = error.message;
        }
      }
    }
    if (!imageInsertOk) {
      await sb.from("review_packets").delete().eq("id", packet.id);
      return NextResponse.json({ error: "images_insert_failed", details: imageInsertErr }, { status: 500 });
    }

    let metaSaved = false;
    {
      const metaRow = {
        packet_id: packet.id,
        template_meta: templateMeta,
        image_manifest: uniqueImages.map((p, i) => ({
          image_path: p,
          annotated_path: annotatePath(p),
          position: i + 1,
          overlays_count: (overlaysByPath[p] || []).length,
        })),
      };
      const ins = await sb.from("review_packet_meta").insert(metaRow);
      if (!ins.error) metaSaved = true;
      if (ins.error && !isMissingTable(ins.error.message)) {
        metaSaved = false;
      }
    }
    if (!metaSaved) {
      const updateRow: Record<string, unknown> = {};
      updateRow["template_meta"] = templateMeta;
      updateRow["summary"] = templateMeta.summary;
      const upd = await sb.from("review_packets").update(updateRow).eq("id", packet.id);
      if (upd.error && !isMissingColumn(upd.error.message)) {
        return NextResponse.json({ error: "packet_update_failed", details: upd.error.message }, { status: 500 });
      }
    }

    const baseUrl = getBaseUrl(req);
    const pdfRes = await fetch(`${baseUrl}/api/reports/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caseId,
        draftVersion: reportVersion,
        rebuttalVersion: "latest",
        images: uniqueImages,
      }),
    });

    if (!pdfRes.ok) {
      await sb.from("review_packet_images").delete().eq("packet_id", packet.id);
      await sb.from("review_packets").delete().eq("id", packet.id);
      const details = await pdfRes.text().catch(() => "Failed to render PDF");
      return NextResponse.json({ error: "pdf_render_failed", details }, { status: 500 });
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    const pdfBytes = Buffer.from(pdfArrayBuffer);
    const versionedKey = `pdf/${caseId}/v${reportVersion}.pdf`;
    const latestKey = `pdf/${caseId}/latest.pdf`;

    const up1 = await sb.storage.from(IMAGE_BUCKET).upload(versionedKey, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "3600",
    });
    if (up1.error) {
      await sb.from("review_packet_images").delete().eq("packet_id", packet.id);
      await sb.from("review_packets").delete().eq("id", packet.id);
      return NextResponse.json({ error: "pdf_upload_failed", details: up1.error.message }, { status: 500 });
    }

    const up2 = await sb.storage.from(IMAGE_BUCKET).upload(latestKey, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
      cacheControl: "60",
    });
    if (up2.error) {
      return NextResponse.json({ error: "pdf_latest_upload_failed", details: up2.error.message }, { status: 500 });
    }

    const signedVersioned = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(versionedKey, SIGNED_URL_TTL);
    const signedLatest = await sb.storage.from(IMAGE_BUCKET).createSignedUrl(latestKey, SIGNED_URL_TTL);

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: packet.id,
          status: packet.status,
          report_version: packet.report_version,
          created_at: packet.created_at,
          created_by: packet.created_by,
          image_count: uniqueImages.length,
          template_meta: templateMeta,
          images: uniqueImages.map((p, i) => ({
            image_path: p,
            annotated_path: annotatePath(p),
            position: i + 1,
            overlays: overlaysByPath[p] || [],
          })),
          pdf: {
            bucket: IMAGE_BUCKET,
            versioned_path: versionedKey,
            latest_path: latestKey,
            size_bytes: pdfBytes.byteLength,
            signed: {
              versioned_url: signedVersioned.data?.signedUrl || null,
              latest_url: signedLatest.data?.signedUrl || null,
              ttl_seconds: SIGNED_URL_TTL,
            },
          },
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: "unexpected_error", details: e?.message || "Unknown error" }, { status: 500 });
  }
}
