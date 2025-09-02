import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

declare global {
  var __supabaseAdmin: SupabaseClient<Database> | undefined;
}

function assertServer() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin must be used on the server only");
  }
}

function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "dentistfront-admin" } },
  });
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  assertServer();
  if (!global.__supabaseAdmin) {
    global.__supabaseAdmin = createAdminClient();
  }
  return global.__supabaseAdmin;
}

export const supabaseAdmin = getSupabaseAdmin();
