import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TemplatePatchSchema } from "../../../../../lib/schemas/report";

const BodySchema = z.object({
  caseId: z.string().min(1),
  patch: TemplatePatchSchema,
});

function deepMerge(a: any, b: any): any {
  if (b === undefined) return a;
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out: Record<string, any> = { ...a };
    for (const [k, v] of Object.entries(b)) {
      out[k] = deepMerge((a as any)?.[k], v);
    }
    return out;
  }
  return b ?? a;
}

function getBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return null;
  return h.slice(7).trim();
}

export async function POST(req: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: "Server not configured (Supabase env missing)" },
        { status: 500 }
      );
    }

    const token = getBearer(req);
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { caseId, patch } = BodySchema.parse(body);

    const { data: rep, error: repErr } = await admin
      .from("reports")
      .select("id, payload, version")
      .eq("case_id", caseId)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (repErr || !rep)
      return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const mergedPayload = deepMerge(rep.payload ?? {}, patch);

    const { error: upErr } = await admin
      .from("reports")
      .update({ payload: mergedPayload })
      .eq("id", rep.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message || "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reportId: rep.id });
  } catch (e: any) {
    const msg = e?.message || "Unhandled error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
