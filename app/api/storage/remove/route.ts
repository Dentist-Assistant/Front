// app/api/storage/remove/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BUCKET = process.env.IMAGE_BUCKET || "cases";

const Body = z.object({
  bucket: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
  paths: z.array(z.string().min(1)).optional(),
  caseId: z.string().uuid().optional(),
});

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createAdmin(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "dentistfront-api" } },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

function replaceFirstSegment(p: string, seg: string) {
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return p;
  parts[0] = seg;
  return parts.join("/");
}

function extOf(p: string) {
  const i = p.lastIndexOf(".");
  if (i === -1) return "";
  return p.slice(i + 1).toLowerCase();
}

function withExt(p: string, ext: string) {
  const i = p.lastIndexOf(".");
  if (i === -1) return `${p}.${ext}`;
  return `${p.slice(0, i + 1)}${ext}`;
}

function deriveAnnotatedCandidates(path: string) {
  const candidates: string[] = [];
  const startsOriginal = path.startsWith("original/");
  const startsNormalized = path.startsWith("normalized/");
  if (!startsOriginal && !startsNormalized) return candidates;
  const base = replaceFirstSegment(path, "annotated");
  const ext = extOf(base);
  candidates.push(base);
  if (ext !== "png") candidates.push(withExt(base, "png"));
  if (ext !== "webp") candidates.push(withExt(base, "webp"));
  return Array.from(new Set(candidates));
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const bucket = (parsed.data.bucket || DEFAULT_BUCKET).trim();
    const inputPaths = parsed.data.paths?.length
      ? parsed.data.paths
      : parsed.data.path
      ? [parsed.data.path]
      : [];
    if (inputPaths.length === 0) {
      return NextResponse.json({ error: "Provide 'path' or 'paths'." }, { status: 400 });
    }

    const caseId = parsed.data.caseId ?? null;
    const admin = adminClient();

    const annotatedToRemove: string[] = [];
    for (const p of inputPaths) {
      deriveAnnotatedCandidates(p).forEach((ap) => annotatedToRemove.push(ap));
    }

    const allPathsSet = new Set<string>([...inputPaths, ...annotatedToRemove]);
    const allPaths = Array.from(allPathsSet);

    const { data: removed, error: storageErr } = await admin.storage.from(bucket).remove(allPaths);

    let dbQuery = admin.from("case_images").delete().in("storage_path", allPaths);
    if (caseId) dbQuery = dbQuery.eq("case_id", caseId);
    const { data: dbRows, error: dbErr } = await dbQuery.select("id");
    const dbDeleted = Array.isArray(dbRows) ? dbRows.length : 0;

    const warnings: string[] = [];
    if (storageErr) warnings.push(`storage: ${storageErr.message}`);
    if (dbErr) warnings.push(`db: ${dbErr.message}`);

    const result = {
      ok: warnings.length === 0,
      bucket,
      requested: inputPaths,
      alsoRemovedAnnotated: annotatedToRemove,
      removed: removed ?? null,
      dbDeleted,
    };

    if (warnings.length) {
      return NextResponse.json({ ...result, warnings }, { status: 207, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unexpected error" }, { status: 500 });
  }
}
