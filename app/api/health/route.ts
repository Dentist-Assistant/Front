import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mask(v?: string | null) {
  if (!v) return null;
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}

function getAdmin() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET() {
  const admin = getAdmin();

  let db = { reachable: null as boolean | null, error: null as string | null };
  if (admin) {
    const { error } = await admin
      .from("profiles")
      .select("id", { head: true, count: "exact" });
    db = { reachable: !error, error: error ? error.message : null };
  }

  const body = {
    status: "ok",
    now: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid,
    env: {
      supabaseUrlPresent: Boolean(process.env.SUPABASE_URL),
      supabaseAnonPresent: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      supabaseServiceRolePresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
      openaiKeyMasked: mask(process.env.OPENAI_API_KEY),
      openaiKeyLength: (process.env.OPENAI_API_KEY || "").length || null,
      openaiModel: process.env.OPENAI_MODEL || null,
      nodeEnv: process.env.NODE_ENV || null,
      vercelRegion: process.env.VERCEL_REGION || null,
    },
    db,
  };

  return NextResponse.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
