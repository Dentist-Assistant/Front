// app/api/storage/sign/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_BUCKET = process.env.IMAGE_BUCKET || "cases";
const DEFAULT_TTL = Number(process.env.SIGNED_URL_TTL || "600");
const TTL_MIN = 60;
const TTL_MAX = 604800;

function admin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "dentistfront-api" } },
  });
}

async function ensureBucket(sb: ReturnType<typeof admin>, bucket: string) {
  const { data } = await sb.storage.getBucket(bucket);
  if (!data) {
    const { error } = await sb.storage.createBucket(bucket, { public: false, fileSizeLimit: "50MB" });
    if (error) throw error;
  }
}

function clampTtl(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return DEFAULT_TTL;
  return Math.max(TTL_MIN, Math.min(TTL_MAX, Math.floor(x)));
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

const PostBody = z.object({
  path: z.string().min(1).optional(),
  paths: z.array(z.string().min(1)).optional(),
  bucket: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  try {
    const sb = admin();
    const body = await req.json().catch(() => ({}));
    const parsed = PostBody.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
    }

    const bucket = (parsed.data.bucket || DEFAULT_BUCKET).trim();
    await ensureBucket(sb, bucket);

    if (parsed.data.paths && parsed.data.paths.length > 0) {
      const items: Array<{ path: string; token: string | null; signedUrl?: string; error?: string }> = [];
      for (const p of parsed.data.paths) {
        const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(p);
        items.push({
          path: p,
          token: data?.token || null,
          signedUrl: data?.signedUrl,
          ...(error ? { error: error.message } : {}),
        });
      }
      return NextResponse.json({ bucket, items, method: "PUT" }, { headers: { "Cache-Control": "no-store" } });
    }

    const path = parsed.data.path;
    if (!path) return NextResponse.json({ error: "missing_path_or_paths" }, { status: 400 });

    const { data, error } = await sb.storage.from(bucket).createSignedUploadUrl(path);
    if (error) {
      return NextResponse.json({ error: error.message, bucket, path }, { status: 400 });
    }

    return NextResponse.json(
      { bucket, path, token: data.token, signedUrl: data.signedUrl, method: "PUT" },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "internal_error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const sb = admin();
    const { searchParams } = new URL(req.url);
    const bucket = (searchParams.get("bucket") || DEFAULT_BUCKET).trim();
    const expiresInRaw = searchParams.get("expiresIn") || DEFAULT_TTL;
    const expiresIn = clampTtl(expiresInRaw);
    const path = searchParams.get("path");
    const pathsParam = searchParams.get("paths");

    await ensureBucket(sb, bucket);

    if (!path && pathsParam) {
      let paths: string[] = [];
      try {
        const parsed = JSON.parse(pathsParam);
        if (Array.isArray(parsed)) paths = parsed;
      } catch {
        paths = pathsParam.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (paths.length === 0) return NextResponse.json({ error: "no_paths_provided" }, { status: 400 });

      const items: Array<{ path: string; url: string | null; error?: string }> = [];
      for (const p of paths) {
        const { data, error } = await sb.storage.from(bucket).createSignedUrl(p, expiresIn);
        items.push({ path: p, url: data?.signedUrl || null, ...(error ? { error: error.message } : {}) });
      }
      return NextResponse.json(
        { bucket, expiresIn, items },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!path) return NextResponse.json({ error: "path_required" }, { status: 400 });

    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) {
      return NextResponse.json({ error: error.message, bucket, path }, { status: 400 });
    }

    return NextResponse.json(
      { bucket, path, url: data.signedUrl, expiresIn },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "internal_error" }, { status: 500 });
  }
}
